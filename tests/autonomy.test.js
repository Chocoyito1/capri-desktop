'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Autonomy, observationTools } = require('../src/main/autonomy');
function fixture() {
  let at = 0, observations = 0, calls = 0;
  const config = {}, said = [], decisions = [];
  const brain = { cancel() {}, chat: async (_text, _delta, _progress, options) => { calls++; decisions.push(options); return JSON.stringify({ speak: true, message: 'That layout is getting crowded. Want help organizing it?', topic: 'layout' }); } };
  const context = { presentation: { mood: 'curious', chatOpen: false } };
  const agent = new Autonomy({ settings: () => config, brain, observe: async () => { observations++; return { data: { foreground: { app: 'editor' } }, image: 'data:image/jpeg;base64,YQ==' }; },
    context: () => context, idle: () => true, notify: t => said.push(t), now: () => at });
  return { agent, brain, config, context, said, decisions, tick: (ms = 360000) => at += ms, counts: () => ({ observations, calls }) };
}
test('autonomy uses screen/personality evidence with structured silence decisions, without polluting chat history', async () => {
  const f = fixture(); await f.agent.run('foreground-change');
  assert.equal(f.said.length, 1); assert.equal(f.decisions[0].recordHistory, false);
  assert.equal(f.decisions[0].images.length, 1); assert.equal(f.decisions[0].context.current.presentation.mood, 'curious');
  f.tick(); await f.agent.run('idle'); assert.equal(f.said.length, 1, 'Same topic must not be repeated');
});
test('game, hidden, privacy, active chat and foreground work suppress observation and inference', async () => {
  for (const mode of ['game', 'hidden', 'privacy', 'disabled', 'chat', 'work']) {
    const f = fixture();
    if (mode === 'game') f.config.gamingMode = true;
    if (mode === 'hidden') f.config.visible = false;
    if (mode === 'privacy') f.config.privacy = { contextEvents: false };
    if (mode === 'disabled') f.config.autonomyEnabled = false;
    if (mode === 'chat') f.context.presentation.chatOpen = true;
    if (mode === 'work') f.agent.idle = () => false;
    await f.agent.run('idle'); assert.deepEqual(f.counts(), { observations: 0, calls: 0 }, mode);
  }
});
test('foreground cancellation suppresses late generated speech and errors produce no canned fallback', async () => {
  const f = fixture(); let finish;
  f.brain.chat = () => new Promise(resolve => { finish = resolve; });
  const pending = f.agent.run('idle'); await new Promise(r => setImmediate(r));
  f.agent.cancel(); finish(JSON.stringify({ speak: true, message: 'Late', topic: 'late' }));
  await pending; assert.equal(f.said.length, 0); assert.equal(f.agent.busy, false);
  f.tick(); f.brain.chat = async () => { throw Error('offline'); };
  await f.agent.run('idle'); assert.equal(f.said.length, 0);
});
test('bounded attempts, cooldown and silence prevent a background inference loop', async () => {
  const f = fixture(); f.brain.chat = async () => JSON.stringify({ speak: false, message: '', topic: '' });
  await f.agent.run('idle'); await f.agent.run('idle'); assert.equal(f.counts().observations, 1);
  for (let i = 0; i < 20; i++) { f.tick(91000); await f.agent.run('idle'); }
  assert.equal(f.counts().observations, 12); assert.equal(f.said.length, 0);
  f.tick(3600000); await f.agent.run('idle'); assert.equal(f.counts().observations, 13);
});
test('the background tool boundary rejects commands and mutations even when the model asks for them', async () => {
  const calls = [];
  const tools = observationTools({ specs: () => ['capri_screen', 'capri_context', 'capri_input', 'capri_approval', 'capri_memory_change', 'capri_memory_lookup'].map(name => ({ name })),
    run: name => { calls.push(name); return { observed: true }; }, endTurn() {} });
  assert.deepEqual(tools.specs().map(row => row.name), ['capri_screen', 'capri_context', 'capri_memory_lookup']);
  for (const name of ['capri_input', 'capri_approval', 'capri_memory_change', 'shell']) assert.throws(() => tools.run(name, {}, {}), /Background actions/);
  assert.deepEqual(calls, []);
  assert.deepEqual(tools.run('capri_screen', {}, {}), { observed: true });
});
