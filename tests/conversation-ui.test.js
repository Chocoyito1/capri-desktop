'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

test('voice and typing layouts preserve the draft and expose the correct accessible composer', async () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/renderer/js/panel.js'), 'utf8')
    .replace("import { clamp, ease, reducedMotion } from './util.js';", 'const clamp=x=>x,ease=x=>x,reducedMotion={matches:true};')
    .replace("import { Portrait } from './portrait.js';", 'class Portrait {}');
  const { Panel } = await import(uri(code));
  const panel = Object.create(Panel.prototype), classes = new Set();
  panel.el = { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
  panel.current = { chat: { placeholder: 'Type a message...', voicePlaceholder: 'Say something...', typingLabel: 'Switch to typing' } };
  panel.chatInput = { value: 'Keep this unfinished thought', setAttribute(key, value) { this[key] = value; } };
  panel.chatTyping = { setAttribute(key, value) { this[key] = value; } };
  panel.place = () => {};
  panel.setConversationMode('voice');
  assert.equal(classes.has('is-voice'), true); assert.equal(panel.chatTyping.hidden, false);
  assert.equal(panel.chatInput['aria-label'], 'Say something...');
  panel.setConversationMode('text');
  assert.equal(classes.has('is-voice'), false); assert.equal(panel.chatTyping.hidden, true);
  assert.equal(panel.chatInput['aria-label'], 'Type a message...');
  assert.equal(panel.chatInput.value, 'Keep this unfinished thought');
});

test('both conversation exits stop the mic immediately, preserve card height and finish before hiding the voice session', async () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/renderer/js/panel.js'), 'utf8')
    .replace("import { clamp, ease, reducedMotion } from './util.js';", 'const clamp=x=>x,ease=x=>x,reducedMotion={matches:false};')
    .replace("import { Portrait } from './portrait.js';", 'class Portrait {}');
  const { Panel } = await import(uri(code));
  for (const mode of ['text', 'voice']) {
    const panel = Object.create(Panel.prototype), classes = new Set(['is-entering']);
    let cancelled = 0, hidden = 0; const styles = {};
    panel.el = { hidden: false, offsetHeight: 180, style: { setProperty: (key, value) => { styles[key] = value; } },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
    panel.current = { chat: { mode }, onLeave() { assert.equal(panel.leaving, true); } };
    panel.animatedPortrait = { setActive() {} };
    panel.onSpeechCancel = () => { cancelled++; panel.el.offsetHeight = 100; };
    panel.onHidden = () => { hidden++; };
    panel.hide();
    assert.equal(cancelled, 1); assert.equal(hidden, 0); assert.equal(panel.el.hidden, false);
    assert.equal(styles['--closing-height'], '180px');
    assert.equal(classes.has('is-entering'), false); assert.equal(classes.has('is-leaving'), true);
    await new Promise(resolve => setTimeout(resolve, 210));
    assert.equal(panel.el.hidden, true); assert.equal(hidden, 1);
  }
});
