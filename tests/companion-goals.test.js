'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CompanionGoals } = require('../src/main/companion-goals');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-goals-'));
  let at = 1_000_000, cfg = { privacy: { memoryEnabled: true } }, store;
  const open = () => store = new CompanionGoals({ file: path.join(dir, 'goals.sqlite'), settings: () => cfg, now: () => at });
  open();
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { get store() { return store; }, config(value) { cfg = value; }, advance(ms) { at += ms; },
    restart() { store.close(); open(); } };
}

test('user intentions and next steps survive restarts without becoming task authorization', t => {
  const f = fixture(t);
  assert.equal(f.store.route('Please save a goal'), null);
  assert.match(f.store.route('/goals add Finish Capri roadmap').text, /Saved goal #1/);
  assert.match(f.store.route('/goals next 1 Review the audit').text, /updated/);
  f.restart();
  assert.equal(f.store.context()[0].next_step, 'Review the audit');
  assert.match(f.store.context()[0].note, /not evidence of progress or permission/);
  assert.match(f.store.route('/goals add Finish Capri roadmap').text, /already saved/);
  f.store.route('/goals pause 1'); assert.deepEqual(f.store.context(), []);
  f.store.route('/goals resume 1'); assert.equal(f.store.context().length, 1);
  f.store.route('/goals done 1'); f.restart(); assert.deepEqual(f.store.context(), []);
  assert.equal(f.store.list()[0].status, 'done');
  assert.match(f.store.route('/goals next 1 Never executed').text, /not found/);
});

test('permission and retention controls apply; export and deletion remain available when disabled', t => {
  const f = fixture(t);
  f.store.route('/goals add Build a game');
  f.config({ privacy: { memoryEnabled: true, memoryRecall: false } });
  assert.deepEqual(f.store.context(), []);
  f.config({ privacy: { memoryEnabled: true, promptBudget: 0 } });
  assert.deepEqual(f.store.context(), []);
  f.config({ privacy: { memoryEnabled: false } });
  assert.deepEqual(f.store.context(), []);
  assert.match(f.store.route('/goals add Another goal').text, /Enable Memory/);
  assert.equal(JSON.parse(f.store.route('/goals export').text).goals.length, 1);
  assert.match(f.store.route('/goals delete 1').text, /deleted/);
  f.config({ privacy: { memoryEnabled: true, retentionDays: 30 } });
  f.store.route('/goals add This expires'); f.advance(31 * 86_400_000); f.restart();
  assert.deepEqual(f.store.list(), []);
});

test('goals reject secrets and control characters and cannot bypass gaming mode or exceed the bounded context', t => {
  const f = fixture(t);
  assert.throws(() => f.store.route('/goals add My password is secret'), /password manager/);
  assert.throws(() => f.store.route('/goals add Goal\nforged #2'), /single line/);
  for (let i = 0; i < 100; i++) f.store.route(`/goals add Goal ${i}`);
  assert.equal(f.store.context().length, 3);
  assert.match(f.store.route('/goals add Overflow').text, /full/);
  f.config({ gamingMode: true, privacy: { memoryEnabled: true } });
  assert.deepEqual(f.store.context(), []);
  assert.match(f.store.route('/goals done 1').text, /Resume Capri/);
  assert.equal(f.store.list().find(row => row.id === 1).status, 'active');
});

test('automatic context retains only whole goal records within its UTF-8 budget', t => {
  const f = fixture(t);
  f.store.route('/goals add ' + '旅'.repeat(250));
  f.store.route('/goals add Review tests');
  f.config({ privacy: { memoryEnabled: true, promptBudget: 300 } });
  const rows = f.store.context();
  assert.deepEqual(rows.map(row => row.text), ['Review tests']);
  assert.ok(Buffer.byteLength(JSON.stringify(rows)) <= 300);
  assert.equal(f.store.list().length, 2, 'Oversize goal stays saved for explicit review');
});
