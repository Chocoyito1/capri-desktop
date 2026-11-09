'use strict';

// Closing an app when you ask her to (chat.js), after you've confirmed with a click. The apps with
// a window, by name; closing one the way its own close button does (it can still ask you to save),
// and only if you ask again, forcing it. Windows only.

const native = require('./native-windows');

// never these: the desktop itself, Windows' own pieces, her (Capri), Codex and
// Ollama (she talks through it)
const KEEP = new Set([
  'explorer', 'applicationframehost', 'textinputhost', 'shellexperiencehost', 'startmenuexperiencehost',
  'searchhost', 'searchapp', 'lockapp', 'dwm', 'capri', 'caprigpt', 'codex', 'chatgpt', 'electron', 'ollama', 'ollama app',
]);

// [{ name, process, ids }]: one per program with a window open ("AM Music", "Discord"...)
async function list() {
  if (process.platform !== 'win32') return [];
  return native.desktopApps().filter(app => !KEEP.has(app.name.toLowerCase()));
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The open app that `wanted` names, by its name or its description ("am music", "YouTube Music").
async function find(wanted) {
  const key = simple(wanted);
  if (key.length < 2) return null;
  const apps = await list();
  const score = (app) => {
    const names = [simple(app.name), simple(app.label)].filter(Boolean);
    if (names.includes(key)) return 3;
    if (names.some((n) => n.startsWith(key) || key.startsWith(n))) return 2;
    if (key.length >= 3 && names.some((n) => n.includes(key) || key.includes(n))) return 1;
    return 0;
  };
  const best = apps.map((app) => [score(app), app]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0];
  return best ? best[1] : null;
}

// Closes it like its close button would; `force` ends it outright (unsaved work is lost).
// Resolves with what's left: { running } (true when it stayed open, or hid in the tray).
async function close(name, { force = false } = {}) {
  const app = (await list()).find((a) => a.process === name);
  if (!app) return { running: false };
  if (force) native.forceClose(app.ids, app.name);
  else native.requestClose(app.handles);
  await new Promise(resolve => setTimeout(resolve, force ? 600 : 2500));
  // Background helpers with the same name do not keep the original window open.
  const alive = new Set(native.processRows().filter(row => row.name === app.name).map(row => row.id));
  return { running: app.ids.some(id => alive.has(id)) };
}

module.exports = { list, find, close };
