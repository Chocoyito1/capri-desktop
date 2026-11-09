'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CognitiveFoundation } = require('../src/main/cognitive-foundation');
const { ReflectionEngine } = require('../src/main/cognitive-reflection');
const reflection = { question: 'What evidence would make help useful?', hypothesis: 'This may be ordinary work.',
  counterpoint: 'App visits alone cannot tell me why.', confidence: 0.3, priority: 0.4, next_step: 'wait' };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-inquiry-'));
  const file = path.join(dir, 'curiosity.sqlite');
  let time = 1_000_000;
  let journal;
  const open = () => journal = new CognitiveFoundation({ file, now: () => time,
    settings: () => ({}), context: { snapshot: async () => ({ foreground: { app: 'Code' } }) } });
  open();
  t.after(() => { journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { get journal() { return journal; }, file,
    reopen() { journal.close(); return open(); }, advance(ms) { time += ms; }, now: () => time,
    observe() { journal.observeApp('Code'); journal.observeApp('Code'); return journal.observeApp('Code'); } };
}
test('revisits persisted goals only with fresh evidence and after cooldown, retaining prior reviews', t => {
  const f = fixture(t), q = f.observe();
  assert.equal(f.journal.recordReflection(q.id, reflection, q.evidence_revision), true);
  f.reopen(); f.advance(7 * 3_600_000);
  assert.equal(f.journal.openQuestions().length, 0);
  const fresh = f.observe();
  assert.equal(fresh.id, q.id);
  assert.equal(f.journal.openQuestions()[0].evidence_revision, 2);
  assert.equal(f.journal.reviewContext(q.id)[0].reflection.hypothesis, reflection.hypothesis);
  assert.equal(f.journal.recordReflection(q.id, reflection, 2), true);
  f.advance(31 * 60_000); f.observe();
  assert.equal(f.journal.openQuestions().length, 0);
  f.advance(6 * 3_600_000);
  assert.equal(f.journal.openQuestions().length, 1);
});
test('does not consume evidence arriving during inference or overwrite a closed question', t => {
  const f = fixture(t), q = f.observe();
  f.advance(31 * 60_000); f.observe();
  assert.equal(f.journal.recordReflection(q.id, reflection, 1), true);
  assert.equal(f.journal.list()[0].evidence_revision, 2);
  assert.equal(f.journal.list()[0].reviewed_revision, 1);
  assert.equal(f.journal.recordReflection(q.id, reflection, 1), false);
  f.journal.update(q.id, 'dismissed'); f.reopen(); f.advance(7 * 3_600_000);
  assert.equal(f.observe(), null);
  assert.equal(f.journal.recordReflection(q.id, reflection, 2), false);
  assert.equal(f.journal.list().length, 1);
});
test('attempt budget survives restarts and clearing the journal', t => {
  const f = fixture(t);
  assert.equal(f.journal.reserveAttempt(), true);
  f.reopen(); assert.equal(f.journal.reserveAttempt(), false);
  f.advance(31_000); assert.equal(f.journal.reserveAttempt(), true);
  f.journal.clear(); f.reopen(); f.advance(31_000);
  assert.equal(f.journal.reserveAttempt(), false);
  assert.equal(f.journal.attemptsLastHour(), 2);
  f.advance(3_600_000); assert.equal(f.journal.reserveAttempt(), true);
});
test('conversation cadence persists separately from curiosity questions', t => {
  const f = fixture(t), state = { nextAt: 1_900_000, recent: [], lastSource: 'smalltalk' };
  f.journal.conversationState(state); f.reopen();
  assert.deepEqual(f.journal.conversationState(), state);
  f.journal.clear(); assert.deepEqual(f.journal.conversationState(), state);
});
test('bounded history is deleted along with questions', t => {
  const f = fixture(t), q = f.observe();
  for (let i = 1; i <= 9; i++) {
    assert.equal(f.journal.recordReflection(q.id, reflection, i), true);
    f.advance(7 * 3_600_000); f.observe();
  }
  assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM curiosity_reviews').get().n, 5);
  assert.equal(f.journal.reviewContext(q.id).length, 3);
  f.advance(31 * 86_400_000); f.journal.prune();
  assert.equal(f.journal.reviewContext(q.id).length, 0);
  f.observe(); f.journal.clear();
  assert.equal(f.journal.list().length, 0);
  assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM curiosity_reviews').get().n, 0);
});
test('migrates Phase 2 databases without silently replaying an old reflection', t => {
  const f = fixture(t); f.journal.close();
  const db = new DatabaseSync(f.file);
  db.exec(`DROP TABLE curiosity_questions; CREATE TABLE curiosity_questions (
    id INTEGER PRIMARY KEY, question TEXT, subject TEXT, evidence TEXT, confidence REAL,
    status TEXT, created_at INTEGER, updated_at INTEGER, reflection TEXT, priority REAL,
    next_step TEXT, reflected_at INTEGER);
    INSERT INTO curiosity_questions VALUES(1,'Question','code','event',0.3,'open',1000000,1000000,
      '{"hypothesis":"Old possibility","counterpoint":"Uncertain"}',0.4,'wait',1000000);`);
  db.close(); f.reopen(); f.advance(7 * 3_600_000);
  assert.equal(f.journal.openQuestions().length, 0);
  f.observe(); assert.equal(f.journal.openQuestions()[0].id, 1);
});
test('passes previous hypotheses to inference and rejects a late result after clear', async t => {
  const f = fixture(t), q = f.observe();
  f.journal.recordReflection(q.id, reflection, 1); f.advance(7 * 3_600_000); f.observe();
  let request, finish;
  const engine = new ReflectionEngine({ journal: f.journal, settings: () => ({}), now: f.now,
    models: async () => ['qwen3.5:9b'], infer: async input => {
      request = input; return new Promise(resolve => { finish = resolve; });
    } });
  t.after(() => engine.close());
  const work = engine.run(); await new Promise(resolve => setImmediate(resolve));
  const context = JSON.parse(request.messages[1].content);
  assert.equal(context.previousReviews.length, 1);
  assert.equal(context.evidenceRevision, 2);
  assert.equal(context.previousReviews[0].reflection.hypothesis, reflection.hypothesis);
  engine.cancel(); f.journal.clear(); f.advance(31_000); f.observe();
  finish(JSON.stringify(reflection));
  assert.equal(await work, false);
  assert.equal(f.journal.list()[0].reflection, null);
});
