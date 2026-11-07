'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src/renderer/js', name), 'utf8');
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('settings queue retains rapid saves, preserves order and recovers after a failed preference', async () => {
  const { SettingsQueue } = await import(uri(source('settings-queue.js')));
  const first = deferred(), started = [], saved = [], errors = [], busy = [];
  const queue = new SettingsQueue({ onResult: value => saved.push(value), onError: error => errors.push(error.message), onBusy: value => busy.push(value) });
  const jobs = [queue.run(async () => { started.push(1); return first.promise; }),
    queue.run(async () => { started.push(2); throw Error('Could not save'); }),
    queue.run(async () => { started.push(3); return 'last preference'; })];
  await tick(); assert.deepEqual(started, [1]); assert.equal(queue.pending, 3);
  first.resolve('first preference'); await Promise.all(jobs);
  assert.deepEqual(started, [1, 2, 3]); assert.deepEqual(saved, ['first preference', 'last preference']);
  assert.deepEqual(errors, ['Could not save']); assert.equal(queue.pending, 0); assert.equal(busy.at(-1), false);
});

test('settings sections render, rapid controls persist, and saving preserves an edited field and scroll', async () => {
  const handlers = {}, saves = [], changes = [], actions = [], classes = new Set(); let renders = 0;
  const pages = ['home', 'appearance', 'sound', 'memory', 'awareness', 'connections', 'updates'];
  const node = () => ({ textContent: '', dataset: {}, addEventListener() {}, setAttribute() {},
    classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, add() {}, remove() {} } });
  const notice = node(), statusbar = node(), version = node(), close = node();
  let remote = { config: { volume: .7, scale: .6, visible: true, langSetting: 'auto', privacy: { retentionDays: 90 },
    ttsEngine: 'windows', ttsDevice: 'cpu', ttsPython: '', ttsReference: '', ttsReferenceText: '', codexExecutable: '', codexModel: '', codexEffort: 'medium',
    wakeWordEnabled: true, autonomyIntervalSeconds: 90 }, runtime: { version: '0.4.0', currentSource: true, build: 'test', root: 'C:\\Capri' },
    displays: [{ id: 1, width: 1920, height: 1080 }], integration: { lastSeen: null }, startup: false };
  const nav = pages.map(page => ({ ...node(), dataset: { page } }));
  const content = { dataset: {}, scrollTop: 0, offsetWidth: 400, classList: node().classList,
    contains: el => Boolean(el?.inside),
    set innerHTML(value) { this.markup = value; renders++; }, get innerHTML() { return this.markup; },
    querySelectorAll() { return [{ inside: true, type: 'text', dataset: { key: 'ttsPython' }, value: '',
      focus() { document.activeElement = this; }, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } }]; } };
  global.document = { activeElement: null, documentElement: { dataset: {} }, body: { setAttribute() {}, removeAttribute() {} },
    querySelector: selector => ({ '#content': content, '#notice': notice, '.statusbar': statusbar, '#version': version, '#close': close })[selector],
    querySelectorAll: () => nav, addEventListener: (event, handler) => { handlers[event] = handler; } };
  global.window = { settingsHost: { state: async () => remote, onUpdate() {}, action: async (name, value) => { actions.push([name, value]); return { state: remote }; },
    patch: patch => { const job = deferred(); changes.push(patch); saves.push(job); return job.promise.then(() => {
      remote = { ...remote, config: { ...remote.config, ...patch } }; return remote;
    }); } } };
  await import(uri(source('settings.js').replace("'./settings-queue.js'", `'${uri(source('settings-queue.js'))}'`)));
  for (const page of pages) {
    handlers.click({ target: { closest: selector => selector.startsWith('nav ') ? { dataset: { page } } : null } });
    assert.equal(content.dataset.page, page); assert.match(content.innerHTML, /id="settings-title"/);
    assert.doesNotMatch(content.innerHTML, /undefined/);
  }
  handlers.click({ target: { closest: selector => selector.startsWith('nav ') ? { dataset: { page: 'sound' } } : null } });
  const before = renders;
  handlers.change({ target: { dataset: { key: 'volume' }, type: 'range', value: '20' } });
  handlers.change({ target: { dataset: { key: 'wakeWordEnabled' }, type: 'checkbox', checked: false } });
  await tick(); assert.equal(changes.length, 1);
  saves[0].resolve(); await tick(); assert.equal(changes.length, 2); assert.equal(renders, before, 'Do not flash intermediate settings while later changes are pending');
  saves[1].resolve(); await tick();
  assert.deepEqual(changes, [{ volume: .2 }, { wakeWordEnabled: false }]); assert.equal(remote.config.wakeWordEnabled, false);
  document.activeElement = { inside: true, type: 'text', dataset: { key: 'ttsPython' }, value: 'C:\\Voice\\python.exe', selectionStart: 4, selectionEnd: 9 };
  content.scrollTop = 210;
  handlers.change({ target: { dataset: { key: 'volume' }, type: 'range', value: '40' } });
  await tick(); saves[2].resolve(); await tick();
  assert.equal(document.activeElement.value, 'C:\\Voice\\python.exe'); assert.equal(document.activeElement.selectionStart, 4);
  assert.equal(document.activeElement.selectionEnd, 9); assert.equal(content.scrollTop, 210);
  assert.equal(notice.textContent, 'Saved.');
  handlers.change({ target: { dataset: { key: 'volume' }, type: 'range', value: '60' } });
  const startup = { dataset: { actionSwitch: 'startup' }, type: 'checkbox', checked: true };
  handlers.change({ target: startup }); startup.checked = false; handlers.change({ target: startup });
  await tick(); assert.equal(actions.length, 0);
  saves[3].resolve(); await tick();
  assert.deepEqual(actions, [['startup', true], ['startup', false]], 'Queued switches capture each value when clicked');
});
