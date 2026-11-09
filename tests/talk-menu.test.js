'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '../src/renderer/js', file), 'utf8');
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

test('local welcome bags cover at least twenty unique greetings without repeats across refill', async () => {
  const { welcomePicker, WELCOMES } = await import(uri(source('welcome.js')));
  for (const language of ['en', 'es']) {
    assert.ok(WELCOMES[language].length >= 20);
    const pick = welcomePicker(() => 0);
    const first = WELCOMES[language].map(() => pick(language));
    assert.equal(new Set(first).size, first.length);
    assert.notEqual(pick(language), first.at(-1));
  }
});

test('launcher opens synchronously, clamps to screen, hits only circles and forwards the selected mode', async () => {
  const events = {}, handlers = {}, chosen = [], focus = [];
  global.window = { addEventListener: (event, handler) => { events[event] = handler; } };
  const { TalkMenu } = await import(uri(source('talk-menu.js').replace("'./welcome.js'", `'${uri(source('welcome.js'))}'`)));
  const buttons = ['text', 'voice'].map((mode, i) => ({ dataset: { talk: mode }, focus() { assert.fail('Opening the launcher must not preselect a button'); }, setAttribute() {},
    getBoundingClientRect: () => ({ left: i * 76, top: 20, width: 56, height: 56 }) }));
  const greeting = { textContent: '' };
  let menuFocused = 0;
  const el = { focus() { menuFocused++; }, hidden: true, style: {}, offsetWidth: 236, offsetHeight: 120,
    querySelector: selector => selector === 'button' ? buttons[0] : greeting,
    querySelectorAll: () => buttons, contains: () => false,
    addEventListener: (event, handler) => { handlers[event] = handler; } };
  const capri = { wake() {}, head: () => ({ x: 795, top: 15, y: 30 }), view: { w: 800, h: 600 }, hit: () => false };
  const menu = new TalkMenu({ el, capri, host: { focusOverlay: value => focus.push(value) }, language: () => 'en',
    onChoose: (...args) => chosen.push(args) });
  menu.show();
  assert.equal(menu.visible, true); assert.ok(greeting.textContent);
  assert.equal(menuFocused, 1); assert.equal(el.tabIndex, -1);
  const firstGreeting=greeting.textContent;
  menu.show();menu.show();
  assert.equal(menu.visible,true,'Rapid repeat body clicks leave the launcher open');
  assert.equal(greeting.textContent,firstGreeting);
  assert.equal(menuFocused,1,'Repeat clicks must not refocus or release the overlay');
  assert.deepEqual(focus,[true]);
  assert.equal(el.style.left, '554px'); assert.equal(el.style.top, '10px');
  assert.equal(menu.contains(28, 48), true); assert.equal(menu.contains(1, 21), false);
  assert.equal(menu.contains(64, 48), false, 'Gap between circles stays click-through');
  handlers.click({ stopPropagation() {}, target: { closest: () => buttons[1] } });
  assert.equal(menu.visible, false); assert.equal(chosen[0][0], 'voice'); assert.ok(chosen[0][1]);
  assert.deepEqual(focus, [true], 'Opening voice preserves focus so a synthetic blur cannot cancel the microphone');
  menu.toggle(); events.keydown({ key: 'Escape', preventDefault() {} }); assert.equal(menu.visible, false);
  menu.toggle(); capri.dragging = true; menu.place(); assert.equal(menu.visible, false);
  assert.equal(focus.at(-1), true, 'Hiding the launcher for pickup must preserve pointer capture instead of blurring');
  const focusChanges = focus.length;
  capri.dragging = false; capri.fullscreen = true; menu.toggle(); assert.equal(menu.visible, false);
  assert.equal(focus.length, focusChanges, 'Fullscreen does not open or focus the launcher');
});
