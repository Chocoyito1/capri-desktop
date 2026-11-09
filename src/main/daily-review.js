'use strict';

const { createHash } = require('node:crypto');
const { permissions } = require('./pc-context');
const { dayKey } = require('./companion-interests');

const signature = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const reference = source => ({ kind: source.kind, id: source.row.id ?? 0, signature: signature(source.row) });
const key = ref => `${ref.kind}:${ref.id}`;
function dayRange(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('Use a date in YYYY-MM-DD format.');
  const [y, m, d] = day.split('-').map(Number), start = new Date(y, m - 1, d);
  if (dayKey(start.getTime()) !== day) throw Error('Invalid calendar date.');
  const end = new Date(y, m - 1, d + 1);
  return { start: start.getTime(), end: end.getTime() };
}
const LABELS = {
  en: ['Daily review', 'Completed goals updated today (user-marked)', 'Decisions saved today', 'User-reported outcomes (unverified)', 'Observed command exits', 'Still open', 'Paused goals', 'Next', 'Saved resume point', 'Saved sources changed or were removed; those items are omitted.', 'No saved evidence of progress for this day.', 'No next step saved.', 'More records were omitted to keep this review short.'],
  es: ['Resumen del día', 'Metas completadas actualizadas hoy (marcadas por ti)', 'Decisiones guardadas hoy', 'Resultados reportados por ti (sin verificar)', 'Códigos de salida observados', 'Pendiente', 'Metas en pausa', 'Siguiente paso', 'Punto guardado para retomar', 'Hay fuentes modificadas o eliminadas; se omitieron esos elementos.', 'No hay evidencia guardada de avances para este día.', 'No hay un siguiente paso guardado.', 'Se omitieron más registros para mantener breve el resumen.'],
  fr: ['Bilan du jour', 'Objectifs terminés mis à jour ce jour (déclarés)', 'Décisions enregistrées', 'Résultats déclarés (non vérifiés)', 'Codes de sortie observés', 'En cours', 'Objectifs en pause', 'Suite', 'Point de reprise enregistré', 'Des sources modifiées ou supprimées ont été omises.', 'Aucun progrès enregistré pour ce jour.', 'Aucune prochaine étape enregistrée.', 'D’autres éléments ont été omis pour garder ce bilan bref.'],
  pt: ['Resumo do dia', 'Metas concluídas atualizadas hoje (declaradas)', 'Decisões salvas hoje', 'Resultados declarados (não verificados)', 'Códigos de saída observados', 'Pendente', 'Metas pausadas', 'Próximo passo', 'Ponto salvo para retomar', 'Fontes alteradas ou excluídas foram omitidas.', 'Nenhum progresso salvo para este dia.', 'Nenhum próximo passo salvo.', 'Outros registros foram omitidos para manter o resumo curto.'],
  ru: ['Итоги дня', 'Завершённые цели, обновлённые сегодня (со слов пользователя)', 'Сохранённые решения', 'Результаты со слов пользователя (не проверены)', 'Наблюдаемые коды завершения команд', 'Открытые цели', 'Приостановленные цели', 'Следующий шаг', 'Сохранённая точка продолжения', 'Изменённые или удалённые источники пропущены.', 'Нет сохранённых данных о прогрессе за этот день.', 'Следующий шаг не сохранён.', 'Другие записи пропущены для краткости.'],
};

// Local evidence synthesis. Stored reviews contain references/hashes, not copied
// conversations, inferred personal facts, screen activity or model speculation.
class DailyReview {
  constructor({ goals, settings, now = Date.now }) {
    Object.assign(this, { goals, settings, now }); this.db = goals.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS companion_daily_reviews (
      scope_id INTEGER NOT NULL, day TEXT NOT NULL, captured_at INTEGER NOT NULL,
      evidence TEXT NOT NULL, omitted INTEGER NOT NULL DEFAULT 0, delivered_at INTEGER,
      PRIMARY KEY(scope_id,day));
      CREATE TABLE IF NOT EXISTS companion_daily_review_cadence (day TEXT PRIMARY KEY, at INTEGER NOT NULL);`);
  }
  scope() { return this.goals.projects.scope() ?? 0; }
  writable() {
    const cfg = this.settings(), p = permissions(cfg.privacy);
    return cfg.dailyReviewEnabled !== false && !cfg.gamingMode && p.memoryEnabled && p.memoryRecall && p.promptBudget > 0;
  }
  readable() {
    const cfg = this.settings(), p = permissions(cfg.privacy);
    if (cfg.gamingMode || !p.memoryEnabled || !p.memoryRecall || !p.promptBudget) throw Error('Daily review recall is disabled.');
  }
  pruneRecords() {
    const days = permissions(this.settings().privacy).retentionDays;
    if (days > 0) this.db.prepare('DELETE FROM companion_daily_reviews WHERE captured_at<?').run(this.now() - days * 86400000);
    this.db.exec(`DELETE FROM companion_daily_reviews WHERE scope_id!=0 AND scope_id NOT IN (SELECT id FROM companion_projects);
      DELETE FROM companion_daily_reviews WHERE rowid NOT IN (SELECT rowid FROM companion_daily_reviews ORDER BY captured_at DESC,rowid DESC LIMIT 90);
      DELETE FROM companion_daily_review_cadence WHERE rowid NOT IN (SELECT rowid FROM companion_daily_review_cadence ORDER BY at DESC,rowid DESC LIMIT 400);`);
  }
  sources() {
    this.goals.prune();
    const scope = this.goals.projects.scope();
    const sources = this.goals.list().filter(row => (row.project_id === null || row.project_id === scope) && row.updated_at <= this.now())
      .map(row => ({ kind: 'goal', row }));
    sources.push(...this.goals.projects.notes(scope).filter(row => row.created_at <= this.now()).map(row => ({ kind: 'note', row })));
    const checkpoint = this.db.prepare('SELECT * FROM companion_checkpoints WHERE scope_id=?').get(scope ?? 0);
    if (checkpoint && checkpoint.updated_at <= this.now() && checkpoint.basis === this.goals.continuity.basis(scope))
      sources.push({ kind: 'checkpoint', row: checkpoint });
    return sources;
  }
  capture(day) {
    const { start, end } = dayRange(day), all = this.sources();
    const today = source => { const at = source.row.updated_at ?? source.row.created_at; return at >= start && at < end; };
    const goals = all.filter(source => source.kind === 'goal'), notes = all.filter(source => source.kind === 'note');
    // Only the most recent observed exit for each command is included. A later
    // successful check must not leave an older failed exit labeled unresolved.
    const commands = new Map();
    for (const source of notes.filter(source => source.row.kind === 'verification')) {
      try {
        const receipt = JSON.parse(source.row.evidence);
        if (receipt.source === 'codex-command-completed' && typeof receipt.command === 'string' && Number.isInteger(receipt.exitCode)
            && !commands.has(receipt.command)) commands.set(receipt.command, source);
      } catch { /* Malformed legacy evidence is not a verification result. */ }
    }
    const candidates = [
      ...goals.filter(source => source.row.status === 'done' && today(source)).slice(0, 4),
      ...notes.filter(source => source.row.kind === 'decision' && today(source)).slice(0, 3),
      ...notes.filter(source => source.row.kind === 'reported-outcome' && today(source)).slice(0, 3),
      ...[...commands.values()].filter(today).slice(0, 4),
      ...goals.filter(source => source.row.status === 'active').slice(0, 4),
      ...goals.filter(source => source.row.status === 'paused').slice(0, 2),
      ...all.filter(source => source.kind === 'checkpoint'),
    ];
    const selected = candidates.slice(0, 20);
    return { refs: selected.map(reference), hasToday: all.some(today),
      omitted: Math.max(0, all.length - selected.length) };
  }
  row(day) {
    dayRange(day); this.goals.prune();
    return this.db.prepare('SELECT * FROM companion_daily_reviews WHERE scope_id=? AND day=?').get(this.scope(), day) || null;
  }
  generate() {
    const day = dayKey(this.now());
    if (!this.writable()) return this.row(day);
    const capture = this.capture(day);
    if (!capture.refs.length) return null;
    const evidence = JSON.stringify(capture.refs), previous = this.row(day);
    if (!previous || previous.evidence !== evidence || previous.omitted !== capture.omitted) this.db.prepare(`
      INSERT INTO companion_daily_reviews(scope_id,day,captured_at,evidence,omitted) VALUES(?,?,?,?,?)
      ON CONFLICT(scope_id,day) DO UPDATE SET captured_at=excluded.captured_at,evidence=excluded.evidence,omitted=excluded.omitted`)
      .run(this.scope(), day, this.now(), evidence, capture.omitted);
    this.pruneRecords(); return this.row(day);
  }
  view(row) {
    if (!row) return null;
    const sources = new Map(this.sources().map(source => [key(reference(source)), source]));
    const groups = { completed: [], decisions: [], reported: [], checks: [], open: [], paused: [], resume: [] };
    let stale = 0;
    for (const ref of JSON.parse(row.evidence)) {
      const source = sources.get(key(ref));
      if (!source || signature(source.row) !== ref.signature) { stale++; continue; }
      const r = source.row;
      if (source.kind === 'goal') groups[{ done: 'completed', active: 'open', paused: 'paused' }[r.status]].push({
        id: r.id, text: r.text, next_step: r.status === 'active' ? r.next_step : '', project_id: r.project_id, updated_at: r.updated_at });
      else if (source.kind === 'checkpoint') groups.resume.push({ text: r.text, updated_at: r.updated_at });
      else if (r.kind === 'verification') {
        const evidence = JSON.parse(r.evidence);
        groups.checks.push({ id: r.id, command: evidence.command, exitCode: evidence.exitCode, created_at: r.created_at });
      } else groups[r.kind === 'decision' ? 'decisions' : 'reported'].push({ id: r.id, text: r.text, created_at: r.created_at });
    }
    return { day: row.day, scope_id: row.scope_id, captured_at: row.captured_at, stale_sources: stale,
      omitted: row.omitted, groups, note: 'Saved evidence only. Completed goals are user-marked, reported outcomes are unverified, and check receipts prove only an observed command exit. Open goals do not grant permission to execute. No transcript or speculative personal facts are stored.' };
  }
  format(view) {
    if (!view) return 'No saved daily review. Enable Memory and daily reviews, then use /review today after saving a goal, decision or check result.';
    const labels = LABELS[this.settings().lang] || LABELS.en;
    const lines = [`${labels[0]} — ${view.day}`];
    const sections = [['completed', 1], ['decisions', 2], ['reported', 3], ['checks', 4], ['open', 5], ['paused', 6], ['resume', 8]];
    for (const [kind, index] of sections) {
      if (!view.groups[kind].length) continue;
      lines.push('', labels[index] + ':');
      for (const row of view.groups[kind]) {
        lines.push(kind === 'checks' ? `• ${row.command}: exit ${row.exitCode}` : `• ${row.id ? '#' + row.id + ' ' : ''}${row.text}`);
        if (row.next_step) lines.push(`  ${labels[7]}: ${row.next_step}`);
      }
    }
    if (!['completed', 'decisions', 'reported', 'checks'].some(kind => view.groups[kind].length)) lines.push('', labels[10]);
    if (!view.groups.open.some(row => row.next_step) && !view.groups.resume.length) lines.push('', labels[11]);
    if (view.stale_sources) lines.push('', labels[9]);
    if (view.omitted) lines.push('', labels[12]);
    return lines.join('\n');
  }
  list() {
    this.goals.prune();
    return this.db.prepare('SELECT day,captured_at,delivered_at,omitted FROM companion_daily_reviews WHERE scope_id=? ORDER BY day DESC LIMIT 90').all(this.scope());
  }
  // Called by the existing presence timer. No new timer, model turn or PC tool.
  tick({ available = false, notify = () => false } = {}) {
    if (!available || !this.writable() || new Date(this.now()).getHours() < 18) return false;
    const day = dayKey(this.now());
    if (this.db.prepare('SELECT day FROM companion_daily_review_cadence WHERE day=? OR at>? LIMIT 1').get(day, this.now() - 20 * 3600000)) return false;
    const capture = this.capture(day);
    if (!capture.hasToday || !capture.refs.length) return false;
    // Durable reservation survives restart, deletion, clock changes and project switches.
    if (Number(this.db.prepare('INSERT OR IGNORE INTO companion_daily_review_cadence(day,at) VALUES(?,?)').run(day, this.now()).changes) !== 1) return false;
    const row = this.generate();
    if (!row || this.settings().dailyReviewNotify !== true || row.delivered_at !== null) return false;
    this.db.prepare('UPDATE companion_daily_reviews SET delivered_at=? WHERE scope_id=? AND day=?').run(this.now(), this.scope(), day);
    const message = this.settings().lang === 'es' ? 'Tu resumen del día está listo. Puedes verlo con /review today.'
      : this.settings().lang === 'fr' ? 'Le bilan du jour est prêt. Consulte /review today.'
      : this.settings().lang === 'pt' ? 'Seu resumo do dia está pronto. Veja /review today.'
      : this.settings().lang === 'ru' ? 'Итоги дня готовы. Открой /review today.'
      : 'Your daily review is ready. You can read it with /review today.';
    return notify(message) === true;
  }
  lookup(action, day = '') {
    this.readable();
    if (!['today', 'list', 'read'].includes(action) || typeof day !== 'string' || (action !== 'read' && day !== '')) throw Error('Invalid daily review request.');
    if (action === 'list') return { reviews: this.list() };
    const view = this.view(action === 'today' ? this.generate() : this.row(day));
    const result = () => ({ review: view, text: this.format(view) });
    // The Codex bridge has a byte limit. Keep complete UTF-8 records and mark
    // omissions rather than failing on long multilingual goals/next steps.
    for (const kind of ['paused', 'resume', 'reported', 'decisions', 'completed', 'checks', 'open']) {
      while (view?.groups[kind].length && Buffer.byteLength(JSON.stringify(result())) > 32000) {
        view.groups[kind].pop(); view.omitted++;
      }
    }
    return result();
  }
  route(text, patch) {
    const match = /^\/review(?:\s+(.*))?$/i.exec(text.trim());
    if (!match) return null;
    const arg = (match[1] || 'today').trim().toLowerCase(), reply = text => ({ handled: true, text });
    if (['on', 'off'].includes(arg)) { patch({ dailyReviewEnabled: arg === 'on' }); return reply('Daily reviews ' + arg + '.'); }
    if (arg === 'list') return reply(JSON.stringify(this.list(), null, 2));
    if (arg === 'export') return reply(JSON.stringify({ version: 1, scope_id: this.scope(), reviews: this.list().map(row => this.view(this.row(row.day))) }, null, 2));
    const forget = /^forget\s+(\d{4}-\d{2}-\d{2})$/.exec(arg);
    if (arg === 'clear' || forget) {
      if (forget) dayRange(forget[1]);
      const result = forget ? this.db.prepare('DELETE FROM companion_daily_reviews WHERE scope_id=? AND day=?').run(this.scope(), forget[1])
        : this.db.prepare('DELETE FROM companion_daily_reviews WHERE scope_id=?').run(this.scope());
      return reply(`${Number(result.changes)} saved review(s) deleted. Goals and project notes remain. Automatic daily cadence is preserved.`);
    }
    if (arg === 'today' || /^\d{4}-\d{2}-\d{2}$/.test(arg)) return reply(this.format(this.view(arg === 'today' ? this.generate() : this.row(arg))));
    return reply('Daily reviews: /review today; /review YYYY-MM-DD; /review list; /review export; /review forget YYYY-MM-DD; /review clear; /review on|off. Reviews use saved evidence, never app visits or transcripts.');
  }
}

module.exports = { DailyReview, dayRange };
