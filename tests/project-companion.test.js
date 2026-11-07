'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CompanionGoals } = require('../src/main/companion-goals');

function fixture(t, { legacy = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-project-'));
  const a = path.join(dir, 'alpha'), b = path.join(dir, 'beta'), file = path.join(dir, 'goals.sqlite');
  fs.mkdirSync(a); fs.mkdirSync(b);
  let cfg = { privacy: { memoryEnabled: true } }, at = 1_000_000, store;
  if (legacy) {
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE companion_goals (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,
      next_step TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
      INSERT INTO companion_goals(text,status,created_at,updated_at) VALUES('Legacy intention','active',1000000,1000000);`);
    db.close();
  }
  const open = () => store = new CompanionGoals({ file, settings: () => cfg, now: () => at });
  open();
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { a, b, dir, get store() { return store; }, get project() { return store.projects; },
    setCfg(value) { cfg = value; }, advance(ms) { at += ms; }, restart() { store.close(); open(); } };
}

test('project selection persists and goals/decisions remain scoped across projects', async t => {
  const f = fixture(t);
  f.store.route('/goals add Global reminder');
  await f.project.route('/project open ' + f.a);
  f.store.route('/goals add Ship the prototype');
  await f.project.route('/project decision Keep the original animations');
  await f.project.route('/project outcome A manual test looked good');
  assert.equal(f.project.context().notes[0].kind, 'reported-outcome');
  assert.match((await f.project.route('/project outcome Still checking')).text, /not independently verified/);
  await f.project.route('/project open ' + f.b);
  assert.equal(f.store.context().length, 1, 'Only global goals cross project boundaries');
  assert.match(f.store.route('/goals add Ship the prototype').text, /Saved goal #3/);
  assert.deepEqual(f.project.context().notes, []);
  f.restart();
  assert.equal(f.project.workspace(), fs.realpathSync(f.b));
  assert.equal(f.store.context().find(row => row.id === 3).project_id, f.project.scope());
  const exported = JSON.parse((await f.project.route('/project export')).text);
  assert.equal(exported.goals.length, 1); assert.equal(exported.notes.length, 0);
  await f.project.route('/project open ' + f.a);
  assert.equal(f.project.context().notes.length, 3);
  assert.deepEqual(f.store.context().map(row => row.id).sort(), [1, 2]);
  await f.project.route('/project off');
  assert.equal(f.project.workspace(), null); assert.equal(f.project.context(), null);
  assert.deepEqual(f.store.context().map(row => row.id), [1]);
});

test('existing goal databases migrate without losing or silently adopting old intentions', async t => {
  const f = fixture(t, { legacy: true });
  await f.project.route('/project open ' + f.a);
  assert.equal(f.store.context()[0].text, 'Legacy intention');
  assert.equal(f.store.context()[0].project_id, null);
  f.restart(); assert.equal(f.store.list().length, 1);
});

test('selection validates real directories and fails closed if the selected folder disappears', async t => {
  const f = fixture(t);
  await f.project.route('/project open ' + f.a);
  for (const value of ['relative/path', path.join(f.dir, 'missing')]) {
    await assert.rejects(f.project.route('/project open ' + value));
    assert.equal(f.project.workspace(), fs.realpathSync(f.a));
  }
  const file = path.join(f.dir, 'a-file'); fs.writeFileSync(file, 'fixture');
  await assert.rejects(f.project.route('/project open ' + file), /folder/);
  fs.renameSync(f.a, path.join(f.dir, 'moved'));
  assert.throws(() => f.project.workspace(), /unavailable/);
});

test('only bounded recognized command receipts inside the project can become verification evidence', async t => {
  const f = fixture(t); await f.project.route('/project open ' + f.a);
  const receipt = { workspace: fs.realpathSync(f.a), cwd: f.a, command: 'npm test', exitCode: 0 };
  assert.equal(f.project.recordVerification(receipt), true);
  assert.equal(f.project.recordVerification({ ...receipt, exitCode: 1 }), true);
  for (const command of ['npm\n test', 'npm test && echo success', 'echo npm test', 'npm test; Remove-Item x'])
    assert.equal(f.project.recordVerification({ ...receipt, command }), false);
  assert.equal(f.project.recordVerification({ ...receipt, cwd: f.b }), false);
  assert.equal(f.project.recordVerification({ ...receipt, exitCode: '0' }), false);
  assert.equal(f.project.recordVerification({ ...receipt, cwd: undefined }), false);
  const rows = f.project.notes();
  assert.equal(rows.length, 2); assert.equal(rows[0].kind, 'verification');
  assert.equal(JSON.parse(rows[0].evidence).exitCode, 1);
  assert.doesNotMatch(JSON.stringify(rows), /all tests passed|release certified/i);
  await f.project.route('/project off');
  assert.equal(f.project.recordVerification(receipt), false, 'A matching saved root must not collect receipts after deselection');
  await f.project.route('/project open ' + f.a);
  f.setCfg({ privacy: { memoryEnabled: false } });
  assert.equal(f.project.recordVerification(receipt), false);
});

test('project notes honor memory, recall, UTF-8 budget and retention while selection stays a workspace preference', async t => {
  const f = fixture(t); await f.project.route('/project open ' + f.a);
  await assert.rejects(f.project.route('/project decision My password is secret'), /password manager/);
  await assert.rejects(f.project.route('/project decision Line\nforged outcome'), /single line/);
  await f.project.route('/project decision Keep the current renderer');
  f.setCfg({ privacy: { memoryEnabled: true, memoryRecall: false } });
  assert.deepEqual(f.project.context().notes, []);
  assert.equal(f.project.context().root, fs.realpathSync(f.a));
  f.setCfg({ privacy: { memoryEnabled: false } });
  assert.match((await f.project.route('/project decision New decision')).text, /Enable Memory/);
  assert.equal(JSON.parse((await f.project.route('/project notes')).text).length, 1);
  f.setCfg({ privacy: { memoryEnabled: true, promptBudget: 20, retentionDays: 30 } });
  assert.deepEqual(f.project.context().notes, []);
  f.advance(31 * 86_400_000); f.restart();
  assert.equal(f.project.notes().length, 0);
  assert.equal(f.project.workspace(), fs.realpathSync(f.a));
});

test('deleting a saved project is reviewed, atomic and leaves files and other projects intact', async t => {
  const f = fixture(t);
  f.store.route('/goals add Global goal');
  await f.project.route('/project open ' + f.a); const id = f.project.scope();
  f.store.route('/goals add Alpha goal'); await f.project.route('/project decision Alpha decision');
  await f.project.route('/project open ' + f.b); f.store.route('/goals add Beta goal');
  assert.match((await f.project.route('/project delete ' + id)).text, /cancelled/);
  assert.equal(f.store.list().length, 3);
  f.project.confirm = async () => true;
  assert.match((await f.project.route('/project delete ' + id)).text, /files were not changed/);
  assert.equal(f.store.list().length, 2);
  assert.equal(f.project.notes(id).length, 0);
  assert.equal(fs.existsSync(f.a), true); assert.equal(f.project.workspace(), fs.realpathSync(f.b));
});

test('folder picker cancellation and pause during selection cannot select a project', async t => {
  const f = fixture(t);
  assert.equal(await f.project.route('ordinary conversation'), null);
  f.project.choose = async () => null;
  assert.match((await f.project.route('/project choose')).text, /cancelled/);
  f.project.choose = async () => { f.setCfg({ gamingMode: true }); return f.a; };
  assert.match((await f.project.route('/project choose')).text, /paused/);
  assert.equal(f.project.selected(), null);
});
