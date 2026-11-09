'use strict';

// Bounded local curiosity journal. This is NOT personal memory and never
// authorizes a tool call or a spontaneous interruption.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const WINDOW_MS = 10 * 60_000;
const COOLDOWN_MS = 30 * 60_000;
const MAX_QUESTIONS = 100;
const VALID_APP = /^[\p{L}\p{N} ._+()-]{1,80}$/u;

class CognitiveFoundation {
  constructor({ file = ':memory:', settings = () => ({}), context, now = Date.now } = {}) {
    if (!context || typeof context.snapshot !== 'function') throw Error('Context service required.');
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS curiosity_questions (
        id INTEGER PRIMARY KEY, question TEXT NOT NULL, subject TEXT NOT NULL,
        evidence TEXT NOT NULL, confidence REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('open','dismissed','resolved')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS curiosity_subject_status
        ON curiosity_questions(subject, status) WHERE status='open';`);
    // Forward-compatible local schema migration, independent of personal memory.
    const columns = this.db.prepare('PRAGMA table_info(curiosity_questions)').all().map(row => row.name);
    for (const [name, type] of [
      ['reflection', 'TEXT'], ['priority', 'REAL'], ['next_step', 'TEXT'],
      ['reflected_at', 'INTEGER'],
      ['evidence_revision', 'INTEGER NOT NULL DEFAULT 1'],
      ['reviewed_revision', 'INTEGER NOT NULL DEFAULT 0'],
      ['revisit_at', 'INTEGER'],
      ['source_kind', "TEXT NOT NULL DEFAULT 'app'"],
      ['scope_id', 'INTEGER'], ['askable', 'INTEGER NOT NULL DEFAULT 0'],
      ['asked_revision', 'INTEGER NOT NULL DEFAULT 0'], ['last_asked_at', 'INTEGER'],
    ]) if (!columns.includes(name)) this.db.exec(`ALTER TABLE curiosity_questions ADD COLUMN ${name} ${type}`);
    if (!columns.includes('reviewed_revision')) this.db.exec(`UPDATE curiosity_questions
      SET reviewed_revision=evidence_revision, revisit_at=reflected_at+21600000 WHERE reflected_at IS NOT NULL`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS curiosity_reviews (
      id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL, evidence_revision INTEGER NOT NULL,
      reflection TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS curiosity_attempts (at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversation_state (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS curiosity_suppressions(subject TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS curiosity_asks(at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS curiosity_topic_asks(subject TEXT PRIMARY KEY,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS curiosity_project_clear(id INTEGER PRIMARY KEY CHECK(id=1),at INTEGER NOT NULL);`);
    this.settings = settings;
    this.context = context;
    this.now = now;
    this.seen = new Map();
    this.last = new Map();
    this.closed = false;
    this.busy = false;
  }

  allowed() {
    const cfg = this.settings();
    const p = require('./pc-context').permissions(cfg.privacy);
    return cfg.cognitiveEnabled !== false && cfg.agentEnabled !== false &&
      !cfg.gamingMode && ((p.contextEvents && p.contextForeground) || Boolean(this.projectSource?.enabled()));
  }
  appAllowed() {
    const p = require('./pc-context').permissions(this.settings().privacy);
    return this.allowed() && p.contextEvents && p.contextForeground;
  }
  evidenceFor(row, options) {
    if (row.source_kind && row.source_kind !== 'app') return this.projectSource?.resolve(row, options) || null;
    return this.appAllowed() ? row.evidence : null;
  }
  isCurrent(row) {
    if (row.source_kind && row.source_kind !== 'app') this.projectSource?.sync();
    const current = this.db.prepare("SELECT * FROM curiosity_questions WHERE id=? AND status='open'").get(row.id);
    return Boolean(current && current.subject === row.subject && current.created_at === row.created_at &&
      (current.source_kind === 'app' || (current.evidence_revision === row.evidence_revision && current.evidence === row.evidence)) && this.evidenceFor(current));
  }

  async foregroundChanged() {
    if (!this.appAllowed() || this.busy || this.closed) return null;
    this.busy = true;
    try {
      const snapshot = await this.context.snapshot('curiosity-foreground', ['contextForeground']);
      // Revalidate after awaiting native collection / revoked permissions.
      if (!this.appAllowed() || this.closed || snapshot.unavailable || snapshot.provider?.unavailable) return null;
      return this.observeApp(snapshot.foreground?.app);
    } finally { this.busy = false; }
  }

  observeApp(value) {
    if (!this.appAllowed() || this.closed) return null;
    const app = String(value || '').trim();
    if (!VALID_APP.test(app)) return null;
    const subject = app.toLowerCase();
    const time = this.now();
    const previous = this.seen.get(subject) || [];
    const seen = previous.filter(t => time - t >= 0 && time - t <= WINDOW_MS);
    seen.push(time);
    this.seen.set(subject, seen.slice(-10));
    if (this.seen.size > 100) this.seen.delete(this.seen.keys().next().value);
    if (seen.length < 3 || time - (this.last.get(subject) ?? -Infinity) < COOLDOWN_MS) return null;
    this.last.set(subject, time);
    const existing = this.db.prepare("SELECT * FROM curiosity_questions WHERE subject=? AND status='open'").get(subject);
    if (existing) {
      this.db.prepare(`UPDATE curiosity_questions SET evidence_revision=evidence_revision+1, updated_at=? WHERE id=?`)
        .run(time, existing.id);
      return this.db.prepare('SELECT * FROM curiosity_questions WHERE id=?').get(existing.id);
    }
    // Respect a previous dismissal/resolution across restarts and event windows.
    if (this.db.prepare("SELECT id FROM curiosity_questions WHERE subject=? AND status!='open'").get(subject)) return null;
    // Store only a validated application name and event count, never window titles,
    // screenshots, typed text, conversation transcripts or process inventories.
    const question = `The user returned to ${app} several times. Is there a useful reason to offer help, or should I stay quiet?`;
    const result = this.db.prepare(`INSERT INTO curiosity_questions
      (question,subject,evidence,confidence,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(question, subject, 'foreground-activation-repeated', 0.35, 'open', time, time);
    this.prune();
    return this.db.prepare('SELECT * FROM curiosity_questions WHERE id=?').get(Number(result.lastInsertRowid));
  }

  openQuestions(limit = 1) {
    this.prune();
    return this.db.prepare(`SELECT * FROM curiosity_questions WHERE status='open'
      AND evidence_revision>reviewed_revision AND (revisit_at IS NULL OR revisit_at<=?)
      ORDER BY COALESCE(priority,0.5) DESC, COALESCE(reflected_at,created_at), id LIMIT ?`)
      .all(this.now(), 100).filter(row => this.evidenceFor(row)).slice(0, Math.min(10, Math.max(1, limit)));
  }

  recordReflection(id, reflection, revision) {
    if (!this.allowed() || this.closed) return false;
    // Validate at the trust boundary even if a caller has already validated.
    const { validateReflection } = require('./cognitive-reflection');
    const value = validateReflection(reflection);
    const now = this.now();
    const row = this.db.prepare("SELECT * FROM curiosity_questions WHERE id=? AND status='open'").get(id);
    if (!row) return false;
    if (!this.evidenceFor(row) || (row.source_kind !== 'app' && revision !== undefined && revision !== row.evidence_revision)) return false;
    revision ??= row.evidence_revision;
    if (!Number.isSafeInteger(revision) || revision <= row.reviewed_revision || revision > row.evidence_revision) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare(`UPDATE curiosity_questions
        SET question=?,reflection=?,confidence=?,priority=?,next_step=?,reflected_at=?,updated_at=?,
            reviewed_revision=?,revisit_at=?,
            status=CASE WHEN ?='dismiss' THEN 'dismissed' ELSE status END
        WHERE id=? AND status='open' AND reviewed_revision<?`)
        .run(value.question, JSON.stringify({ hypothesis:value.hypothesis, counterpoint:value.counterpoint }),
          value.confidence, value.priority, value.next_step, now, now, revision, now + 6 * 3_600_000, value.next_step, id, revision);
      if (Number(result.changes)) {
        this.db.prepare('INSERT INTO curiosity_reviews(question_id,evidence_revision,reflection,created_at) VALUES(?,?,?,?)')
          .run(id, revision, JSON.stringify(value), now);
        this.db.prepare(`DELETE FROM curiosity_reviews WHERE question_id=? AND id NOT IN
          (SELECT id FROM curiosity_reviews WHERE question_id=? ORDER BY id DESC LIMIT 5)`).run(id, id);
      }
      this.db.exec('COMMIT');
      return Number(result.changes) === 1;
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  reviewContext(id) {
    const source = this.db.prepare('SELECT * FROM curiosity_questions WHERE id=?').get(id);
    if (source?.source_kind !== 'app' && source && !this.evidenceFor(source, { review: true })) return [];
    return this.db.prepare('SELECT evidence_revision,reflection,created_at FROM curiosity_reviews WHERE question_id=? ORDER BY id DESC LIMIT 3')
      .all(id).reverse().map(row => ({ ...row, reflection: JSON.parse(row.reflection) }));
  }

  reserveAttempt() {
    const now = this.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM curiosity_attempts WHERE at<=?').run(now - 3_600_000);
      const rows = this.db.prepare('SELECT at FROM curiosity_attempts').all();
      const allowed = rows.length < 2 && rows.every(row => now - row.at >= 30_000);
      if (allowed) this.db.prepare('INSERT INTO curiosity_attempts(at) VALUES(?)').run(now);
      this.db.exec('COMMIT');
      return allowed;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  attemptsLastHour() {
    return Number(this.db.prepare('SELECT count(*) AS count FROM curiosity_attempts WHERE at>?')
      .get(this.now() - 3_600_000).count);
  }

  conversationState(value) {
    if (value !== undefined) {
      this.db.prepare('INSERT INTO conversation_state(id,state) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state')
        .run(JSON.stringify(value));
      return;
    }
    const row = this.db.prepare('SELECT state FROM conversation_state WHERE id=1').get();
    try { return row ? JSON.parse(row.state) : null; } catch { return null; }
  }

  list(limit = 20) {
    this.prune();
    return this.db.prepare('SELECT * FROM curiosity_questions ORDER BY updated_at DESC LIMIT ?')
      .all(100).filter(row => row.source_kind === 'app' || this.evidenceFor(row, { review: true })).slice(0, Math.min(100, Math.max(1, limit)));
  }

  conversationCandidates() {
    if (!this.allowed() || this.projectSource?.quietFeedback()) return [];
    if (this.db.prepare('SELECT at FROM curiosity_asks WHERE at>? LIMIT 1').get(this.now() - 6 * 3600000)) return [];
    return this.list(100).filter(row => row.source_kind !== 'app' && row.status === 'open' && row.askable &&
      row.next_step === 'ask_later' && row.reviewed_revision === row.evidence_revision && row.asked_revision < row.evidence_revision &&
      !this.db.prepare('SELECT subject FROM curiosity_topic_asks WHERE subject=? AND at>?').get(row.subject, this.now() - 24 * 3600000) &&
      (row.last_asked_at === null || this.now() - row.last_asked_at >= 24 * 3600000) && this.evidenceFor(row)).slice(0, 10);
  }
  reserveQuestion(id, revision) {
    const row = this.conversationCandidates().find(row => row.id === id && row.evidence_revision === revision);
    if (!row) return false;
    this.db.prepare('UPDATE curiosity_questions SET asked_revision=?,last_asked_at=? WHERE id=?').run(revision, this.now(), id);
    this.db.prepare('INSERT INTO curiosity_asks(at) VALUES(?)').run(this.now());
    this.db.prepare('INSERT INTO curiosity_topic_asks(subject,at) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET at=excluded.at').run(row.subject, this.now());
    return true;
  }

  update(id, status) {
    if (!['dismissed','resolved'].includes(status)) throw Error('Invalid question status.');
    const row = this.db.prepare('SELECT * FROM curiosity_questions WHERE id=?').get(id);
    const result = this.db.prepare("UPDATE curiosity_questions SET status=?, updated_at=? WHERE id=? AND status='open'")
      .run(status, this.now(), id);
    if (Number(result.changes) && row.source_kind !== 'app') this.db.prepare('INSERT INTO curiosity_suppressions(subject,until_at) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET until_at=excluded.until_at')
      .run(row.subject, this.now() + 30 * 86400000);
    return Number(result.changes) === 1;
  }

  prune() {
    const cutoff = this.now() - 30 * 86_400_000;
    this.db.prepare('DELETE FROM curiosity_questions WHERE updated_at < ?').run(cutoff);
    this.db.exec(`DELETE FROM curiosity_questions WHERE id NOT IN
      (SELECT id FROM curiosity_questions ORDER BY updated_at DESC LIMIT ${MAX_QUESTIONS})`);
    this.db.exec('DELETE FROM curiosity_reviews WHERE question_id NOT IN (SELECT id FROM curiosity_questions)');
    this.db.prepare('DELETE FROM curiosity_suppressions WHERE until_at<=?').run(this.now());
    this.db.prepare('DELETE FROM curiosity_asks WHERE at<?').run(this.now() - 24 * 3600000);
    this.db.prepare('DELETE FROM curiosity_topic_asks WHERE at<?').run(this.now() - 24 * 3600000);
  }

  clear() {
    this.db.exec('DELETE FROM curiosity_questions');
    this.db.exec('DELETE FROM curiosity_reviews');
    this.seen.clear();
    this.last.clear();
    this.db.exec('DELETE FROM curiosity_suppressions');
    this.db.prepare('INSERT INTO curiosity_project_clear(id,at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at').run(this.now());
  }

  status() {
    return { enabled: this.allowed(), busy: this.busy, questions: this.list().length,
      modelCalls: this.attemptsLastHour(), unsolicitedMessages: 0, stage: 'persistent-inquiry' };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

module.exports = { CognitiveFoundation };
