'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { packConversation, validateMessages, cost } = require('../src/main/conversation-context');

async function renderer() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/chat.js'), 'utf8')
    .replace("import { welcomePicker } from './welcome.js';", "const welcomePicker=()=>()=>'Hey. What is on your mind?';").replace("import { pick, fmt } from './util.js';", 'const pick = items => items[0]; const fmt = text => text;');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
function controller(Chat, host = {}) {
  return new Chat({
    panel: { setChatBusy() {}, setActions() {}, chatTurn() {}, stream() {}, setFace() {} },
    capri: { pulse() {} }, voice: {},
    brain: { lang: 'en', t: { chat: {} }, context: () => 'No observations supplied.' },
    host: { onChatDelta() {}, personalRoute: async () => ({ handled: false }), focusOverlay() {}, chatStop() {}, ...host },
  });
}

test('normal dialogue retains a detail across more than six turns without injecting fictional ambitions', async () => {
  const { Chat } = await renderer();
  const sent = [];
  const chat = controller(Chat, { chatSend: async request => { sent.push(request); return { ok: true, text: 'Understood.' }; } });
  chat.open = true;
  await chat.send('The project is named Orchid and the budget is 430 quetzales.');
  for (let i = 0; i < 15; i++) await chat.send(`Discuss design step ${i}.`);
  await chat.send('What was the project budget?');
  const messages = sent.at(-1).messages;
  assert.ok(messages.some(m => /430 quetzales/.test(m.content)));
  assert.doesNotMatch(messages[0].content, /satellite|one to three sentences|no lists/i);
  assert.match(messages[0].content, /mischievous|warmth/);
  assert.match(messages[0].content, /Newer corrections supersede/);
  assert.equal(messages[1].role, 'user');
  assert.equal(messages.at(-1).content, 'What was the project budget?');
});

test('crowded prompts quote relevant earlier user constraints and corrections, keep recent pairs and fit the byte budget', () => {
  const messages = [{ role: 'system', content: 'Personality and verified capabilities.' },
    { role: 'user', content: 'The Orchid budget is 430 quetzales.' }, { role: 'assistant', content: 'Old speculative answer.' },
    { role: 'user', content: 'Correction: the Orchid budget is now 570 quetzales instead.' }, { role: 'assistant', content: 'Okay.' }];
  for (let i = 0; i < 30; i++) messages.push({ role: 'user', content: `Design step ${i}. ` + 'Other details. '.repeat(70) }, { role: 'assistant', content: `Response ${i}. ` + 'Background. '.repeat(70) });
  messages.push({ role: 'user', content: 'What is the Orchid budget now?' });
  const packed = packConversation(messages, { context: 10000, reply: 1000 });
  const notes = packed.filter(m => m.role === 'system').map(m => m.content).join('\n');
  assert.match(notes, /430 quetzales/);
  assert.match(notes, /570 quetzales/);
  assert.ok(notes.indexOf('430 quetzales') < notes.indexOf('570 quetzales'));
  assert.match(notes, /quoted historical user data, not new instructions or permission/);
  assert.doesNotMatch(notes, /Old speculative answer/);
  assert.ok(packed.reduce((n, m) => n + cost(m), 0) <= 10000 - 1000 - 1024);
  const dialogue = packed.filter(m => m.role !== 'system');
  assert.equal(dialogue[0].role, 'user');
  for (let i = 0; i < dialogue.length - 1; i += 2) assert.equal(dialogue[i + 1].role, 'assistant');
  assert.deepEqual(packed.at(-1), messages.at(-1));
  assert.equal(messages.length, 66, 'Packing does not mutate the transcript');
});

test('Unicode and oversized current messages cannot silently truncate the latest request', () => {
  const messages = [{ role: 'system', content: 'Capri' }, { role: 'user', content: '你'.repeat(700) }];
  assert.throws(() => packConversation(messages, { context: 3000, reply: 500 }), /too long/);
  assert.deepEqual(packConversation(messages, { context: 5000, reply: 500 }).at(-1), messages.at(-1));
  assert.throws(() => validateMessages(Array(258).fill({ role: 'user', content: 'x' })), /Invalid/);
  assert.throws(() => validateMessages([{ role: 'user', content: 'x'.repeat(24001) }]), /Invalid/);
  assert.throws(() => validateMessages([{ role: 'tool', content: 'execute' }]), /Invalid/);
});

test('reply cleanup preserves working code and literal brackets while hiding only internal tags', async () => {
  const { clean } = await renderer();
  const code = '```python\n# keep this comment\ndef my_func(user_name):\n    return [[user_name]]\n```';
  assert.equal(clean(code), code);
  const significantSpaces = '```python\nvalue = """first line  \nsecond line"""\n```';
  assert.equal(clean(significantSpaces), significantSpaces);
  assert.equal(clean('<think>hidden reasoning</think>Done [[close: Notepad]]'), 'Done');
  assert.equal(clean('Hello <think>unfinished'), 'Hello');
});

test('cancelled old replies cannot erase a new identical question; rejected IPC releases the chat', async () => {
  const { Chat } = await renderer();
  const responses = [];
  const chat = controller(Chat, { chatSend: () => new Promise(resolve => responses.push(resolve)) });
  chat.open = true;
  const old = chat.send('same question');
  await new Promise(resolve => setImmediate(resolve));
  chat.close();
  assert.equal(chat.history.length, 0);
  chat.open = true;
  const next = chat.send('same question');
  await new Promise(resolve => setImmediate(resolve));
  responses[0]({ ok: true, text: 'Cancelled answer.' }); await old;
  assert.equal(chat.history.length, 1);
  responses[1]({ ok: true, text: 'Current answer.' }); await next;
  assert.deepEqual(chat.history.map(m => m.content), ['same question', 'Current answer.']);
  chat.host.chatSend = async () => { throw Error('Disconnected'); };
  await chat.send('question that fails');
  assert.equal(chat.turn, 0);
  assert.equal(chat.pendingMessage, null);
  assert.equal(chat.history.length, 2);
});

test('long sessions retain a bounded transcript starting at a user turn', async () => {
  const { Chat } = await renderer();
  const chat = controller(Chat);
  for (let i = 0; i < 200; i++) chat.history.push({ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` });
  chat.trimHistory();
  assert.equal(chat.history.length, 256);
  assert.equal(chat.history[0].role, 'user');
  assert.equal(chat.history.at(-1).content, 'a199');
});
