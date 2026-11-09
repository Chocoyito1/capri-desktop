import { SettingsQueue } from './settings-queue.js';

const host = window.settingsHost;
const content = document.querySelector('#content');
let state, page = 'home', busy = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const button = (label, action, cls = '', value) => `<button class="button ${cls}" data-action="${action}" ${typeof value === 'boolean' ? `data-value="${value}"` : ''}>${label}</button>`;
const row = (title, detail, control = '') => `<div class="row"><div class="row__copy"><strong>${title}</strong><p>${detail}</p></div>${control}</div>`;
const toggle = (key, enabled, label) => `<label class="switch"><input type="checkbox" data-key="${key}" ${enabled ? 'checked' : ''} aria-label="${label}"><span></span></label>`;
const field = (key, value, label) => `<input type="text" maxlength="2000" data-key="${key}" value="${esc(value)}" aria-label="${label}">`;
const card = (...rows) => `<div class="card">${rows.join('')}</div>`;
const heading = (tag, title, intro) => `<p class="eyebrow">${tag}</p><h1 id="settings-title">${title}</h1><p class="intro">${intro}</p>`;
const section = title => `<h2 class="section-label">${title}</h2>`;
const options = (key, selected, values, label) => `<select data-key="${key}" aria-label="${label}">${values.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;

function render() {
  if (!state) return;
  const previousPage = content.dataset.page, scrollTop = content.scrollTop;
  const active = document.activeElement;
  const focused = content.contains(active) && active?.dataset ? {
    key: active.dataset.key, scale: active.dataset.scale, action: active.dataset.actionSwitch,
    draft: active.type === 'text' ? active.value : null,
    start: active.selectionStart, end: active.selectionEnd,
  } : null;
  content.dataset.page = page;
  const c = state.config, p = c.privacy, r = state.runtime;
  document.querySelector('#version').textContent = `CAPRI v${r.version}`;
  document.querySelectorAll('nav button[data-page]').forEach(el => { el.classList.toggle('selected', el.dataset.page === page); el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false'); });
  const sw = (key, value, title, detail) => row(title, detail, toggle(key, value, title));
  if (page === 'home') content.innerHTML = heading('YOUR SPACE / YOUR RULES', 'A little more you.', 'Everything Capri needs to feel at home on your desktop.') +
    `<div class="hero"><div class="hero__top"><h2>Capri is ${c.gamingMode ? 'taking a break' : 'right here'}.</h2><span class="badge ${c.gamingMode ? 'paused' : ''}">${c.gamingMode ? 'PAUSED' : 'AGENT ACTIVE'}</span></div><p>Codex reasoning. A familiar personality. Your PC, with a digital ghost looking out for you.</p></div>` +
    section('AT A GLANCE') + `<div class="fact-grid"><div class="fact"><span>CODEX BRAIN</span><strong>OpenAI / Codex CLI</strong></div><div class="fact"><span>PERSONAL MEMORY</span><strong>${p.memoryEnabled ? 'Enabled · stored locally' : 'Off · yours to enable'}</strong></div></div>` + section('QUICK CONTROLS') +
    card(row('Gaming mode', 'Pause proactive AI and hide Capri. Hey Capri remains available when enabled.', `<label class="switch"><input type="checkbox" data-action-switch="gaming" ${c.gamingMode ? 'checked' : ''} aria-label="Gaming mode"><span></span></label>`), row('Desktop presence', 'Ctrl + Alt + C folds Capri into her biochip.', button(c.visible ? 'Put away' : 'Bring back', 'visibility', '', !c.visible))) +
    `<p class="fine">Click Capri to talk. Right-click her or the tray icon to come back here. Consequential actions and requests outside Codex permissions ask for review.</p>`;
  if (page === 'appearance') content.innerHTML = heading('MAKE THE DESKTOP HERS', 'Appearance', 'Her presence, her movement, your preferred screen.') + section('PRESENCE') +
    card(row('Character size', 'Find her place in your workspace.', `<div class="segments" role="group" aria-label="Character size">${[[0.45,'Small'],[0.6,'Medium'],[0.8,'Large']].map(([value,label]) => `<button data-scale="${value}" aria-pressed="${Math.abs(c.scale-value)<.01}">${label}</button>`).join('')}</div>`), row('Display', 'Move Capri to another connected screen.', options('displayId', c.displayId ?? '', [['','Primary display'], ...state.displays.map((d,i) => [d.id, `Screen ${i+1} · ${d.width} × ${d.height}`])], 'Display'))) +
    section('A LIFE OF HER OWN') + card(sw('proactiveEnabled',c.proactiveEnabled !== false,'Start conversations','A brief opening every 5–15 minutes when you are available.'),sw('wander',c.wander,'Wander around','Let her find new places when you’re not chatting.'),sw('windowTracking',c.windowTracking,'Sit on windows','Follow window edges and perch above restored windows.'),sw('possess',c.possess,'Window mischief','Her playful window animation, with no app changes.'),
      sw('idleAnimations',c.idleAnimations !== false,'Idle gestures','Breathing, listening, yawning, stretching and little dances using her original art.'),
      sw('cursorInteractions',c.cursorInteractions !== false,'Pointer & desktop reactions','Notice a nearby pointer and react quietly when the active window changes.'),
      sw('personality',c.personality !== false,'Mood & personality','Local energy and playfulness shape her gestures and chat tone.'),
      sw('dailyRoutine',c.dailyRoutine !== false,'Daily routine','A quiet morning stretch, afternoon glance, evening rest and nighttime yawn.'),
      sw('surpriseAnimations',c.surpriseAnimations !== false,'Rare surprises','Occasional spins, hops and ghost echoes while idle.')) +
    `<p class="fine">Try /actions in chat. Type or dictate “wave”, “dance”, “stretch”, “take a nap”, “wake up”, or “come here”, then Send. Game mode pauses these behaviors; reduced motion keeps her still.</p>`;
  if (page === 'sound') content.innerHTML = heading('A FAMILIAR FREQUENCY', 'Sound', 'Keep her little blips and glitches just how you like them.') +
    card(sw('muted',c.muted,'Mute character sounds','A quieter digital ghost.'), row('Volume', 'Character effects and chat blips.', `<div class="meter"><input type="range" data-key="volume" min="0" max="100" value="${Math.round(c.volume*100)}" aria-label="Volume"><output>${Math.round(c.volume*100)}%</output></div>`)) + section('HANDS-FREE LISTENING') + card(sw('wakeWordEnabled',c.wakeWordEnabled === true,'Hey Capri','Wake a compact voice conversation. A small microphone appears above Capri while listening; click it or say stop listening to end the session. Recognition stays local; session text goes to Codex.')) + section('CUSTOM CUES') +
    card(row('Your sound collection', 'Add your own sound files to replace character cues.',button('Open folder','sounds-folder'))) + section('SPOKEN REPLIES') + card(sw('ttsEnabled',c.ttsEnabled,'Enable voice replies','For voice conversations only. Text chat stays silent.'), row('Voice engine','Qwen uses your chosen character voice with streaming playback.', options('ttsEngine',c.ttsEngine,[['qwen','Qwen — expressive local voice'],['windows','Windows offline voice'],['chatterbox','Chatterbox (local setup)'],['f5','F5-TTS (local setup)']],'Voice engine')), row('Try her voice','Play a short preview with the current voice settings.',button('Preview voice','voice-preview')), ...(c.ttsEngine === 'qwen' ? [row('Voice model folder','Your downloaded Qwen Base model. Speech stays on this PC.',field('ttsModel',c.ttsModel,'Voice model folder'))] : [row('Processing','For Chatterbox and F5. Qwen uses the NVIDIA GPU.', options('ttsDevice',c.ttsDevice,[['cpu','CPU'],['cuda','NVIDIA GPU']],'Processing'))]), row('Python executable','Local neural voice runtime.',field('ttsPython',c.ttsPython,'Python executable')),row('Reference WAV','The recording that defines her voice.',field('ttsReference',c.ttsReference,'Reference WAV')),row('Reference transcript','Exact words spoken in the reference recording.',field('ttsReferenceText',c.ttsReferenceText,'Reference transcript'))) + `<p class="fine">Qwen warms up when you open a conversation, reuses the voice while chatting and releases its model after five minutes without speech. The first warmup takes longer. Neural voices require separately installed model weights.</p>`;
  if (page === 'memory') content.innerHTML = heading('THINGS WORTH KEEPING', 'Memory', 'A little continuity, saved on your own PC. You choose what stays.') +
    card(sw('privacy.memoryEnabled',p.memoryEnabled,'Personal memory','Keep personal facts locally when you ask Capri to remember them.'),sw('privacy.memoryConfirmChanges',p.memoryConfirmChanges,'Review requested changes','Ask before saving, editing or forgetting details. Off: do what you ask directly.'),sw('privacy.memoryCandidates',p.memoryCandidates,'Offer to remember','Let Capri suggest memories during conversation. Each save asks first.'),sw('privacy.memoryRecall',p.memoryRecall,'Recall in conversation','Send relevant saved facts to Codex when recalled.')) +
    section('KEEP / REVIEW / CLEAR') + card(row('Keep memories for', 'Retention starts from the last edit.',options('privacy.retentionDays',p.retentionDays,[[30,'30 days'],[90,'90 days'],[365,'1 year'],[0,'Until I delete them']],'Memory retention')),row('Review your memories','List, edit or forget individual facts in the local commands panel.',button('Review','memory-open'))) + `<div class="actions">${button('Export memories','memory-export')}${button('Delete all memories','memory-delete','danger')}</div>`;
  if (page === 'awareness') content.innerHTML = heading('AWARE / ON YOUR TERMS', 'PC awareness', 'Snapshots are collected locally on demand or activity changes. Selected context may be sent to Codex. No screen recording or keylogging.') +
    `<div class="hero"><div class="hero__top"><h2>Every app included.</h2><span class="badge">AUTOMATIC</span></div><p>New apps are included automatically. There’s no app list to maintain.</p></div>` +
    card(sw('privacy.contextForeground',p.contextForeground,'Active app','Know which app is in front.'),sw('privacy.contextTitles',p.contextTitles,'Window titles','Include titles, which may contain private details.'),sw('privacy.contextProcesses',p.contextProcesses,'Open apps & processes','Read app names and running background processes.'),sw('privacy.contextEvents',p.contextEvents,'Respond to activity changes','Refresh on resume, power changes and foreground changes.')) +
    section('AGENT PRESENCE') + card(sw('systemAccess',c.systemAccess,'System tools','Use Codex shell, file and web tools for your requests; approval prompts appear in Capri.'),sw('screenAwareness',c.screenAwareness,'Screen vision','Use current screen snapshots for your requests. Images are sent to OpenAI; they are not saved.'),sw('autonomyEnabled',c.autonomyEnabled,'Allow companion conversations','Let Capri start a brief conversation while you are available. She waits 5–15 minutes between opportunities and stays quiet when busy.'),sw('proactiveEnabled',c.proactiveEnabled,'Start conversations','Rotate between permitted app context, saved facts, open questions and playful topics. No background screenshots or desktop actions.'),sw('cognitiveEnabled',c.cognitiveEnabled,'Reflect on open questions','Reconsider permitted project evidence and app patterns with Codex, at most twice per hour. Questions remain tentative and cannot start actions.')) +
    section('REUSABLE ROUTINES') + card(sw('routinesEnabled',c.routinesEnabled !== false,'Remember named processes','Teach Capri the steps once, then ask for the process by name. Requires Memory and recall; saving does not run it.'),row('Your routines','Review, edit or forget a saved process. Runs use the usual tools and action review.',button('Review routines','routines-open'))) +
    section('GROUNDED CURIOSITY') + card(sw('projectCuriosityEnabled',c.projectCuriosityEnabled !== false,'Learn from project evidence','With Memory and recall enabled, use saved check results, decisions, next steps and explicit feedback for cautious questions. Relevant saved records are sent to Codex for reflection.'),row('Questions you can review','Repeated app visits alone stay private. Stronger evidence may lead to one brief question, at most every six hours. Dismiss a topic to leave it aside.',button('Review questions','curiosity-open'))) +
    section('DAILY REVIEWS') + card(sw('dailyReviewEnabled',c.dailyReviewEnabled !== false,'Save a daily review','With Memory enabled, quietly summarize saved project evidence after 6 pm. No chat transcripts or screen activity.'),sw('dailyReviewNotify',c.dailyReviewNotify === true,'Offer the daily recap','One brief notification when you are available. Off by default.'),row('Your saved progress','Review outcomes, open goals and the next step. Existing reviews remain available when saving is off.',button('Review today','reviews-open'))) +
    section('CHOSEN INTERESTS') + card(sw('interestsEnabled',c.interestsEnabled,'Develop ongoing interests','With private reflection and companion conversations enabled, Capri can choose or refine one creative interest per day using Codex. These stay separate from your goals and never start desktop actions.'),row('Let a topic grow','Review, pause, dismiss or resolve a chosen interest. Private generation uses general themes, not your screen or saved facts.',button('Review interests','interests-open'))) +
    section('PC CONTEXT') + card(sw('privacy.contextTime',p.contextTime,'Time & day','Use the local clock when relevant.'),sw('privacy.contextPower',p.contextPower,'Battery & power','Notice charging and battery status.'),sw('privacy.contextPerformance',p.contextPerformance,'System performance','Include memory and CPU usage when relevant.'));
  if (page === 'connections') content.innerHTML = heading('BETTER TOGETHER', 'Connections', 'Reasoning uses your signed-in Codex CLI account. Messages, tool results and selected context are sent to OpenAI; account limits apply.') +
    section('PROJECT COMPANION') + card(row(state.project ? `Working with ${esc(state.project.name)}` : 'Choose a project',state.project ? esc(state.project.root) : 'Choose the folder Capri should use for your requested work.',button('Choose folder','project-choose') + (state.project ? button('Use home folder','project-off') : '')),row('Goals and decisions','With Memory enabled, new goals belong to this project. In chat, use /project help to review notes, report outcomes or export your project.')) +
    card(row('Codex executable','Leave empty for automatic discovery, or enter the absolute codex.exe path.',field('codexExecutable',c.codexExecutable,'Codex executable')),row('Model','Leave empty to use the account default.',field('codexModel',c.codexModel,'Codex model')),row('Reasoning effort','Use an effort supported by your model.',options('codexEffort',c.codexEffort,[['low','Low'],['medium','Medium'],['high','High'],['xhigh','Extra high']],'Reasoning effort'))) +
    `<div class="hero"><div class="hero__top"><h2>Codex companion</h2><span class="badge ${state.integration.lastSeen ? '' : 'paused'}">${state.integration.lastSeen ? 'CONNECTED' : 'WAITING'}</span></div><p>${state.integration.lastSeen ? 'Receiving local activity notifications from Codex.' : 'No real Codex activity received in this run yet.'}</p></div>` +
    card(row('Local notifications', 'Work, completion and approval alerts from Codex.'),row('Approval stays with you','Review Codex approvals in Codex. Capri’s desktop actions ask separately.')) + `<p class="fine">Regular ChatGPT conversations are not connected. Manage trusted notification hooks with /hooks in Codex.</p>`;
  if (page === 'updates') content.innerHTML = heading('KEEP HER CURRENT', 'Updates & app', 'One place for versions, restarts and how Capri starts with you.') +
    `<div class="hero"><div class="hero__top"><h2>CapriGPT ${esc(r.version)}</h2><span class="badge ${r.currentSource ? '' : 'paused'}">${r.currentSource ? 'SOURCE LOADED' : 'RESTART READY'}</span></div><p>${r.currentSource ? 'This session is running the current local source.' : 'Your local source has changed. Restart Capri to load the new version.'}</p></div>` +
    `<div class="actions">${button('Check local changes','refresh')}${button('Restart Capri','restart','primary')}</div><p class="fine">Updates are managed in this local project. Restarting loads saved changes; it does not download a new release.</p>` +
    section('YOUR ROUTINE') + card(row('Start with Windows','Launch Capri directly, without a terminal.', `<label class="switch"><input type="checkbox" data-action-switch="startup" ${state.startup ? 'checked' : ''} aria-label="Start with Windows"><span></span></label>`),row('Conversation language','Used when your message doesn’t specify a language.',options('lang',c.langSetting,[['auto','Follow Windows'],['en','English'],['es','Español'],['fr','Français'],['pt','Português'],['ru','Русский']],'Conversation language'))) +
    section('LOCAL BUILD') + `<p class="mono">${esc(r.build)}<br>${esc(r.root)}</p>`;
  if (previousPage === page) content.scrollTop = scrollTop;
  else {
    content.classList.remove('is-changing-page');
    void content.offsetWidth;
    content.classList.add('is-changing-page');
  }
  if (focused && previousPage === page) {
    const replacement = [...content.querySelectorAll('[data-key], [data-scale], [data-action-switch]')].find(el =>
      focused.key ? el.dataset.key === focused.key : focused.scale ? el.dataset.scale === focused.scale : focused.action && el.dataset.actionSwitch === focused.action);
    if (replacement) {
      if (focused.draft !== null && replacement.type === 'text') {
        replacement.value = focused.draft;
        replacement.setSelectionRange(focused.start, focused.end);
      }
      replacement.focus({ preventScroll: true });
    }
  }
}
function notice(text, error = false) { document.querySelector('#notice').textContent = text; document.querySelector('.statusbar').classList.toggle('error',error); }
const transactions = new SettingsQueue({
  onBusy(active) {
    busy = active;
    if (active) { document.body.setAttribute('aria-busy', 'true'); notice('Saving...'); }
    else document.body.removeAttribute('aria-busy');
  },
  onResult(result, { redraw = true } = {}) {
    if (result?.state) state = result.state; else if (result?.config) state = result;
    if (redraw && transactions.pending === 1) render();
    notice(result?.message || 'Saved.');
  },
  onError(error) {
    notice(String(error.message || error).replace(/^Error invoking remote method .*?: Error: /, ''), true);
    if (transactions.pending === 1) render();
  },
});
function perform(task, options) { return transactions.run(task, options); }

document.addEventListener('click', event => {
  const nav = event.target.closest('nav button[data-page]');
  if (nav) { page = nav.dataset.page; render(); content.scrollTop=0; return; }
  const scale = event.target.closest('[data-scale]');
  if (scale) { const value = Number(scale.dataset.scale); perform(() => host.patch({ scale: value })); }
  const action = event.target.closest('[data-action]');
  if (action) { const name = action.dataset.action, value = action.dataset.value; perform(() => host.action(name, value === undefined ? undefined : value === 'true')); }
});
document.addEventListener('input', event => { if (event.target.dataset.key === 'volume') event.target.nextElementSibling.textContent = `${event.target.value}%`; });
document.addEventListener('change', event => {
  const el = event.target;
  if (el.dataset.actionSwitch) { const name = el.dataset.actionSwitch, value = el.checked; perform(() => host.action(name, value)); return; }
  if (!el.dataset.key) return;
  const key = el.dataset.key;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (key === 'volume') value = Number(value)/100;
  if (key === 'displayId') value = value === '' ? null : Number(value);
  if (key === 'autonomyIntervalSeconds') value = Number(value);
  if (key === 'privacy.retentionDays') value = Number(value);
  perform(() => host.patch(key.startsWith('privacy.') ? {privacy:{[key.slice(8)]:value}} : {[key]:value}));
});
document.querySelector('#close').addEventListener('click', () => host.action('close'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') host.action('close'); });
host.onUpdate(value => { state = value; if (!busy && !content.contains(document.activeElement)) render(); });
try { state = await host.state(); render(); document.documentElement.dataset.settingsReady='true'; }
catch (error) { notice(error.message,true); }
