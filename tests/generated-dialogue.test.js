'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '../src/renderer/js', file), 'utf8');
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

test('normal companion status and social events request generated dialogue without showing fixed lines', async () => {
  const { Brain } = await import(uri(source('brain.js').replace("from './lines.js'", `from '${uri(source('lines.js'))}'`)
    .replace("from './util.js'", `from '${uri(source('util.js').replace("matchMedia('(prefers-reduced-motion: reduce)')", '({ matches: false })'))}'`)));
  const events = [], panels = [];
  const brain = new Brain({ generatedDialogue: true, capri: {}, voice: {}, mission: {},
    panel: { say: message => panels.push(message) }, host: { companionEvent: reason => events.push(reason) } });
  brain.say('idle', 'Old catchphrase'); brain.say('done', 'Same completion line');
  assert.equal(panels.length, 0); assert.deepEqual(events, ['external-task', 'external-task']);
  let chats = 0; brain.onTalk = () => chats++; brain.status(); assert.equal(chats, 1);
  brain.say('error', 'Scripted error quip', null, { quote: 'Actual failure receipt' });
  assert.equal(panels[0].line, 'Actual failure receipt');
});
test('chat greets instantly without inference and routes actual gestures to Codex', async () => {
  const { Chat } = await import(uri(source('chat.js').replace("import { welcomePicker } from './welcome.js';", "const welcomePicker=()=>()=>'Hey. What is on your mind?';").replace("import { pick, fmt } from './util.js';", 'const pick=x=>x[0],fmt=x=>x;')));
  const events = [], lines = [];
  let current;
  const chat = new Chat({ capri: { wake() {}, perform() {}, towardCenter: () => 1, pulse() {}, setChatThinking() {},
    companion: { mood: 'playful', interact() {}, request() { assert.fail('Normal gestures must use AI tool routing'); } } },
    panel: { chatInput: { focus() {} }, say: message => { current = message; return true; }, setChatBusy() {}, setActions() {}, chatTurn() {},
      stream: text => lines.push(text), setFace() {} }, voice: {},
    brain: { generatedDialogue: true, t: { chat: { hello: ['Fixed greeting'], again: ['Another fixed greeting'] } } },
    host: { onChatDelta() {}, chatStatus: async () => ({ ok: true, model: 'codex' }), focusOverlay() {},
      companionState() {}, companionEvent: reason => events.push(reason), personalRoute: async () => ({ handled: false }),
      chatSend: async request => { assert.equal(request.messages.at(-1).content, 'wave'); return { ok: true, text: 'A fresh AI response to your request.' }; } } });
  chat.persona = () => '';
  await chat.start(); assert.ok(current.line); assert.deepEqual(events, []); assert.equal(current.activity, undefined);
  await chat.send('wave'); assert.equal(lines.at(-1), 'A fresh AI response to your request.');
});
