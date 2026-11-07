'use strict';
// Regression tests for the November 2026 code audit fixes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActionAgent } = require('../src/main/action-agent');
const { DesktopTools } = require('../src/main/desktop-tools');
const { overlayPatch } = require('../src/main/settings-policy');
const { unpack } = require('../src/main/speech-runtime');

function launcher(shortcuts = () => [{ label: 'Firefox', file: 'C:\\Apps\\Firefox.lnk' }]) {
  const opened = [];
  const desktop = new DesktopTools({ openPath: async file => { opened.push(file); return ''; }, shortcuts, executables: () => [],
    native: { desktopApps: () => [] } });
  const runner = new ActionAgent({ settings: () => ({ agentEnabled: true, desktopActions: true }), desktop, web: {}, browser: { stop() {} },
    models: async () => { throw Error('No model should be needed.'); }, infer: async () => '{}' });
  return { runner, desktop, opened };
}

test('a bare app name asked as a question does not launch it; the shorthand and explicit requests still do', async () => {
  const f = launcher();
  for (const input of ['calculator?', 'Paint?', 'firefox?', 'firefox ?']) {
    assert.equal(f.runner.willHandle(input), false, input);
    assert.equal(await f.runner.route(input), null, input);
  }
  assert.deepEqual(f.opened, []);
  for (const input of ['firefox', 'open firefox?', '/do firefox?']) assert.equal((await f.runner.route(input)).task, true, input);
  assert.equal(f.opened.length, 3);
});

test('a questioning app name still answers a pending app-choice question', async () => {
  const f = launcher();
  assert.match((await f.runner.route('open my browser')).text, /Which browser/);
  await f.runner.route('firefox?');
  assert.deepEqual(f.opened, ['C:\\Apps\\Firefox.lnk']);
});

test('message routing reuses the Start menu catalog; explicit launches rescan it', async () => {
  let scans = 0;
  const f = launcher(() => { scans++; return [{ label: 'Firefox', file: 'C:\\Apps\\Firefox.lnk' }]; });
  for (const input of ['hello', 'firefox is great', 'what is new?']) f.runner.willHandle(input);
  f.desktop.evidence(); f.desktop.matchName('Firefox');
  assert.equal(scans, 1);
  await f.desktop.open('Firefox');
  assert.equal(scans, 2, 'an explicit launch must see newly installed apps');
});

test('the overlay may only change its visibility and welcome flags', () => {
  assert.deepEqual(overlayPatch({ visible: true, welcomed: true }), { visible: true, welcomed: true });
  for (const input of [{ gamingMode: true }, { desktopActions: true }, { agentEnabled: false }, { chatModel: 'x' },
    { privacy: { memoryEnabled: true } }, { visible: 'yes' }, null, [], 'visible']) assert.throws(() => overlayPatch(input));
});

test('closing an app ignores unrelated background processes with the same name', async t => {
  const native = require('../src/main/native-windows');
  const saved = { desktopApps: native.desktopApps, processRows: native.processRows, forceClose: native.forceClose };
  t.after(() => Object.assign(native, saved));
  if (process.platform !== 'win32') return t.skip('Windows only');
  const apps = require('../src/main/apps');
  native.desktopApps = () => [{ name: 'chrome', process: 'chrome', label: 'Chrome', ids: [10], handles: [1] }];
  native.forceClose = () => {};
  native.processRows = () => [{ id: 22, name: 'chrome' }, { id: 23, name: 'chrome' }];
  assert.deepEqual(await apps.close('chrome', { force: true }), { running: false });
  native.processRows = () => [{ id: 10, name: 'chrome' }];
  assert.deepEqual(await apps.close('chrome', { force: true }), { running: true });
});

test('speech archives are extracted by Windows tar in a separate process, into the bin folder', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-unpack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const bin = path.join(dir, 'bin');
  await unpack(path.join(dir, 'a.zip'), bin, { systemRoot: 'C:\\Windows', run: (file, args, options, done) => { calls.push({ file, args, options }); done(null); } });
  assert.ok(fs.statSync(bin).isDirectory());
  assert.equal(calls[0].file, path.join('C:\\Windows', 'System32', 'tar.exe'));
  assert.deepEqual(calls[0].args, ['-xf', path.join(dir, 'a.zip'), '-C', bin]);
  assert.equal(calls[0].options.windowsHide, true);
  await assert.rejects(unpack('a.zip', bin, { run: (_f, _a, _o, done) => done(Error('bad entry')) }), /speech-download-failed/);
});

const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Codex cannot turn a bare app question into a launch or a confirmation', async () => {
  const { CodexTools } = require('../src/main/codex-tools');
  const f = launcher();
  const tools = new CodexTools({ settings: () => ({}), actions: f.runner,
    confirm: () => assert.fail('A question must not ask to launch an app') });
  await assert.rejects(tools.run('capri_desktop_step', { tool: 'open_app', query: 'Firefox', index: 0, browser: '' },
    { text: 'Firefox?', check() {}, signal: new AbortController().signal }), /not a request to launch/);
  assert.deepEqual(f.opened, []);
});

test('catalog refreshes after its TTL and launch sees newly installed apps immediately', async () => {
  let now = 0, scans = 0;
  let rows = [{ label: 'Firefox', file: 'C:\\Apps\\Firefox.lnk' }];
  const desktop = new DesktopTools({ now: () => now, shortcuts: () => { scans++; return rows; }, executables: () => [],
    openPath: async () => '', native: { desktopApps: () => [{ name: 'New App' }] } });
  assert.equal(desktop.matchName('New App'), null);
  rows = [...rows, { label: 'New App', file: 'C:\\Apps\\New.lnk' }];
  assert.equal(desktop.matchName('New App'), null);
  assert.equal((await desktop.open('New App')).launchRequested, true);
  assert.equal(scans, 2);
  now = 30000; desktop.catalog(); assert.equal(scans, 3);
});

test('an unreadable Start menu shortcut does not hide readable apps', () => {
  const root = path.join('C:\\Profile', 'Microsoft/Windows/Start Menu/Programs');
  const module = { exports: {} };
  const fakeFs = {
    existsSync: () => true,
    readdirSync: () => ['Broken.lnk', 'Firefox.lnk'].map(name => ({ name, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true })),
    realpathSync: file => { if (file.endsWith('Broken.lnk')) throw Error('Access denied'); return file; },
  };
  vm.runInNewContext(source('src/main/desktop-tools.js'), { module, process: { env: { APPDATA: 'C:\\Profile' } },
    require: name => name === 'node:fs' ? fakeFs : name === './web-tools' ? {} : require(name) });
  const rows = module.exports.installedShortcuts();
  assert.equal(rows.length, 1); assert.equal(rows[0].label, 'Firefox'); assert.equal(rows[0].file, path.join(root, 'Firefox.lnk'));
});

test('a transient native window error does not stop subsequent geometry updates', () => {
  const module = { exports: {} }; let tick, cleared = 0, reads = 0, updates = 0;
  vm.runInNewContext(source('src/main/windows.js'), { module, process: { platform: 'win32' },
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => cleared++,
    require: name => name === 'electron' ? { screen: { screenToDipRect: (_win, rect) => rect } }
      : { geometry: () => { if (++reads === 1) throw Error('Display transition'); return { fg: 1, wins: [{ id: 1, x: 0, y: 0, w: 400, h: 300 }] }; } },
  });
  const watcher = module.exports.startWindowWatch({ overlay: { getNativeWindowHandle: () => Buffer.alloc(8),
    isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }) }, onUpdate: () => updates++ });
  assert.equal(cleared, 0); tick(); assert.equal(updates, 1); watcher.stop(); assert.equal(cleared, 1);
});

function applySettings(patch) {
  const calls = [];
  const service = name => ({ cancel: () => calls.push(name), reset: () => calls.push(name + ':reset') });
  const state = { windowTracking: true, privacy: {} };
  const main = source('src/main/main.js');
  const code = main.slice(main.indexOf('function updateConfig(patch) {'), main.indexOf('\nfunction settingsState()'));
  vm.runInNewContext(code + '\nupdateConfig(patch);', { patch, Object,
    settingsRequests: service('settings'), tts: service('tts'), speech: service('speech'), agent: service('agent'),
    memoryRequests: service('memory'), requests: service('tasks'), brain: service('codex'), decisionBrain: service('decisions'),
    permissions: p => p, config: { load: () => state, save: p => Object.assign(state, p) },
    pcContext: { eventSnapshot() {} }, overlay: null, memoryStore: null, goalStore: null, rendererConfig: () => state,
    fitOverlay() {}, watchWindows() {}, rebuildTray() {},
  });
  return calls;
}
test('cosmetic settings preserve Codex turns and memory reviews; policy changes revoke affected work', () => {
  for (const patch of [{ scale: 0.8 }, { visible: true }, { idleAnimations: false }, { displayId: 7 }]) assert.deepEqual(applySettings(patch), []);
  assert.deepEqual(applySettings({ volume: 0.3 }), ['tts']);
  assert.deepEqual(applySettings({ visible: false }), ['speech', 'tts']);
  for (const patch of [{ privacy: { memoryRecall: false } }, { gamingMode: true }, { codexModel: 'new-model' }]) {
    const calls = applySettings(patch);
    for (const name of ['agent', 'tasks', 'memory', 'codex', 'codex:reset', 'decisions']) assert.ok(calls.includes(name), name);
  }
  const desktop = applySettings({ desktopActions: false });
  assert.ok(desktop.includes('codex')); assert.ok(desktop.includes('tasks'));
  assert.ok(!desktop.includes('memory'));
});

test('memory review replaces an open Codex chat and can return to Codex without losing renderer history', async () => {
  const code = source('src/renderer/js/chat.js').replace("import { welcomePicker } from './welcome.js';", "const welcomePicker=()=>()=>'Hey. What is on your mind?';").replace("import { pick, fmt } from './util.js';", 'const pick=x=>x[0],fmt=x=>x;');
  const { Chat } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  let chat, hidden = 0, checks = 0, stopped = 0;
  const panel = { current: null, chatInput: { focus() {} },
    hide() { hidden++; const old = this.current; this.current = null; old?.onLeave?.(); },
    say(msg) { if (this.current?.chat) return false; this.current = msg; return true; },
  };
  chat = new Chat({ panel, capri: { wake() {}, perform() {}, towardCenter: () => 1 }, voice: {},
    brain: { t: { chat: { hello: ['Hello'], again: ['Back'] } } },
    host: { onChatDelta() {}, focusOverlay() {}, chatStop() { stopped++; }, chatStatus: async () => { checks++; return { ok: true, model: 'codex-test' }; } },
  });
  chat.history = [{ role: 'user', content: 'Keep this conversation' }];
  await chat.start(); chat.turn = 9;
  await chat.start(true);
  assert.equal(hidden, 1); assert.equal(stopped, 1); assert.equal(chat.open, true); assert.equal(chat.commandsOnly, true);
  assert.equal(panel.current.badge, 'LOCAL'); assert.equal(checks, 0);
  await chat.start(false);
  assert.equal(chat.open, true); assert.equal(panel.current.badge, ''); assert.equal(checks, 0); assert.equal(chat.history.length, 1);
});
