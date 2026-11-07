'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { fact } = require('./memory');
const { permissions } = require('./pc-context');

// User-authored intentions, separate from speculative curiosity and task receipts.
// A saved goal is context, never permission to execute or proof of progress.
class CompanionGoals {
  constructor({ file = ':memory:', settings = () => ({}), now = Date.now } = {}) {
    Object.assign(this, { settings, now });
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS companion_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,
        next_step TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('active','paused','done')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    this.prune();
  }

  prune() {
    const days = permissions(this.settings().privacy).retentionDays;
    if (days > 0) this.db.prepare('DELETE FROM companion_goals WHERE updated_at < ?')
      .run(this.now() - days * 86_400_000);
  }

  list() {
    this.prune();
    return this.db.prepare('SELECT * FROM companion_goals ORDER BY updated_at DESC,id DESC LIMIT 100').all();
  }

  context() {
    const cfg = this.settings(), p = permissions(cfg.privacy);
    if (cfg.gamingMode || !p.memoryEnabled || !p.memoryRecall || !p.promptBudget) return [];
    const result = [];
    for (const { id, text, next_step, updated_at, status } of this.list()) {
      if (status !== 'active') continue;
      const value = { id, text, next_step, updated_at,
        note: 'User-saved intention; not evidence of progress or permission to act.' };
      // Keep exact whole records, within the existing UTF-8 context allowance.
      if (Buffer.byteLength(JSON.stringify([...result, value])) <= p.promptBudget) result.push(value);
      if (result.length === 3) break;
    }
    return result;
  }

  route(text) {
    const match = /^\/goals(?:\s+([\s\S]*))?$/i.exec(text.trim());
    if (!match) return null;
    const arg = (match[1] || 'list').trim();
    const reply = text => ({ handled: true, text });
    const help = 'Saved goals: /goals add <goal>; /goals next <id> <next step>; /goals pause|resume|done <id>; /goals delete <id>; /goals list; /goals export. Goals are saved locally, separately from personal memories. Memory settings control saving, recall and retention. Saving a goal never starts work.';
    if (/^help$/i.test(arg)) return reply(help);
    if (/^list$/i.test(arg)) {
      const rows = this.list();
      return reply(rows.length ? rows.map(row => `#${row.id} [${row.status}] ${row.text}${row.next_step ? `\nNext: ${row.next_step}` : ''}`).join('\n') : 'No saved goals. ' + help);
    }
    if (/^export$/i.test(arg)) return reply(JSON.stringify({ version: 1, goals: this.list() }, null, 2));
    const remove = /^delete\s+#?(\d+)$/i.exec(arg);
    if (remove) return reply(Number(this.db.prepare('DELETE FROM companion_goals WHERE id=?').run(Number(remove[1])).changes)
      ? 'Goal deleted.' : 'Goal not found.');
    const add = /^add\s+([\s\S]+)$/i.exec(arg);
    const next = /^next\s+#?(\d+)\s+([\s\S]+)$/i.exec(arg);
    const update = /^(pause|resume|done)\s+#?(\d+)$/i.exec(arg);
    if (!add && !next && !update) return reply(help);
    const cfg = this.settings();
    if (cfg.gamingMode) return reply('Resume Capri before changing goals.');
    if (!permissions(cfg.privacy).memoryEnabled) return reply('Enable Memory in the control room before saving goals. Listing, export and deletion remain available.');
    this.prune();
    const at = this.now();
    if (add) {
      const value = fact(add[1]);
      if (/[\x00-\x1f\x7f]/.test(value)) throw Error('Use a single line for a goal.');
      const existing = this.db.prepare("SELECT id FROM companion_goals WHERE text=? AND status!='done'").get(value);
      if (existing) return reply(`Goal already saved as #${existing.id}.`);
      if (this.list().length >= 100) return reply('The goal list is full. Delete an old goal before adding another.');
      const result = this.db.prepare("INSERT INTO companion_goals(text,status,created_at,updated_at) VALUES(?,'active',?,?)").run(value, at, at);
      return reply(`Saved goal #${result.lastInsertRowid}: ${value}`);
    }
    let result;
    if (next) {
      const value = fact(next[2]);
      if (/[\x00-\x1f\x7f]/.test(value)) throw Error('Use a single line for a next step.');
      result = this.db.prepare("UPDATE companion_goals SET next_step=?,updated_at=? WHERE id=? AND status!='done'")
        .run(value, at, Number(next[1]));
    } else {
      const status = { pause: 'paused', resume: 'active', done: 'done' }[update[1].toLowerCase()];
      result = this.db.prepare('UPDATE companion_goals SET status=?,updated_at=? WHERE id=?')
        .run(status, at, Number(update[2]));
    }
    return reply(Number(result.changes) ? 'Goal updated.' : 'Matching goal not found.');
  }

  close() { this.db.close(); }
}

module.exports = { CompanionGoals };
