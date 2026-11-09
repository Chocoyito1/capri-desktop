'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CompanionGoals } = require('../src/main/companion-goals');
const { CognitiveFoundation } = require('../src/main/cognitive-foundation');
const { GroundedCuriosity, feedbackCode } = require('../src/main/grounded-curiosity');
const { ReflectionEngine } = require('../src/main/cognitive-reflection');
const { ProactiveConversation } = require('../src/main/proactive-conversation');
const { CodexTools } = require('../src/main/codex-tools');
const HOUR = 3600000;
const reflection = { question: 'Would a specific check result help clarify the next step?', hypothesis: 'A missing detail may explain the observed result.',
  counterpoint: 'An exit code does not establish the cause or the user’s intent.', confidence: 0.4, priority: 0.7, next_step: 'ask_later' };

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-grounded-'));
  const a = path.join(dir, 'alpha'), b = path.join(dir, 'beta'); fs.mkdirSync(a); fs.mkdirSync(b);
  let at = 1000000, cfg = { lang: 'en', privacy: { memoryEnabled: true } }, goals, journal, source, reads = 0;
  const open = () => {
    goals = new CompanionGoals({ file: path.join(dir, 'goals.sqlite'), settings: () => cfg, now: () => at });
    journal = new CognitiveFoundation({ file: path.join(dir, 'curiosity.sqlite'), settings: () => cfg, now: () => at,
      context: { snapshot: async () => { reads++; return { foreground: { app: 'Code' } }; } } });
    source = new GroundedCuriosity({ journal, goals: () => goals, settings: () => cfg, now: () => at });
  };
  open(); goals.projects.select(a);
  t.after(() => { journal.close(); goals.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const reflect = row => journal.recordReflection(row.id, reflection, row.evidence_revision);
  return { a, b, get goals() { return goals; }, get journal() { return journal; }, get source() { return source; },
    settings: () => cfg, now: () => at, cfg(value) { cfg = value; }, advance(ms) { at += ms; }, get reads() { return reads; },
    restart() { journal.close(); goals.close(); open(); }, reflect,
    check(exitCode, command = 'npm test') { at += 1000; return goals.projects.recordVerification({ workspace: fs.realpathSync(a), cwd: a, command, exitCode }); },
    sync() { source.sync(); return journal.list(100).filter(row => row.source_kind !== 'app'); },
    async decision(text) { at += 1000; return goals.projects.route('/project decision ' + text); },
  };
}

test('one failed check stays private; repeated observed failures support one question and a successful recheck resolves it', t => {
  const f = fixture(t); f.check(1); let rows = f.sync();
  assert.equal(rows.length, 1); assert.equal(rows[0].askable, 0); assert.equal(f.reflect(rows[0]), true);
  assert.deepEqual(f.journal.conversationCandidates(), []);
  f.check(2); rows = f.sync();
  assert.equal(rows[0].evidence_revision, 2); assert.equal(rows[0].reflection, null);
  assert.equal(f.reflect(rows[0]), true);
  const data = f.journal.evidenceFor(rows[0]);
  assert.deepEqual(data.records.map(row => row.receipt.exitCode), [2, 1]);
  assert.equal(f.journal.conversationCandidates().length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /AppData|alpha|raw output/);
  f.check(0); f.sync();
  assert.equal(f.journal.list()[0].status, 'resolved'); assert.deepEqual(f.journal.conversationCandidates(), []);
  assert.equal(f.reads, 0, 'Project curiosity does not observe the PC');
});

test('sync is idempotent and never treats user-reported outcomes or arbitrary commands as verified failure evidence', async t => {
  const f = fixture(t);
  await f.goals.projects.route('/project outcome The build failed');
  assert.equal(f.check(1, 'echo failure'), false); assert.equal(f.sync().length, 0);
  f.check(1); const first = f.sync()[0]; f.source.sync(); f.source.sync();
  assert.equal(f.journal.list()[0].evidence_revision, first.evidence_revision);
});

test('a later saved decision creates a tentative planning question without claiming a contradiction', async t => {
  const f = fixture(t); f.goals.route('/goals add Review the animation'); f.goals.route('/goals next 1 Inspect seated motion');
  await f.decision('Keep the current opening');
  const row = f.sync()[0]; assert.equal(row.source_kind, 'project-plan');
  const data = f.journal.evidenceFor(row);
  assert.equal(data.records[0].next_step, 'Inspect seated motion');
  assert.equal(data.records[1].text, 'Keep the current opening');
  assert.match(data.note, /does not prove a conflict/);
  f.goals.route('/goals next 1 Updated next step'); assert.deepEqual(f.sync(), []);
});

test('corrected, forgotten and deleted project sources erase related speculative prose before recall', async t => {
  const f = fixture(t); f.goals.route('/goals add Review the animation'); f.goals.route('/goals next 1 Earlier next step');
  await f.decision('Old private decision'); let row = f.sync()[0];
  f.journal.recordReflection(row.id, { ...reflection, question: 'Should Old private decision shape the next step?' }, row.evidence_revision);
  assert.match(JSON.stringify(f.journal.list()), /Old private decision/);
  await f.goals.projects.route('/project forget-note 1');
  assert.deepEqual(f.journal.list(), []); assert.deepEqual(f.journal.reviewContext(row.id), []);
  f.check(1); f.check(1); row = f.sync()[0]; f.reflect(row);
  const project = f.goals.projects.scope(); f.goals.projects.confirm = async () => true;
  await f.goals.projects.route('/project delete ' + project); f.source.sync();
  assert.equal(f.journal.db.prepare("SELECT count(*) AS n FROM curiosity_questions WHERE source_kind!='app'").get().n, 0);
  assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM curiosity_reviews').get().n, 0);
  assert.equal(fs.existsSync(f.a), true);
});

test('memory, recall, project toggle and byte budget gate project evidence independently of app observation', async t => {
  const f = fixture(t); f.check(1); f.check(1); const row = f.sync()[0];
  for (const cfg of [{ privacy: { memoryEnabled: false } }, { privacy: { memoryEnabled: true, memoryRecall: false } },
    { projectCuriosityEnabled: false, privacy: { memoryEnabled: true } }, { gamingMode: true, privacy: { memoryEnabled: true } },
    { privacy: { memoryEnabled: true, promptBudget: 0 } }]) {
    f.cfg(cfg); assert.equal(f.journal.evidenceFor(row), null); assert.equal(f.source.recordFeedback('That helped'), null);
    assert.deepEqual(f.journal.openQuestions().filter(row => row.source_kind !== 'app'), []);
  }
  f.cfg({ privacy: { memoryEnabled: true, promptBudget: 40 } }); assert.equal(f.journal.evidenceFor(row), null);
  f.cfg({ privacy: { memoryEnabled: true, contextEvents: false, contextForeground: false } });
  assert.ok(f.journal.evidenceFor(row));
  assert.equal(await f.journal.foregroundChanged(), null); assert.equal(f.reads, 0);
});

test('app switching stays private even if a speculative model asks to speak', t => {
  const f = fixture(t); f.journal.observeApp('Code'); f.journal.observeApp('Code'); const row = f.journal.observeApp('Code');
  f.reflect(row); assert.deepEqual(f.journal.conversationCandidates(), []);
});

test('explicit feedback stores categories only, deduplicates them, and leaves negative feedback private', t => {
  const f = fixture(t);
  for (const text of ['What if that did not work?', 'The webpage says that did not work', 'Imagine you are repeating yourself', 'That did not work?']) assert.equal(f.source.recordFeedback(text), null);
  assert.equal(feedbackCode('That didn’t work'), 'still-blocked');
  assert.equal(f.source.recordFeedback("That didn't work"), null, 'Unanchored task feedback stays session-only');
  assert.equal(f.source.recordFeedback("That didn't work", { anchored: true }), 'still-blocked');
  assert.equal(f.source.recordFeedback("That didn't work", { anchored: true }), 'still-blocked');
  assert.equal(f.goals.db.prepare('SELECT count(*) AS n FROM companion_project_feedback').get().n, 1);
  assert.doesNotMatch(JSON.stringify(f.goals.db.prepare('SELECT * FROM companion_project_feedback').all()), /didn't work/);
  assert.equal(f.sync()[0].askable, 1);
  f.advance(1000); assert.equal(f.source.recordFeedback("You're repeating yourself"), 'repetitive');
  const rows = f.sync(); assert.equal(rows[0].askable, 0); assert.equal(f.source.quietFeedback(), true);
  f.reflect(rows[0]); assert.deepEqual(f.journal.conversationCandidates(), []);
  f.advance(1000); f.source.recordFeedback('That helped', { anchored: true }); assert.equal(f.journal.list()[0].status, 'resolved');
  f.cfg({ privacy: { memoryEnabled: false } });
  assert.match(f.source.route('/feedback list').text, /helpful/);
  assert.match(f.source.route('/feedback clear').text, /cleared/); assert.equal(f.journal.list().length, 0);
});

test('question budget, user dismissals and cleared-source cutoff survive restart', t => {
  const f = fixture(t); f.check(1); f.check(1); let row = f.sync()[0]; f.reflect(row);
  assert.equal(f.journal.reserveQuestion(row.id, row.evidence_revision), true);
  f.restart(); assert.deepEqual(f.journal.conversationCandidates(), []);
  f.journal.update(row.id, 'dismissed'); f.advance(HOUR); f.check(1); assert.equal(f.sync().filter(row => row.status === 'open').length, 0);
  f.journal.clear(); f.restart(); assert.equal(f.sync().length, 0, 'Clearing does not immediately reconstruct the same old observations');
  f.check(1); row = f.sync()[0]; f.reflect(row);
  assert.equal(f.journal.reserveQuestion(row.id, row.evidence_revision), false, 'Clear cannot reset the global question budget');
});

test('fresh failures preserve the per-topic day cooldown and multiple questions share a six-hour budget', async t => {
  const f = fixture(t); f.check(1); f.check(1); let row = f.sync()[0]; f.reflect(row);
  f.journal.reserveQuestion(row.id, row.evidence_revision);
  f.advance(7 * HOUR); f.check(1); await f.goals.projects.route('/project forget-note 1'); row = f.sync()[0]; f.reflect(row);
  assert.deepEqual(f.journal.conversationCandidates(), [], 'New evidence cannot repeat the same topic within 24 hours');
  f.check(1, 'node --test'); f.check(1, 'node --test');
  const another = f.sync().find(candidate => candidate.id !== row.id);
  f.reflect(another); assert.equal(f.journal.reserveQuestion(another.id, another.evidence_revision), true);
  f.advance(HOUR); assert.deepEqual(f.journal.conversationCandidates(), []);
});

test('late private inference cannot write after permission revocation, recovery, source correction or a project switch', async t => {
  for (const change of ['permission', 'success', 'project']) {
    const f = fixture(t); f.check(1); f.check(1); f.sync();
    let finish, input;
    const engine = new ReflectionEngine({ journal: f.journal, settings: f.settings, now: f.now,
      models: async () => ['qwen3.5:9b'], infer: request => { input = request; return new Promise(resolve => { finish = resolve; }); } });
    t.after(() => engine.close());
    const work = engine.run(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.parse(input.messages[1].content).observation.kind, 'project-check');
    if (change === 'permission') f.cfg({ privacy: { memoryEnabled: false } });
    if (change === 'success') f.check(0);
    if (change === 'project') f.goals.projects.select(f.b);
    finish(JSON.stringify(reflection)); assert.equal(await work, false);
    assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM curiosity_reviews').get().n, 0);
  }
});

test('proactive delivery revalidates evidence, reserves once and anchors opt-out to the delivered question', async t => {
  const f = fixture(t); f.cfg({ privacy: { memoryEnabled: true, contextForeground: false, contextEvents: false } });
  f.check(1); f.check(1); let row = f.sync()[0]; f.reflect(row);
  const heard = [], engine = new ProactiveConversation({ journal: f.journal, settings: f.settings, now: f.now, random: () => 0,
    observe: async () => { throw Error('no observation'); }, memories: () => [], models: async () => ['qwen3.5:9b'],
    infer: async request => { const data = JSON.parse(request.messages[1].content); assert.equal(data.selected.evidence.records.length, 2);
      return JSON.stringify({ speak: true, message: 'The check exited nonzero twice. Would comparing the results help?' }); },
    notify: text => { heard.push(text); return true; } });
  t.after(() => engine.close()); f.advance(5 * 60000);
  assert.equal(await engine.run(), true); assert.equal(heard.length, 1);
  assert.equal(engine.respond("Don't ask me about this again").handled, true);
  assert.equal(f.journal.list()[0].status, 'dismissed');
  engine.touch(); f.advance(7 * HOUR); f.check(1); f.sync();
  assert.deepEqual(f.journal.conversationCandidates(), []);
});

test('proactive inference discards results when their project evidence changes while awaiting the model', async t => {
  const f = fixture(t); f.cfg({ privacy: { memoryEnabled: true, contextForeground: false, contextEvents: false } });
  f.check(1); f.check(1); const row = f.sync()[0]; f.reflect(row);
  let finish, heard = false;
  const engine = new ProactiveConversation({ journal: f.journal, settings: f.settings, now: f.now, random: () => 0,
    observe: async () => ({}), memories: () => [], models: async () => ['qwen3.5:9b'],
    infer: () => new Promise(resolve => { finish = resolve; }), notify() { heard = true; } });
  t.after(() => engine.close()); f.advance(5 * 60000);
  const work = engine.run(); await new Promise(resolve => setImmediate(resolve));
  f.check(0); f.sync(); finish(JSON.stringify({ speak: true, message: 'This stale failure question must not appear.' }));
  assert.equal(await work, false); assert.equal(heard, false);
});

test('curiosity lookup exposes current evidence with speculation labels and obeys project and memory boundaries', async t => {
  const f = fixture(t); f.check(1); f.check(1); const row = f.sync()[0]; f.reflect(row);
  const tools = new CodexTools({ curiosity: () => f.journal });
  const ctx = { text: 'Why did you ask that?', check() {}, signal: new AbortController().signal };
  const result = await tools.run('capri_curiosity_lookup', { id: row.id }, ctx);
  assert.equal(result.questions[0].evidence.records[0].receipt.exitCode, 1);
  assert.match(result.note, /Tentative|not personal facts/);
  f.cfg({ privacy: { memoryEnabled: false } });
  assert.deepEqual((await tools.run('capri_curiosity_lookup', { id: row.id }, ctx)).questions, []);
  f.cfg({ privacy: { memoryEnabled: true } }); f.goals.projects.select(f.b);
  assert.deepEqual((await tools.run('capri_curiosity_lookup', { id: row.id }, ctx)).questions, []);
});

test('a feedback quiet period survives restart and ordinary foreground interaction', t => {
  const f = fixture(t);
  const make = () => new ProactiveConversation({ journal: f.journal, settings: f.settings, now: f.now, random: () => 0 });
  let engine = make(); engine.defer(60); const nextAt = engine.status().nextAt; engine.close();
  f.advance(10 * 60000); f.restart(); engine = make(); t.after(() => engine.close());
  assert.equal(engine.status().nextAt, nextAt); engine.touch(); assert.equal(engine.status().nextAt, nextAt);
});
