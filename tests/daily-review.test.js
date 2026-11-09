'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { CompanionGoals } = require('../src/main/companion-goals');
const { CodexTools } = require('../src/main/codex-tools');
const { dayRange } = require('../src/main/daily-review');
const { dayKey } = require('../src/main/companion-interests');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-review-'));
  const a = path.join(dir, 'alpha'), b = path.join(dir, 'beta');
  fs.mkdirSync(a); fs.mkdirSync(b);
  let at = new Date(2026, 10, 7, 18, 30).getTime(), cfg = { privacy: { memoryEnabled: true } }, goals;
  const open = () => goals = new CompanionGoals({ file: path.join(dir, 'goals.sqlite'), now: () => at, settings: () => cfg });
  open();
  t.after(() => { goals.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { a, b, get goals() { return goals; }, get reviews() { return goals.reviews; },
    get day() { return dayKey(at); }, setTime(value) { at = value; }, advance(ms) { at += ms; },
    cfg(value) { cfg = value; }, restart() { goals.close(); open(); },
    note(kind, text) { return goals.projects.route(`/project ${kind} ${text}`); },
    check(exitCode) { return goals.projects.recordVerification({ workspace: fs.realpathSync(a), cwd: a, command: 'npm test', exitCode }); },
  };
}

test('daily synthesis distinguishes user-marked progress, reported results, command exits and unfinished next steps', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  f.goals.route('/goals add Review the motion'); f.goals.route('/goals next 1 Inspect the seated pose');
  f.goals.route('/goals add Finish the first pass'); f.goals.route('/goals done 2');
  f.goals.route('/goals add Explore a different renderer'); f.goals.route('/goals pause 3');
  await f.note('decision', 'Keep the original opening');
  await f.note('outcome', 'The manual preview looked good'); f.check(1);
  const row = f.reviews.generate(), view = f.reviews.view(row), text = f.reviews.format(view);
  assert.equal(view.groups.completed[0].text, 'Finish the first pass');
  assert.equal(view.groups.open[0].next_step, 'Inspect the seated pose');
  assert.equal(view.groups.paused[0].text, 'Explore a different renderer');
  assert.equal(view.groups.checks[0].exitCode, 1);
  assert.match(text, /user-marked|User-reported|unverified/);
  assert.match(text, /Next: Inspect the seated pose/);
  assert.doesNotMatch(text, /release certified|all tests passed|you felt/);
  assert.match(view.note, /do not grant permission/);
  const stored = JSON.stringify(f.goals.db.prepare('SELECT * FROM companion_daily_reviews').all());
  assert.doesNotMatch(stored, /Keep the original opening|manual preview|Inspect the seated pose/);
  f.restart();
  assert.equal(f.reviews.view(f.reviews.row(f.day)).groups.decisions[0].text, 'Keep the original opening');
});

test('same-day refresh uses one entry, successful rechecks supersede failures, and older activity is not today progress', t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  f.goals.route('/goals add An older intention');
  f.advance(86400000); f.check(1);
  let view = f.reviews.view(f.reviews.generate());
  assert.equal(view.groups.open.length, 1); assert.equal(view.groups.completed.length, 0);
  f.advance(1000); f.check(0); view = f.reviews.view(f.reviews.generate());
  assert.equal(view.groups.checks.length, 1); assert.equal(view.groups.checks[0].exitCode, 0);
  assert.equal(f.reviews.list().length, 1);
  assert.equal(view.day, f.day);
});

test('automatic review is quiet by default and cannot repeat after restart, deletion or project switching', t => {
  const f = fixture(t); f.goals.projects.select(f.a); f.goals.route('/goals add Alpha work');
  let notifications = 0;
  const tick = () => f.reviews.tick({ available: true, notify() { notifications++; return true; } });
  assert.equal(tick(), false); assert.equal(notifications, 0); assert.equal(f.reviews.list().length, 1);
  f.restart(); f.cfg({ dailyReviewNotify: true, privacy: { memoryEnabled: true } });
  assert.equal(tick(), false);
  assert.match(f.reviews.route('/review clear', () => {}).text, /cadence is preserved/);
  assert.equal(tick(), false);
  f.goals.projects.select(f.b); f.goals.route('/goals add Beta work');
  assert.equal(tick(), false); assert.equal(f.reviews.list().length, 0);
  assert.equal(notifications, 0);
});

test('optional notification delivers once, honors quiet availability and never includes saved private text', t => {
  const f = fixture(t); f.cfg({ dailyReviewNotify: true, privacy: { memoryEnabled: true } });
  f.goals.route('/goals add Private project description');
  const said = [], notify = text => { said.push(text); return true; };
  assert.equal(f.reviews.tick({ available: false, notify }), false); assert.equal(f.reviews.list().length, 0);
  assert.equal(f.reviews.tick({ available: true, notify }), true);
  assert.equal(f.reviews.tick({ available: true, notify }), false);
  assert.equal(said.length, 1); assert.doesNotMatch(said[0], /Private project description/);
  assert.match(said[0], /review today/);
  f.restart(); assert.equal(f.reviews.tick({ available: true, notify }), false);
});

test('local-date cadence has twenty-hour spacing, no morning or missed-day catch-up, and no empty reviews', t => {
  const f = fixture(t); f.goals.route('/goals add Existing intention');
  const tick = () => f.reviews.tick({ available: true });
  f.setTime(new Date(2026, 10, 7, 17, 59).getTime()); tick(); assert.equal(f.reviews.list().length, 0);
  f.setTime(new Date(2026, 10, 7, 19).getTime()); tick(); assert.equal(f.reviews.list().length, 1);
  f.setTime(new Date(2026, 10, 8, 8).getTime()); tick(); assert.equal(f.reviews.list().length, 1);
  f.setTime(new Date(2026, 10, 9, 18).getTime()); tick(); assert.equal(f.reviews.list().length, 1, 'No saved updates today means no catch-up');
  f.goals.route('/goals next 1 Review tomorrow'); tick(); assert.equal(f.reviews.list().length, 2);
  f.setTime(new Date(2026, 10, 8, 19).getTime()); f.goals.route('/goals add Clock moved back'); tick();
  assert.equal(f.reviews.list().length, 2, 'A backwards clock cannot bypass spacing');
  const empty = fixture(t); assert.equal(empty.reviews.generate(), null);
  assert.equal(empty.reviews.tick({ available: true }), false); assert.equal(empty.reviews.list().length, 0);
});

test('project scopes isolate reviews while explicitly global goals stay shared', async t => {
  const f = fixture(t); f.goals.route('/goals add Global plan');
  f.goals.projects.select(f.a); f.goals.route('/goals add Alpha private work'); await f.note('decision', 'Alpha decision'); f.reviews.generate();
  const alphaId = f.goals.projects.scope();
  f.goals.projects.select(f.b); f.goals.route('/goals add Beta work');
  assert.equal(f.reviews.list().length, 0);
  const beta = f.reviews.lookup('today');
  assert.doesNotMatch(JSON.stringify(beta), /Alpha/); assert.match(JSON.stringify(beta), /Global plan|Beta work/);
  f.goals.projects.confirm = async () => true;
  await f.goals.projects.route('/project delete ' + alphaId);
  assert.equal(f.goals.db.prepare('SELECT count(*) AS n FROM companion_daily_reviews WHERE scope_id=?').get(alphaId).n, 0);
  assert.equal(f.reviews.list().length, 1); assert.equal(fs.existsSync(f.a), true);
});

test('corrected and forgotten sources disappear from historical review and export rather than retaining stale copies', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  f.goals.route('/goals add Obsolete goal text'); await f.note('decision', 'Old decision text');
  f.reviews.generate(); const day = f.day;
  f.advance(86400000); f.goals.route('/goals delete 1'); await f.goals.projects.route('/project forget-note 1');
  const view = f.reviews.view(f.reviews.row(day));
  assert.equal(view.stale_sources, 2);
  assert.deepEqual(view.groups.open, []); assert.deepEqual(view.groups.decisions, []);
  assert.doesNotMatch(f.reviews.route('/review export', () => {}).text, /Obsolete goal text|Old decision text/);
  assert.match(f.reviews.format(view), /sources changed or were removed/);
});

test('memory, recall, gaming and generation controls gate writes and model recall but allow explicit review/export/forget', t => {
  const f = fixture(t); f.goals.route('/goals add Saved goal'); f.reviews.generate();
  const originalAt = f.reviews.row(f.day).captured_at;
  f.advance(1000);
  for (const cfg of [{ privacy: { memoryEnabled: false } }, { privacy: { memoryEnabled: true, memoryRecall: false } },
    { gamingMode: true, privacy: { memoryEnabled: true } }, { privacy: { memoryEnabled: true, promptBudget: 0 } }]) {
    f.cfg(cfg);
    assert.equal(f.reviews.tick({ available: true }), false);
    assert.throws(() => f.reviews.lookup('today'), /disabled/);
    assert.match(f.reviews.route('/review today', () => {}).text, /Saved goal/);
    assert.equal(f.reviews.row(f.day).captured_at, originalAt);
  }
  f.cfg({ dailyReviewEnabled: false, privacy: { memoryEnabled: true } });
  f.goals.route('/goals add New goal while reviews off');
  assert.doesNotMatch(f.reviews.lookup('today').text, /New goal while reviews off/);
  assert.equal(f.reviews.row(f.day).captured_at, originalAt);
  assert.match(f.reviews.route('/review forget ' + f.day, () => {}).text, /1 saved review/);
  assert.equal(f.goals.list().length, 2);
  let patch; f.reviews.route('/review on', value => patch = value); assert.deepEqual(patch, { dailyReviewEnabled: true });
});

test('retention and bounded history prune review references without removing goals', t => {
  const f = fixture(t); f.cfg({ privacy: { memoryEnabled: true, retentionDays: 30 } });
  f.goals.route('/goals add Current goal'); f.reviews.generate();
  f.advance(31 * 86400000); f.restart(); assert.equal(f.reviews.list().length, 0);
  f.cfg({ privacy: { memoryEnabled: true, retentionDays: 0 } });
  for (let index = 0; index < 95; index++) { f.goals.route('/goals add Current goal'); f.reviews.generate(); f.advance(86400000); }
  assert.equal(f.reviews.list().length, 90); assert.equal(f.goals.list().length, 1);
});

test('date validation rejects impossible dates and local day bounds handle daylight saving', () => {
  for (const value of ['2026-02-30', '2026-13-01', 'today', '../private', '2026-1-01']) assert.throws(() => dayRange(value));
  const result = execFileSync(process.execPath, ['-e', "const {dayRange}=require('./src/main/daily-review');const r=dayRange('2026-11-01');console.log(r.end-r.start)"],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ: 'America/New_York' }, windowsHide: true, encoding: 'utf8' });
  assert.equal(Number(result.trim()), 25 * 3600000);
});

test('Codex daily recap tool uses real local evidence and respects end-user memory controls', async t => {
  const f = fixture(t); f.goals.route('/goals add Review the motion');
  const tools = new CodexTools({ goals: () => f.goals });
  const ctx = { text: 'What did we do today?', check() {}, signal: new AbortController().signal };
  assert.ok(tools.specs().some(row => row.name === 'capri_daily_review'));
  const result = await tools.run('capri_daily_review', { action: 'today', day: '' }, ctx);
  assert.equal(result.review.groups.open[0].text, 'Review the motion');
  await assert.rejects(tools.run('capri_daily_review', { action: 'forget', day: f.day }, ctx), /Invalid/);
  f.cfg({ privacy: { memoryEnabled: false } });
  await assert.rejects(tools.run('capri_daily_review', { action: 'today', day: '' }, ctx), /disabled/);
  assert.ok(!new CodexTools({}).specs().some(row => row.name === 'capri_daily_review'));
});

test('large multilingual recaps fit the tool byte limit without truncating saved records', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  for (let index = 0; index < 4; index++) {
    f.goals.route('/goals add ' + index + '漢'.repeat(900));
    f.goals.route(`/goals next ${index + 1} ` + '字'.repeat(900));
    await f.note('decision', '議'.repeat(900));
    await f.note('outcome', '成'.repeat(900));
  }
  const result = f.reviews.lookup('today');
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 32000);
  assert.ok(result.review.omitted > 0);
  assert.equal(f.reviews.view(f.reviews.row(f.day)).groups.open.length, 4, 'Tool packing does not alter the saved review');
  for (const row of result.review.groups.open) assert.equal(row.next_step.length, 900);
});
