'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ProactiveConversation, validate } = require('../src/main/proactive-conversation');
const { packConversation } = require('../src/main/conversation-context');
const { CHARACTER_VOICE, PERSONALITY_SUMMARY } = require('../src/main/personality');
const { registry } = require('../src/main/capabilities');
function fixture(t, options = {}) {
  let now = 1_000_000, state, cfg = { lang: 'en', privacy: { memoryEnabled: true } }, free = true;
  let calls = [], notifications = [], observed = 0, recalls = 0, count = 0;
  let infer = async () => JSON.stringify({ speak: true, message: `Fresh thought number ${++count}: what imaginary invention would you build?` });
  const journal = { conversationState(value) { if (value !== undefined) state = structuredClone(value); return state; },
    allowed: () => true, list: () => [{ id: 5, created_at: 10, status: 'open', next_step: 'ask_later', subject: 'code', question: 'Would a second pair of eyes help?' }] };
  const dependencies = { journal, settings: () => cfg, now: () => now, random: () => 0,
    observe: async () => { observed++; return { foreground: { app: 'Code', title: 'An untrusted window title' } }; },
    memories: () => { recalls++; return [{ id: 9, text: 'I like making games.' }]; },
    models: async () => ['qwen3.5:9b'], infer: async request => { calls.push(request); return infer(request); },
    canRun: () => free, notify: text => { notifications.push(text); return true; }, ...options };
  let engine = new ProactiveConversation(dependencies);
  t.after(() => engine.close());
  return { get engine() { return engine; }, calls, notifications,
    get observed() { return observed; }, get recalls() { return recalls; }, get state() { return state; },
    advance(ms = 5 * 60_000) { now += ms; }, config(value) { cfg = value; }, free(value) { free = value; },
    infer(value) { infer = value; }, restart() { engine.close(); engine = new ProactiveConversation(dependencies); } };
}
const source = request => JSON.parse(request.messages[1].content).selected.source;
test('waits 5–15 minutes, reserves each opportunity durably and has no restart burst', async t => {
  const f = fixture(t);
  assert.equal(f.engine.status().nextAt, 1_300_000);
  assert.equal(await f.engine.run(), false); assert.equal(f.calls.length, 0);
  f.advance(); assert.equal(await f.engine.run(), true);
  assert.ok(f.calls[0].messages[0].content.includes(CHARACTER_VOICE),
    'Spontaneous conversation must receive the same character voice as foreground chat.');
  assert.equal(registry().personality, PERSONALITY_SUMMARY);
  assert.equal(await f.engine.run(), false); assert.equal(f.calls.length, 1);
  const due = f.state.nextAt; f.restart(); assert.equal(f.engine.status().nextAt, due);
  f.advance(60 * 60_000); f.restart();
  assert.equal(await f.engine.run(), false);
  const slow = fixture(t, { random: () => 1 });
  assert.equal(slow.engine.status().nextAt, 1_900_000);
});
test('rotates activity, permitted memory, open inquiry and smalltalk', async t => {
  const f = fixture(t);
  // Distinct output is needed; topic-level deduplication is separate from text deduplication.
  const messages = ['Code is on screen. Building something interesting?', 'Still enjoying making games?',
    'Would you like a second pair of eyes, or just company?', 'Imagine a city where every door leads to a different season.'];
  f.infer(async () => JSON.stringify({ speak: true, message: messages.shift() }));
  for (let i = 0; i < 4; i++) { f.advance(); assert.equal(await f.engine.run(), true); }
  assert.deepEqual(f.calls.map(source), ['activity', 'memory', 'inquiry', 'smalltalk']);
  assert.equal(f.notifications.length, 4);
  assert.doesNotMatch(JSON.stringify(f.state), /Code|making games|eyes|city|untrusted window/i);
});
test('uses general curiosity with context and memory disabled without reading either source', async t => {
  const f = fixture(t, { journal: { conversationState: () => null, allowed: () => false, list: () => { throw Error('must not read'); } } });
  f.config({ privacy: { contextForeground: false, contextEvents: false, memoryEnabled: false } });
  f.advance(); assert.equal(await f.engine.run(), true);
  assert.equal(source(f.calls[0]), 'smalltalk');
  assert.equal(f.observed, 0); assert.equal(f.recalls, 0);
});
test('does not interrupt busy, hidden, gaming, disabled or unavailable sessions', async t => {
  const f = fixture(t); f.advance(); f.free(false);
  assert.equal(await f.engine.run(), false); f.free(true);
  for (const cfg of [{ gamingMode: true }, { visible: false }, { proactiveEnabled: false }, { agentEnabled: false }]) {
    f.config(cfg); assert.equal(await f.engine.run(), false);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.observed, 0);
});
test('never reads disabled memory recall or window titles', async t => {
  const f = fixture(t); f.config({ privacy: { memoryEnabled: true, memoryRecall: false, contextTitles: false } });
  f.advance(); assert.equal(await f.engine.run(), true);
  assert.equal(f.recalls, 0);
  assert.equal(JSON.parse(f.calls[0].messages[1].content).selected.title, '');
});
test('interaction cancels late results and resets the next opportunity', async t => {
  const f = fixture(t); let finish;
  f.infer(() => new Promise(resolve => { finish = resolve; }));
  f.advance(); const work = f.engine.run(); await new Promise(resolve => setImmediate(resolve));
  f.advance(30_000); f.engine.touch();
  finish(JSON.stringify({ speak: true, message: 'This late result must never be shown.' }));
  assert.equal(await work, false); assert.equal(f.notifications.length, 0);
  assert.equal(f.engine.status().nextAt, 1_630_000);
});

test('source permission changes during collection or inference discard the pending conversation', async t => {
  for (const stage of ['collection', 'inference']) {
    let release;
    const f = fixture(t, stage === 'collection' ? { observe: () => new Promise(resolve => { release = resolve; }) } : {});
    if (stage === 'inference') f.infer(() => new Promise(resolve => { release = resolve; }));
    f.advance(); const work = f.engine.run(); await new Promise(resolve => setImmediate(resolve));
    f.config({ privacy: { contextForeground: false, memoryEnabled: false } });
    release(stage === 'collection' ? { foreground: { app: 'Code' } }
      : JSON.stringify({ speak: true, message: 'This uses a revoked source.' }));
    assert.equal(await work, false);
    assert.equal(f.notifications.length, 0);
    if (stage === 'collection') assert.equal(f.calls.length, 0);
  }
});
test('silence, malformed output and errors still wait a full new interval', async t => {
  for (const infer of [async () => '{broken', async () => JSON.stringify({ speak: false, message: '' }), async () => { throw Error('offline'); }]) {
    const f = fixture(t); f.infer(infer); f.advance();
    assert.equal(await f.engine.run(), false); assert.equal(await f.engine.run(), false);
    assert.equal(f.calls.length, 1); assert.equal(f.notifications.length, 0);
  }
});
test('suppresses repeated messages across restarts', async t => {
  const f = fixture(t);
  f.infer(async () => JSON.stringify({ speak: true, message: 'Have you made anything fun lately?' }));
  f.advance(); assert.equal(await f.engine.run(), true);
  f.restart(); f.advance(); assert.equal(await f.engine.run(), false);
  assert.equal(f.notifications.length, 1);
});
test('validates generated messages and preserves an opening when packing its first reply', () => {
  for (const value of [{ speak: true, message: '' }, { speak: true, message: 'x'.repeat(321) },
    { speak: true, message: 'hi', tool: 'shell' }, { speak: 'true', message: 'hi' }]) assert.throws(() => validate(value));
  const messages = [{ role: 'system', content: 'Be helpful.' },
    { role: 'assistant', content: 'What kind of game would you like to build?' }, { role: 'user', content: 'A platformer!' }];
  assert.deepEqual(packConversation(messages), messages);
});
