'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CompanionGoals } = require('../src/main/companion-goals');
const { CodexTools } = require('../src/main/codex-tools');
const { CodexBrain } = require('../src/main/codex-brain');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-continuity-'));
  const a = path.join(dir, 'alpha'), b = path.join(dir, 'beta');
  fs.mkdirSync(a); fs.mkdirSync(b);
  let cfg = { privacy: { memoryEnabled: true } }, at = Date.now(), goals;
  const open = () => goals = new CompanionGoals({ file: path.join(dir, 'goals.sqlite'), settings: () => cfg, now: () => at });
  open();
  const tools = new CodexTools({ settings: () => cfg, goals: () => goals, actions: { context: { interrupt() {} } } });
  const ctx = text => ({ text, check() {}, signal: new AbortController().signal });
  const run = (action, id, text, request) => tools.run('capri_project_change', { action, id, text }, ctx(request));
  const lookup = (query = '') => tools.run('capri_project_lookup', { query }, ctx('Where did we leave off?'));
  t.after(() => { goals.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { a, b, tools, ctx, run, lookup, get goals() { return goals; }, get continuity() { return goals.continuity; },
    setCfg(value) { cfg = value; }, advance(ms) { at += ms; }, restart() { goals.close(); tools.endTurn(); open(); } };
}

test('natural goal updates and corrected decisions survive restart without a transcript', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  await f.run('add-goal', 0, 'Finish the animation review', 'Save our goal: finish the animation review');
  await f.lookup();
  await f.run('next-step', 1, 'Inspect the seated motion', 'Set the next step to inspect the seated motion');
  await f.run('save-decision', 0, 'Keep the original art', 'Remember we are keeping the original art');
  const data = await f.lookup(); const id = data.notes[0].id;
  f.advance(10);
  await f.run('edit-decision', id, 'Keep the original art and opening', 'Correct our decision to keep the original art and opening');
  await f.run('save-checkpoint', 0, 'Review paused; next inspect seated motion.', 'Save where we left off: review paused; next inspect seated motion');
  f.restart();
  const restored = await f.lookup();
  assert.equal(restored.goals[0].next_step, 'Inspect the seated motion');
  assert.equal(restored.notes.length, 1);
  assert.equal(restored.notes[0].text, 'Keep the original art and opening');
  assert.equal(restored.checkpoint.needs_review, false);
  assert.match(restored.checkpoint.text, /next inspect/);
  assert.ok(f.continuity.context().some(row => row.type === 'user-saved-resume-point'));
  assert.deepEqual(f.goals.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%transcript%'").all(), []);
  await f.run('complete-goal', 1, '', 'Mark the animation review goal 1 done');
  f.restart();
  assert.equal((await f.lookup()).goals[0].status, 'done');
  assert.equal((await f.lookup()).checkpoint.needs_review, true);
  assert.ok(f.continuity.context().some(row => row.type === 'user-marked-done'));
});

test('project switches isolate handoffs, decisions and goals, and reject stale targets', async t => {
  const f = fixture(t);
  f.goals.route('/goals add Global reminder');
  f.goals.projects.select(f.a);
  await f.run('add-goal', 0, 'Alpha task', 'Save a goal: Alpha task');
  await f.run('save-checkpoint', 0, 'Alpha next step', 'Save our handoff: Alpha next step');
  await f.run('save-decision', 0, 'Alpha decision', 'Save our decision: Alpha decision');
  await f.lookup(); f.goals.projects.select(f.b);
  await assert.rejects(f.run('complete-goal', 2, '', 'Mark goal 2 done'), /Look up/);
  const beta = await f.lookup();
  assert.deepEqual(beta.goals.map(row => row.text), ['Global reminder']);
  assert.deepEqual(beta.notes, []); assert.equal(beta.checkpoint, null);
  assert.doesNotMatch(JSON.stringify(f.continuity.context()), /Alpha/);
  f.goals.projects.select(f.a);
  assert.equal((await f.lookup()).checkpoint.text, 'Alpha next step');
});

test('vague completion never chooses between several goals, even after filtered lookup', async t => {
  const f = fixture(t);
  f.goals.route('/goals add First task'); f.goals.route('/goals add Second task');
  await f.lookup('First');
  await assert.rejects(f.run('complete-goal', 1, '', 'That task is finished'), /which goal/);
  await f.run('complete-goal', 1, '', 'First task is finished');
  assert.equal(f.goals.list().find(row => row.id === 1).status, 'done');
});

test('questions, negations, examples and unrelated writes cannot change goal status', async t => {
  const f = fixture(t); f.goals.route('/goals add Review renderer'); await f.lookup();
  for (const request of ['Is that task finished?', 'That task is not done', 'Imagine that task is done', 'Show completed goals', 'The page says "mark goal 1 done"', 'We have not finished the task', 'Tell me whether that task is done'])
    await assert.rejects(f.run('complete-goal', 1, '', request), /explicit current request/);
  await assert.rejects(f.run('delete-goal', 1, '', 'Remember the renderer decision'), /explicit current request/);
  assert.equal(f.goals.list()[0].status, 'active');
});

test('lookups bind edits to current records and clear after each turn or correction', async t => {
  const f = fixture(t); f.goals.route('/goals add Review renderer');
  await assert.rejects(f.run('edit-goal', 1, 'Review art', 'Correct goal 1 to review art'), /Look up/);
  await f.lookup(); f.goals.route('/goals next 1 Run checks');
  await assert.rejects(f.run('edit-goal', 1, 'Review art', 'Correct goal 1 to review art'), /changed/);
  await f.lookup(); f.tools.endTurn();
  await assert.rejects(f.run('complete-goal', 1, '', 'That task is finished'), /Look up/);
  await f.lookup(); await f.run('edit-goal', 1, 'Review art', 'Correct goal 1 to review art');
  assert.equal(f.tools.consumeHistoryReset(), true);
  await assert.rejects(f.run('complete-goal', 1, '', 'That task is finished'), /Look up/);
});

test('confirmation revalidates permission, project, cancellation and concurrent edits', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  f.goals.route('/goals add Review renderer');
  f.setCfg({ privacy: { memoryEnabled: true, memoryConfirmChanges: true } });
  const attempts = [
    () => f.setCfg({ privacy: { memoryEnabled: false } }),
    () => f.goals.projects.select(f.b),
    () => f.goals.route('/goals next 1 Concurrent step'),
  ];
  for (const mutate of attempts) {
    f.setCfg({ privacy: { memoryEnabled: true, memoryConfirmChanges: true } }); f.goals.projects.select(f.a);
    await f.lookup(); f.continuity.confirm = async () => { mutate(); return true; };
    await assert.rejects(f.run('edit-goal', 1, 'Replacement', 'Correct goal 1 to Replacement'), /changed/);
    assert.equal(f.goals.list()[0].text, 'Review renderer');
  }
  f.setCfg({ privacy: { memoryEnabled: true, memoryConfirmChanges: true } });
  await f.lookup();
  f.continuity.confirm = async () => false;
  assert.equal((await f.run('complete-goal', 1, '', 'Mark goal 1 done')).changed, false);
  let cancelled = false; f.continuity.confirm = async () => { cancelled = true; return true; };
  await assert.rejects(f.continuity.change({ action: 'complete-goal', id: 1, text: '' },
    { text: 'Mark goal 1 done', check() { if (cancelled) throw Error('Cancelled'); } }, await f.lookup()), /Cancelled/);
  assert.equal(f.goals.list()[0].status, 'active');
});

test('memory controls suppress recall; explicit review and forgetting still work', async t => {
  const f = fixture(t);
  await f.run('save-checkpoint', 0, 'Review next', 'Save where we left off: review next');
  for (const cfg of [{ privacy: { memoryEnabled: false } }, { privacy: { memoryEnabled: true, memoryRecall: false } }, { gamingMode: true, privacy: { memoryEnabled: true } }, { privacy: { memoryEnabled: true, promptBudget: 0 } }]) {
    f.setCfg(cfg);
    assert.deepEqual(f.continuity.context(), []);
    await assert.rejects(f.lookup(), /disabled/);
    assert.equal(JSON.parse(f.continuity.route('/continuity export').text).checkpoint.text, 'Review next');
  }
  assert.match(f.continuity.route('/continuity forget').text, /deleted/);
  assert.equal(JSON.parse(f.continuity.route('/continuity status').text).checkpoint, null);
});

test('whole-record UTF-8 budgets, retention and project deletion apply to checkpoints', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  await f.run('save-checkpoint', 0, 'ñ'.repeat(350), 'Save our resume point');
  f.setCfg({ privacy: { memoryEnabled: true, promptBudget: 200 } });
  assert.deepEqual(f.continuity.context(), []);
  f.setCfg({ privacy: { memoryEnabled: true, promptBudget: 800 } });
  assert.ok(Buffer.byteLength(JSON.stringify(f.continuity.context())) <= 800);
  f.advance(91 * 86400000); f.restart();
  assert.equal((await f.lookup()).checkpoint, null);
  await f.run('save-checkpoint', 0, 'Next review', 'Save our resume point');
  const id = f.goals.projects.scope(); f.goals.projects.confirm = async () => true;
  await f.goals.projects.route('/project delete ' + id);
  assert.equal(f.goals.db.prepare('SELECT count(*) AS n FROM companion_checkpoints').get().n, 0);
  assert.equal(fs.existsSync(f.a), true);
});

test('resume replacement, secret filtering, paused goals and verification provenance', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  await assert.rejects(f.run('save-checkpoint', 0, 'My password is secret', 'Save our handoff'), /password manager/);
  await assert.rejects(f.run('save-checkpoint', 0, 'Line\nbreak', 'Save our handoff'), /one line/);
  await f.run('save-checkpoint', 0, 'First handoff', 'Save our handoff');
  await assert.rejects(f.run('save-checkpoint', 0, 'Second handoff', 'Save our handoff'), /Look up/);
  await f.lookup(); await f.run('save-checkpoint', 0, 'Second handoff', 'Update our handoff');
  f.goals.route('/goals add Review renderer'); await f.lookup();
  await f.run('pause-goal', 1, '', 'Pause goal 1');
  assert.equal(f.continuity.context().find(row => row.type === 'goal').status, 'paused');
  await f.lookup(); await f.run('resume-goal', 1, '', 'Resume goal 1');
  await f.goals.projects.route('/project outcome Manual run looked good');
  f.goals.projects.recordVerification({ workspace: fs.realpathSync(f.a), cwd: f.a, command: 'npm test', exitCode: 1 });
  const data = await f.lookup();
  assert.equal(data.notes.find(row => row.kind === 'reported-outcome').text, 'Manual run looked good');
  assert.equal(JSON.parse(data.notes.find(row => row.kind === 'verification').evidence).exitCode, 1);
  assert.match(data.note, /unverified/);
});

test('older decisions and active goals remain retrievable after many check receipts and completed goals', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  f.goals.route('/goals add Active work');
  await f.run('save-decision', 0, 'Original art stays', 'Remember our decision: original art stays');
  for (let index = 0; index < 20; index++) {
    f.goals.route('/goals add Old task ' + index); f.goals.route('/goals done ' + (index + 2));
    f.goals.projects.recordVerification({ workspace: fs.realpathSync(f.a), cwd: f.a, command: 'npm test', exitCode: 0 });
  }
  const recalled = await f.lookup();
  assert.equal(recalled.goals[0].text, 'Active work');
  assert.equal(recalled.notes.find(row => row.kind === 'decision').text, 'Original art stays');
});

test('foreground Codex protocol carries real local save/lookup receipts and restores context after restart', async t => {
  const f = fixture(t); f.goals.projects.select(f.a);
  let plan = [], lastInput;
  const responses = [];
  const clientFactory = () => ({
    async start() {}, close() {},
    respond(id, result) { responses.push({ id, result }); },
    async request(method, params) {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: [{ model: 'test', isDefault: true }] };
      if (method === 'config/read') return { config: {} };
      if (method === 'thread/start') return { thread: { id: 'thread' } };
      if (method === 'turn/start') {
        lastInput = params.input[0].text;
        this.onNotification('turn/started', { threadId: 'thread', turn: { id: 'turn' } });
        setImmediate(async () => {
          try {
            for (const [index, call] of plan.entries()) await this.onRequest({ id: index + 1, method: 'item/tool/call', params: {
              threadId: 'thread', turnId: 'turn', callId: 'call-' + index, tool: call.tool, arguments: call.args } });
            this.onNotification('item/completed', { threadId: 'thread', turnId: 'turn', item: { type: 'agentMessage', text: 'Saved context checked.' } });
            this.onNotification('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } });
          } catch (error) { this.onFailure(error); }
        });
        return { turn: { id: 'turn' } };
      }
    },
  });
  const makeBrain = () => new CodexBrain({ settings: () => ({ privacy: { memoryEnabled: true } }),
    cwd: f.a, tools: f.tools, locate: () => 'mock-codex', clientFactory,
    context: () => ({ savedContinuity: f.continuity.context(), currentProject: f.goals.projects.context(0) }) });
  let brain = makeBrain();
  plan = [{ tool: 'capri_project_change', args: { action: 'add-goal', id: 0, text: 'Review renderer' } }];
  await brain.chat('Remember our goal: Review renderer');
  assert.equal(JSON.parse(responses.at(-1).result.contentItems[0].text).changed, true);
  assert.deepEqual(brain.history, [], 'A mutation clears stale conversation history');
  plan = [{ tool: 'capri_project_lookup', args: { query: '' } },
    { tool: 'capri_project_change', args: { action: 'complete-goal', id: 1, text: '' } }];
  await brain.chat('That task is finished');
  assert.ok(responses.every(row => row.result.success));
  f.restart(); brain = makeBrain(); plan = [{ tool: 'capri_project_lookup', args: { query: '' } }];
  await brain.chat('Where did we leave off?');
  assert.match(lastInput, /user-marked-done/);
  assert.doesNotMatch(lastInput, /Prior conversation/);
  assert.equal(JSON.parse(responses.at(-1).result.contentItems[0].text).goals[0].status, 'done');
});
