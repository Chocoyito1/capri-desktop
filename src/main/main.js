'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, Tray, ipcMain, screen, protocol, net, shell, globalShortcut, nativeImage,
  clipboard, ClipboardItem, dialog, powerMonitor, desktopCapturer,
} = require('electron');

const config = require('./config');
const { LANGS } = require('./labels');
const { createSettingsWindow } = require('./settings-window');
const { overlayPatch } = require('./settings-policy');
const { SettingsAgent } = require('./settings-agent');
const { createBridge } = require('./bridge');
const { startWindowWatch } = require('./windows');
const { startFullscreenWatch } = require('./fullscreen');
const { SpeechInput } = require('./speech');
const { SpeechOutput } = require('./tts');
const { CodexBrain } = require('./codex-brain');
const { CodexTools } = require('./codex-tools');
const { ScreenAccess } = require('./screen-access');
const { CognitiveFoundation } = require('./cognitive-foundation');
const { GroundedCuriosity } = require('./grounded-curiosity');
const { ReflectionEngine } = require('./cognitive-reflection');
const { ProactiveConversation } = require('./proactive-conversation');
const { CompanionInterests } = require('./companion-interests');
const { CompanionGoals } = require('./companion-goals');
const { personalityContext } = require('./personality');
const { CodexEvents } = require('./codex-events');
const { connectionFile } = require('../../hooks/caprigpt-codex-hook');
const codexEvents = new CodexEvents();
let integrationToken;
const apps = require('./apps');
const { MemoryStore } = require('./memory');
const { ContextService, permissions } = require('./pc-context');
const { PersonalAssistant } = require('./personal-assistant');
const { MemoryAgent } = require('./memory-agent');
const { Agent } = require('./agent');
const { ForegroundPriority } = require('./foreground-priority');
const { ActionAgent } = require('./action-agent');
const { WebTools } = require('./web-tools');
const { DesktopTools } = require('./desktop-tools');
const { RequestInterpreter } = require('./request-interpreter');
const { createAgentBrowser } = require('./agent-browser');
const { WorldState } = require('./world-state');
const capabilities = require('./capabilities');
let memoryStore, goalStore, autonomy, reflection, curiosity, interests;
let sessionAvailable = true;
let projectRouting = false;
let projectFeedbackAnchor = null;
// A spoken wake address temporarily permits requested foreground work, not background actions.
let voiceSession = false;
const agentConfig = () => voiceSession ? { ...config.load(), gamingMode: false } : config.load();
let presentation = personalityContext();
const bodyJobs = new Map();
const memory = () => {
  if (!memoryStore) memoryStore = new MemoryStore(path.join(app.getPath('userData'), 'personal-memory.sqlite'), {
    retentionDays: () => permissions(config.load().privacy).retentionDays,
  });
  return memoryStore;
};
const pcContext = new ContextService({ settings: () => config.load() });
const goals = () => {
  if (!goalStore) goalStore = new CompanionGoals({
    file: path.join(app.getPath('userData'), 'companion-goals.sqlite'), settings: () => config.load(),
    choose: async () => {
      const result = await dialog.showOpenDialog({ title: 'Choose Capri’s project folder', properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    },
    confirm: confirmMemory,
  });
  return goalStore;
};
const world = new WorldState({ context: pcContext });
const closeApp = require('./action-confirmation').createCloseHandler({ config, apps, dialog });
const foreground = new ForegroundPriority(() => ({
  get busy() { return agent.busy || Boolean(autonomy?.busy) || Boolean(reflection?.busy); },
  get reason() { return agent.busy ? agent.reason : 'autonomous'; },
  get done() { return Promise.allSettled([agent.done, autonomy?.done, reflection?.done]); },
  cancel() { agent.cancel(); autonomy?.cancel(); reflection?.cancel(); },
}));
// Legacy structured decision services use the same Codex transport, never Ollama.
const decisionBrain = new CodexBrain({ settings: () => config.load(),
  cwd: path.join(app.getPath('temp'), 'caprigpt-codex-decisions'),
  tools: { specs: () => [], instructions: () => 'Return only the JSON decision requested in the supplied schema. No tools or actions.' } });
const inferDecision = async (request, signal) => {
  const stop = () => decisionBrain.cancel();
  signal?.throwIfAborted(); signal?.addEventListener('abort', stop, { once: true });
  try {
    decisionBrain.reset();
    return await decisionBrain.chat(JSON.stringify({ schema: request.schema, messages: request.messages }));
  } finally { signal?.removeEventListener('abort', stop); decisionBrain.reset(); }
};
const decisionModels = async () => ['codex'];
const agent = new Agent({ model: 'codex',
  settings: () => config.load(), world, models: decisionModels, apps, close: closeApp,
  infer: inferDecision,
  idle: () => !chats.size && !actions.busy && !memoryRequests.busy && !requests.busy,
  foregroundBusy: () => foreground.active > 0,
  recall: query => {
    const p = permissions(config.load().privacy);
    return p.memoryEnabled && p.memoryRecall ? memory().search(query, 2) : [];
  },
  audit: (kind, status) => { try { memory().audit(kind, status); } catch { console.error('[capri] Agent journal unavailable.'); } },
  notify: text => overlay?.webContents.send('agent:suggestion', text),
});
const agentBrowser = createAgentBrowser();
const actions = new ActionAgent({ settings: () => config.load(), models: decisionModels,
  infer: inferDecision, web: new WebTools(),
  desktop: new DesktopTools({ openPath: file => shell.openPath(file), openExternal: url => shell.openExternal(url), native: require('./native-windows') }),
  browser: agentBrowser, idle: () => !chats.size && !agent.busy && !memoryRequests.busy,
  progress: event => overlay?.webContents.send('task:progress', event),
});
const requests = new RequestInterpreter({ actions, settings: () => config.load(), models: decisionModels,
  infer: inferDecision,
  progress: event => overlay?.webContents.send('task:progress', event),
});
const settingsRequests = new SettingsAgent({ localOnly: true, state: settingsState, patch: updateConfig,
  action: settingsAction, open: openSettings,
  infer: inferDecision,
});
const confirmMemory = async (message, detail) => (await dialog.showMessageBox({ type: 'question',
  title: 'Capri — Personal memory', message, detail, buttons: ['Cancel', 'Confirm'],
  defaultId: 0, cancelId: 0, noLink: true })).response === 1;
const memoryRequests = new MemoryAgent({settings: () => config.load(), store: memory,
  models: decisionModels, infer: inferDecision,
  confirm: confirmMemory, idle: () => !chats.size && !agent.busy && !actions.busy,
});
const personal = new PersonalAssistant({
  settings: () => config.load(), store: memory, context: pcContext,
  confirm: confirmMemory,
  exportFile: async (text) => {
    const result = await dialog.showSaveDialog({ title: 'Export personal memories (plain text JSON)',
      defaultPath: 'capri-memories.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, text, { mode: 0o600 }); return true;
  },
});

const screenAccess = new ScreenAccess({ settings: agentConfig,
  displays: () => {
    const fg = require('./native-windows').foregroundBounds();
    const active = fg ? screen.getDisplayNearestPoint(screen.screenToDipPoint({ x: Math.round(fg.x + fg.width / 2), y: Math.round(fg.y + fg.height / 2) })).id : screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds, primary: d.id === screen.getPrimaryDisplay().id, active: d.id === active }));
  },
  foreground: () => require('./native-windows').foregroundBounds(),
  toNativePoint: point => screen.dipToScreenPoint(point), input: require('./desktop-input').perform,
  confirm: confirmMemory,
  capture: async display => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 }, fetchWindowIcons: false });
    const source = sources.find(row => row.display_id === String(display.id));
    if (!source || source.thumbnail.isEmpty()) throw Error('Windows did not provide a screen image.');
    const size = source.thumbnail.getSize();
    return { url: `data:image/jpeg;base64,${source.thumbnail.toJPEG(65).toString('base64')}`, ...size };
  },
});
const currentContext = () => {
  const p = permissions(agentConfig().privacy);
  const savedContinuity = goals().continuity.context();
  const remaining = Math.max(0, p.promptBudget - Buffer.byteLength(JSON.stringify(savedContinuity)));
  const savedGoals = p.memoryEnabled && !savedContinuity.length ? goals().context() : [];
  return { presentation, capabilities: capabilities.registry(agentConfig()), externalCodexEvents: codexEvents.snapshot(),
  savedContinuity, savedGoals, currentProject: goals().projects.context(Math.max(0, remaining - Buffer.byteLength(JSON.stringify(savedGoals)))),
  companionInterests: interests?.context() || [],
  recentTasks: actions.grounding({ includeApps: false }),
  recentConversation: brain?.history?.slice(-6) || [] };
};
const brainTools = new CodexTools({ settings: agentConfig, context: pcContext, screen: screenAccess,
  body: (action, { check, signal }) => new Promise((resolve, reject) => {
    check(); if (!overlay || overlay.isDestroyed() || config.load().gamingMode) return reject(Error('Capri’s body is unavailable.'));
    const id = randomBytes(12).toString('hex');
    const finish = (error, result) => { clearTimeout(timer); signal.removeEventListener('abort', stop); bodyJobs.delete(id); error ? reject(error) : resolve(result); };
    const stop = () => finish(Error('Body action cancelled.'));
    const timer = setTimeout(() => finish(Error('Body action timed out.')), 10000);
    bodyJobs.set(id, result => finish(null, result)); signal.addEventListener('abort', stop, { once: true });
    overlay.webContents.send('companion:body', { id, action });
  }),
  actions, store: memory, goals, curiosity: () => curiosity, state: settingsState, patch: updateConfig, confirm: confirmMemory });
const brain = new CodexBrain({ settings: agentConfig,
  cwd: path.join(app.getPath('temp'), 'caprigpt-codex-brain'), tools: brainTools,
  systemTools: () => config.load().systemAccess === true, workspace: () => goals().projects.workspace() || app.getPath('home'), context: currentContext,
  onOutcome: receipt => {
    const saved = goals().projects.recordVerification(receipt);
    if (saved) {
      projectFeedbackAnchor = { scope: goals().projects.scope(), at: Date.now() };
      groundedCuriosity.sync(); reflection.schedule();
    }
    return saved;
  },
  approve: async (message, { text, signal, item }) => {
    signal.throwIfAborted();
    const p = message.params;
    return confirmMemory('Review Codex action', JSON.stringify({ currentRequest: text, action: message.method,
      reason: p.reason, command: p.command, cwd: p.cwd, permissions: p.permissions, grantRoot: p.grantRoot, routine: brainTools.routineSession ? { name: brainTools.routineSession.row.name, version: brainTools.routineSession.row.version, step: brainTools.routineSession.index + 1, instruction: brainTools.routineSession.step() } : null, item: item || p.itemId }, null, 2).slice(0, 12000));
  },
});

const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require('../../package.json').version;
const runtime = require('./runtime-info').runtimeInfo(ROOT, VERSION);
const DEV = process.argv.includes('--dev');
// Keep this prototype's preferences separate from the original app.
const smokeTest = process.argv.some((arg) => path.basename(arg) === 'smoke-electron.js');
app.setPath('userData', smokeTest && process.env.CAPRIGPT_TEST_PROFILE
  ? process.env.CAPRIGPT_TEST_PROFILE : path.join(app.getPath('appData'), 'CapriGPT'));
// Installed Codex transport with no background tools, actions or conversation history.
const cognitiveBrain = new CodexBrain({ settings: () => config.load(),
  cwd: path.join(app.getPath('temp'), 'caprigpt-codex-cognition'),
  tools: { specs: () => [], instructions: () => 'Return only the requested JSON. No tools or actions.' } });
const inferCognitive = async (request, signal) => {
  const stop = () => cognitiveBrain.cancel();
  signal?.throwIfAborted(); signal?.addEventListener('abort', stop, { once: true });
  try {
    cognitiveBrain.reset();
    return await cognitiveBrain.chat(JSON.stringify(request.messages), () => {}, () => {},
      { outputSchema: request.schema, recordHistory: false });
  } finally { signal?.removeEventListener('abort', stop); cognitiveBrain.reset(); }
};
curiosity = new CognitiveFoundation({ file: path.join(app.getPath('userData'), 'curiosity.sqlite'),
  settings: () => config.load(), context: pcContext });
interests = new CompanionInterests({ db: curiosity.db, settings: () => config.load() });
const groundedCuriosity = new GroundedCuriosity({ journal: curiosity, goals, settings: () => config.load() });
const cognitiveIdle = () => !foreground.active && !chats.size && !brain.busy && !agent.busy &&
  !actions.busy && !memoryRequests.busy && !requests.busy && !settingsRequests.busy;
reflection = new ReflectionEngine({ journal: curiosity, settings: () => config.load(),
  model: 'codex', models: decisionModels, infer: inferCognitive,
  canRun: () => cognitiveIdle() && !autonomy?.busy && sessionAvailable && !voiceSession &&
    (!speech.current || speech.current.mode === 'wake') && !fullscreenState.active });
autonomy = new ProactiveConversation({ settings: rendererConfig, journal: curiosity,
  interests,
  model: 'codex', models: decisionModels, infer: inferCognitive,
  observe: () => pcContext.snapshot('companion-conversation', ['contextForeground']),
  memories: () => memory().list(10),
  canRun: () => cognitiveIdle() && !reflection.busy && sessionAvailable &&
    (!speech.current || speech.current.mode === 'wake') && !voiceSession && !fullscreenState.active &&
    !presentation.chatOpen && presentation.canSpeak !== false &&
    Boolean(overlay && !overlay.isDestroyed() && overlay.isVisible()) && powerMonitor.getSystemIdleTime() < 300,
  notify: text => {
    if (!overlay || overlay.isDestroyed() || presentation.chatOpen || fullscreenState.active) return false;
    brain.history = [...brain.history, { role: 'assistant', content: text }].slice(-24);
    overlay.webContents.send('companion:conversation', text); return true;
  },
});
const PORT = Number(process.env.CAPRI_PORT) || 47823;
const SOUND_EXT = /\.(mp3|wav|ogg|m4a)$/i;

protocol.registerSchemesAsPrivileged([
  { scheme: 'capri', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let overlay = null;
let tray = null;
let settingsRoom = null;
let windowWatch = null;
let fullscreenWatch = null;
let fullscreenState = { active: false, revision: 0 };
let fullscreenHideTimer;
// the watcher only speaks when something changes: the overlay asks for this when it (re)loads
let lastWindows = null;
const chats = new Map(); // id -> AbortController of an answer being streamed
const wakeAllowed = () => Boolean(overlay && !overlay.isDestroyed() && config.load().wakeWordEnabled === true
  && (!smokeTest || process.argv.includes('--wake-live')));
const speech = new SpeechInput({
  runtimeDir: app.isPackaged ? path.join(app.getPath('userData'),'speech-runtime') : path.join(ROOT,'.caprigpt-local','speech-runtime'),
  allowed: () => Boolean(overlay && !overlay.isDestroyed() && (voiceSession || (overlay.isVisible()
    && !config.load().gamingMode && !fullscreenState.active))),
  wakeAllowed,
  notify: state => {
    if (!overlay || overlay.isDestroyed()) return;
    if (state.type === 'wake' || (state.type === 'ready' && state.mode === 'conversation')) {
      voiceSession = true; autonomy.cancel(); tts.cancel(); tts.warm();
      clearTimeout(fullscreenHideTimer);
      overlay.webContents.setBackgroundThrottling(false); overlay.showInactive();
    }
    overlay.webContents.send('speech:state', state);
  },
});

const tts = new SpeechOutput({ root: ROOT, config: () => config.load(),
  allowed: () => speech.allowed() && (voiceSession || config.load().visible !== false)
    && (!speech.current || ['wake', 'conversation'].includes(speech.current.mode)),
  notify: state => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('tts:state', state); },
});

function endVoiceSession() {
  voiceSession = false;
  if (speech.current?.wakeActivated) speech.cancel();
  if (overlay && !overlay.isDestroyed() && (fullscreenState.active || config.load().gamingMode)) {
    overlay.setIgnoreMouseEvents(true, { forward: true }); overlay.setFocusable(false); overlay.hide();
  }
}

const userSoundsDir = () => path.join(app.getPath('userData'), 'sounds');

// capri://app/...        -> files of this repo
// capri://usersounds/... -> the user's own sound overrides
function serveProtocol() {
  protocol.handle('capri', (request) => {
    const url = new URL(request.url);
    const base = url.host === 'usersounds' ? userSoundsDir() : ROOT;
    const target = path.resolve(base, '.' + decodeURIComponent(url.pathname));
    if (target !== base && !target.startsWith(base + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function targetDisplay() {
  const { displayId } = config.load();
  return screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

function fitOverlay() {
  if (!overlay) return;
  const { workArea } = targetDisplay();
  overlay.setBounds(workArea);
  overlay.webContents.send('overlay:resize', { width: workArea.width, height: workArea.height });
}

function createOverlay() {
  const { workArea } = targetDisplay();
  overlay = new BrowserWindow({
    ...workArea,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // showInactive() preserves foreground focus. Keep the window capable of
    // receiving native mouse input; only explicit chat/menu requests focus it.
    focusable: true,
    hasShadow: false,
    alwaysOnTop: true,
    type: process.platform === 'win32' ? 'toolbar' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  const microphonePermission = (contents, permission, details={}) =>
    contents === overlay?.webContents && permission === 'media' && Boolean(speech.current)
      && speech.permitted(speech.current) && (!details.mediaTypes || details.mediaTypes.every(type=>type==='audio'))
      && (!details.mediaType || details.mediaType==='audio');
  overlay.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(microphonePermission(contents,permission,details)));
  overlay.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) => microphonePermission(contents,permission,details));
  overlay.loadURL('capri://app/src/renderer/index.html');
  // always shown: put away, she's still there as her biochip in the corner
  overlay.once('ready-to-show', () => {
    if (!config.load().gamingMode && !fullscreenState.active) {
      overlay.showInactive(); if (config.load().visible !== false) tts.warm();
    }
  });
  overlay.webContents.on('render-process-gone', (_e, details) => {
    speech.cancel(true); tts.cancel(); endVoiceSession();
    console.error('[capri] renderer gone:', details.reason);
  });
  overlay.webContents.on('did-start-loading', () => { speech.cancel(true); tts.cancel(); endVoiceSession(); });
  if (DEV) {
    overlay.webContents.on('console-message', (e) => {
      const { level, message, lineNumber, sourceId } = e;
      console.log(`[renderer:${level}] ${message} (${String(sourceId).split('/').pop()}:${lineNumber})`);
    });
    if (process.env.CAPRI_DEVTOOLS) overlay.webContents.openDevTools({ mode: 'detach' });
  }
}

function sendCommand(name, payload = {}) {
  if (config.load().gamingMode) return;
  overlay?.webContents.send('capri:command', { name, ...payload });
}

let gamingTransition = false;
async function gamingAnimation(name) {
  if (!overlay || overlay.isDestroyed() || overlay.webContents.isLoading()) return;
  await new Promise(resolve => {
    const contents = overlay.webContents;
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener('gaming:animation-ready', ready);
      resolve();
    };
    const ready = event => { if (event.sender === contents) finish(); };
    const timer = setTimeout(finish, 1100);
    ipcMain.on('gaming:animation-ready', ready);
    contents.send('capri:command', { name });
  });
}
async function setGamingMode(on) {
  if (gamingTransition) return;
  gamingTransition = true;
  try {
    updateConfig({ gamingMode: on });
    if (on) {
      brain.cancel(); decisionBrain.cancel();
      const pending = [...chats.values()];
      pending.forEach(({ abort }) => abort.abort());
      overlay?.setFocusable(false);
      pcContext.lastEvent = null;
      windowWatch?.stop();
      windowWatch = null;
      // Bounded goodbye: a missing renderer or a hidden pet cannot delay the pause.
      if (overlay?.isVisible()) await gamingAnimation('gamingDeparture');
      if (!voiceSession) overlay?.hide();
      // Wait for cancelled requests to finish before sending the unload request.
      await Promise.allSettled(pending.map(({ done }) => done));
      await agent.done;
      await requests.done;
      await actions.done;
      agentBrowser.stop();
    } else {
      await gamingAnimation('gamingPrepareReturn');
      if (!fullscreenState.active) overlay?.showInactive();
      overlay?.webContents.send('capri:command', { name: 'gamingArrival' });
      watchWindows();
      overlay?.webContents.send('integration:state', { ...codexEvents.snapshot(), resumed: true });
    }
  } finally { gamingTransition = false; rebuildTray(); }
}

function watchWindows() {
  if (windowWatch || config.load().gamingMode || !config.load().windowTracking) return;
  windowWatch = startWindowWatch({ overlay, onUpdate: (data) => {
    if (lastWindows && lastWindows.fg !== data.fg) curiosity.foregroundChanged().then(question => {
      if (question) reflection.schedule();
    }).catch(() => {});
    lastWindows = data;
    overlay?.webContents.send('windows:update', data);
  } });
}

function onFullscreen(active) {
  if (active === fullscreenState.active) return;
  const revision = fullscreenState.revision + 1;
  fullscreenState = { active, revision };
  if (active) { if (speech.current?.mode !== 'wake' && !speech.current?.wakeActivated) speech.cancel(); if (!voiceSession) tts.cancel(); }
  clearTimeout(fullscreenHideTimer);
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.setBackgroundThrottling(false);
  if (active) {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    if (!voiceSession) overlay.setFocusable(false);
    // Renderer normally acknowledges in 160 ms. This also handles a frozen renderer.
    fullscreenHideTimer = setTimeout(() => {
      if (!voiceSession && fullscreenState.active && fullscreenState.revision === revision && !overlay?.isDestroyed()) {
        overlay?.hide();
        overlay?.webContents.setBackgroundThrottling(true);
      }
    }, 260);
  } else if (!config.load().gamingMode) {
    // setFocusable(false) on departure changes native mouse activation too.
    // Restore it without activating or focusing over the user's foreground app.
    overlay.setFocusable(true);
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.showInactive();
  }
  overlay.webContents.send('fullscreen:state', fullscreenState);
}

// Ctrl+Alt+C: she folds herself away into her biochip in the corner, or comes back out of it.
function toggleVisible(force) {
  const visible = typeof force === 'boolean' ? force : !config.load().visible;
  if (!visible) { if (speech.current?.mode !== 'wake') speech.cancel(); tts.cancel(); }
  config.save({ visible });
  sendCommand('stow', { on: !visible });
  rebuildTray();
}

// During the demo, a little fake terminal for her to sit on and take over (window tracking is
// Windows only, so only there). Opened without stealing focus; closing it drops her off it.
let demoWin = null;
const DEMO_TERMINAL = `<body style="margin:0;background:#14101c;color:#8f8aa3;font:13px/1.7 Consolas,monospace;padding:14px 18px">
<div style="color:#36ff7a">PS C:\\night-city-api&gt; npm test -- gigs</div>
<div>&nbsp;&nbsp;GET /gigs</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ returns 20 items per page</div>
<div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ paginates with a cursor</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ rejects a bad cursor</div>
<div>&nbsp;&nbsp;6 passing (212ms)</div><div style="color:#36ff7a">PS C:\\night-city-api&gt; _</div></body>`;

function demoWindow(open) {
  demoWin?.destroy();
  demoWin = null;
  if (!open || process.platform !== 'win32') return false;
  const b = overlay.getBounds();
  demoWin = new BrowserWindow({
    x: Math.round(b.x + b.width * 0.5 - 310), y: Math.round(b.y + b.height * 0.42), width: 620, height: 300,
    show: false, alwaysOnTop: true, title: 'night-city-api — npm test', backgroundColor: '#14101c', autoHideMenuBar: true,
  });
  demoWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DEMO_TERMINAL)}`);
  demoWin.once('ready-to-show', () => demoWin?.showInactive());
  demoWin.on('closed', () => { demoWin = null; });
  return true;
}

// 'auto' -> the first system language Capri speaks, English otherwise.
function resolveLang(setting) {
  if (LANGS.includes(setting)) return setting;
  const preferred = [...app.getPreferredSystemLanguages(), app.getSystemLocale(), app.getLocale()];
  for (const tag of preferred) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

// What the overlay gets: `lang` is the resolved one, `langSetting` what the user picked.
function rendererConfig() {
  const cfg = config.load();
  return { ...cfg, wakeWordEnabled: smokeTest && !process.argv.includes('--wake-live') ? false : cfg.wakeWordEnabled,
    lang: resolveLang(cfg.lang), langSetting: cfg.lang };
}

function updateConfig(patch) {
  const changes = key => Object.hasOwn(patch, key);
  const policyChanged = ['routinesEnabled', 'gamingMode', 'agentEnabled', 'desktopActions', 'privacy', 'systemAccess', 'screenAwareness', 'autonomyEnabled', 'autonomyScreen'].some(changes);
  const backendChanged = ['codexModel', 'codexExecutable', 'codexEffort'].some(changes);
  if (['routinesEnabled', 'projectCuriosityEnabled', 'dailyReviewEnabled', 'dailyReviewNotify', 'proactiveEnabled', 'cognitiveEnabled', 'interestsEnabled', 'visible', 'lang'].some(changes)) {
    if (typeof autonomy !== 'undefined') autonomy?.touch();
    if (typeof reflection !== 'undefined') reflection?.cancel();
  }
  if (policyChanged || backendChanged) {
    if (typeof autonomy !== 'undefined') autonomy?.touch();
    if (typeof reflection !== 'undefined') reflection?.cancel();
    settingsRequests.cancel(); agent.cancel(); requests.cancel();
    brain.cancel(); decisionBrain.cancel();
  }
  if (['gamingMode', 'privacy'].some(changes) || backendChanged) memoryRequests.cancel();
  if (['gamingMode', 'privacy'].some(changes) || backendChanged) brain.reset();
  if ((patch.gamingMode === true || patch.visible === false) && speech.current?.mode !== 'wake') speech.cancel();
  if (patch.gamingMode === true || patch.visible === false
      || ['muted', 'volume', 'ttsEnabled', 'ttsEngine', 'ttsPython', 'ttsModel', 'ttsReference', 'ttsReferenceText', 'ttsDevice'].some(changes)) tts.cancel();
  if (['ttsEnabled', 'ttsEngine', 'ttsPython', 'ttsModel', 'ttsReference', 'ttsReferenceText'].some(changes) || patch.muted === true) tts.close();
  if (patch.privacy) patch = { ...patch, privacy: permissions({ ...config.load().privacy, ...patch.privacy }) };
  config.save(patch);
  if (patch.wakeWordEnabled === false) { speech.cancel(); endVoiceSession(); }
  if (Object.hasOwn(patch, 'displayId')) fitOverlay();
  pcContext.eventSnapshot(); // discard event fields when permissions are revoked
  if (!config.load().windowTracking) {
    windowWatch?.stop(); windowWatch = null; lastWindows = null;
    overlay?.webContents.send('windows:update', { fg: null, wins: [] });
  } else if (overlay) watchWindows();
  if (memoryStore) memoryStore.prune();
  goalStore?.prune();
  const cfg = rendererConfig();
  overlay?.webContents.send('capri:config', cfg);
  rebuildTray();
  return cfg;
}

function settingsState() {
  return { config: { ...rendererConfig(), privacy: permissions(config.load().privacy) },
    runtime: runtime(), integration: codexEvents.snapshot(),
    project: goals().projects.selected(),
    startup: app.getLoginItemSettings(loginItemOptions()).openAtLogin,
    displays: screen.getAllDisplays().map(d => ({ id: d.id, width: d.size.width, height: d.size.height })) };
}

function rebuildTray() {
  tray?.setToolTip(config.load().gamingMode ? 'Capri — paused · right-click to resume' : 'Capri — control room');
  settingsRoom?.update();
}

function openSettings() { settingsRoom?.open(); }

async function projectCommand(text) {
  if (projectRouting || brain.busy || actions.busy || chats.size)
    return { handled: true, text: 'Finish or stop the current request before changing project context.' };
  projectRouting = true;
  try {
    autonomy.touch();
    const previousScope = goals().projects.scope();
    const result = await goals().projects.route(text);
    groundedCuriosity.sync();
    if (goals().projects.scope() !== previousScope) actions.context?.clear();
    brain.reset(); settingsRoom?.update();
    return result;
  } finally { projectRouting = false; }
}

async function settingsAction(name, value) {
  switch (name) {
    case 'gaming': await setGamingMode(value); break;
    case 'visibility': toggleVisible(value); break;
    case 'startup': app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: value }); break;
    case 'voice-preview': {
      if (!config.load().ttsEnabled || config.load().muted) return 'Enable spoken replies and unmute Capri to preview her voice.';
      if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return 'Bring Capri back to preview her voice.';
      overlay.webContents.send('tts:state', { type: 'preview', text: "There you are, sweetheart. We can take this one step at a time. And yes, I noticed that little smile." });
      return 'Preparing her voice. The first preview needs a little time to warm up.';
    }
    case 'sounds-folder': fs.mkdirSync(userSoundsDir(), { recursive: true }); {
      const error = await shell.openPath(userSoundsDir()); if (error) throw Error(error); break;
    }
    case 'memory-export': return (await personal.route('/memory export')).text;
    case 'memory-delete': { autonomy.touch(); const result = await personal.route('/memory delete-all'); brain.reset(); return result.text; }
    case 'memory-open': if (config.load().gamingMode) throw Error('Resume Capri before reviewing memory.'); sendCommand('memory'); break;
    case 'interests-open': if (config.load().gamingMode) throw Error('Resume Capri before reviewing interests.'); sendCommand('interests'); break;
    case 'reviews-open': if (config.load().gamingMode) throw Error('Resume Capri before reviewing your day.'); sendCommand('reviews'); break;
    case 'curiosity-open': if (config.load().gamingMode) throw Error('Resume Capri before reviewing questions.'); sendCommand('curiosity'); break;
    case 'routines-open': if (config.load().gamingMode) throw Error('Resume Capri before reviewing routines.'); sendCommand('routines'); break;
    case 'project-choose': return (await foreground.run(() => projectCommand('/project choose'))).text;
    case 'project-off': return (await foreground.run(() => projectCommand('/project off'))).text;
    case 'refresh': return runtime().currentSource ? 'Current local source is loaded.' : 'Local changes found. Restart Capri to load them.';
    case 'restart': app.relaunch(); app.quit(); break;
    case 'quit': app.quit(); break;
  }
}

// Run from a clone (`npm start`), electron.exe alone would open the default Electron app at login:
// it needs the project folder as argument.
function loginItemOptions() {
  return app.isPackaged ? {} : { path: process.execPath, args: [ROOT] };
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('CapriGPT — local only');
  tray.on('click', openSettings);
  tray.on('right-click', openSettings);
  rebuildTray();
}

function registerIpc() {
  const speechCaller = event => event.sender === overlay?.webContents;
  ipcMain.on('companion:state', (event, state) => { if (speechCaller(event)) {
      if (state?.chatOpen !== undefined && state.chatOpen !== presentation.chatOpen) {
        autonomy.touch(); if (state.voiceActive === true) tts.warm();
      }
      presentation = personalityContext(state);
    } });
  ipcMain.on('companion:event', (event, reason) => { if (speechCaller(event) && reason === 'chat-open') autonomy.touch(); });
  ipcMain.on('companion:body-result', (event, result) => {
    if (speechCaller(event) && typeof result?.id === 'string') bodyJobs.get(result.id)?.({ result: String(result.result || '').slice(0, 600) });
  });
  ipcMain.handle('tts:speak', (event, request) => speechCaller(event) ? tts.speak(request) : {ok:false,error:'Voice unavailable.'});
  ipcMain.on('tts:cancel', event => { if (speechCaller(event)) tts.cancel(false); });
  ipcMain.handle('speech:start', (event, request) => {
    if (!speechCaller(event)) return { ok: false, error: 'speech-unavailable' };
    autonomy.touch(); tts.cancel();
    return speech.start(request);
  });
  ipcMain.handle('wake:enabled', (event, enabled) => {
    if (!speechCaller(event) || typeof enabled !== 'boolean') throw Error('Invalid wake-word preference.');
    return updateConfig({ wakeWordEnabled: enabled });
  });
  ipcMain.on('wake:end-session', event => { if (speechCaller(event)) endVoiceSession(); });
  ipcMain.handle('speech:stop', (event, request) => {
    if (!speechCaller(event)) return { ok: false, error: 'speech-unavailable' };
    return speech.stop(request?.id);
  });
  ipcMain.on('speech:audio', (event, request) => { if(speechCaller(event))speech.audio(request); });
  ipcMain.handle('speech:conversation', (event, request) => speechCaller(event) ? speech.conversation(request?.id) : {ok:false,error:'speech-unavailable'});
  ipcMain.on('speech:reset', (event, request) => { if(speechCaller(event))speech.resetUtterance(request?.id); });
  ipcMain.on('speech:cancel', (event, request) => {
    if (speechCaller(event) && request?.id === speech.current?.id) speech.cancel();
  });
  ipcMain.handle('fullscreen:state', event => {
    if (event.sender !== overlay?.webContents) throw Error('Overlay required.');
    return fullscreenState;
  });
  ipcMain.on('fullscreen:rendered', (event, state) => {
    if (event.sender !== overlay?.webContents || state?.revision !== fullscreenState.revision
        || state.hidden !== fullscreenState.active) return;
    clearTimeout(fullscreenHideTimer);
    if (state.hidden && !voiceSession) overlay.hide();
    overlay.webContents.setBackgroundThrottling(!config.load().wakeWordEnabled && !voiceSession);
  });
  ipcMain.handle('runtime:info', () => runtime());
  ipcMain.handle('personal:route', async (event, text, id, conversation, commandsOnly = false) => foreground.run(async () => {
    try {
      if (event.sender !== overlay?.webContents) throw Error('Overlay required.');
      if (typeof text !== 'string' || text.length > 12000) throw Error('Invalid message.');
      const inquiryAnchor = autonomy.state.lastInquiry;
      const interestReply = autonomy.respond(text);
      autonomy.touch();
      if (projectRouting) return { handled: true, text: 'Finish choosing your project before sending a request.' };
      const routineCommand = await goals().routines.route(text, updateConfig);
      if (routineCommand) { brain.reset(); return routineCommand; }
      if (goals().routines.invocation(text)) return { handled: false };
      const feedbackCommand = groundedCuriosity.route(text);
      if (feedbackCommand) { if (groundedCuriosity.quietFeedback()) autonomy.defer(60); brain.reset(); return feedbackCommand; }
      const anchored = Boolean(projectFeedbackAnchor && projectFeedbackAnchor.scope === goals().projects.scope()
        && Date.now() - projectFeedbackAnchor.at >= 0 && Date.now() - projectFeedbackAnchor.at < 10 * 60000)
        || Boolean(inquiryAnchor && Date.now() - inquiryAnchor.at >= 0 && Date.now() - inquiryAnchor.at < 10 * 60000
          && curiosity.list(100).some(row => row.id === inquiryAnchor.id && row.subject === inquiryAnchor.subject
            && row.evidence_revision === inquiryAnchor.revision && row.scope_id === goals().projects.scope()));
      const feedback = groundedCuriosity.recordFeedback(text, { anchored });
      if (['unhelpful', 'repetitive'].includes(feedback)) autonomy.defer(60);
      if (interestReply) { brain.reset(); return interestReply; }
      const interestCommand = interests.route(text, updateConfig);
      if (interestCommand) { brain.reset(); return interestCommand; }
      if (/^\/project(?:\s|$)/i.test(text.trim())) {
        return await projectCommand(text);
      }
      const goalCommand = /^\/goals(?:\s|$)/i.test(text.trim()) ? goals().route(text) : null;
      if (goalCommand) { groundedCuriosity.sync(); brain.reset(); return goalCommand; }
      const continuityCommand = goals().continuity.route(text);
      if (continuityCommand) { brain.reset(); return continuityCommand; }
      const dailyReviewCommand = goals().reviews.route(text, updateConfig);
      if (dailyReviewCommand) { brain.reset(); return dailyReviewCommand; }
      const companion = /^\/companion(?:\s+(on|off|status))?$/i.exec(text.trim());
      if (companion) {
        const command = (companion[1] || 'status').toLowerCase();
        if (command !== 'status') updateConfig({ proactiveEnabled: command === 'on' });
        return { handled: true, text: JSON.stringify(autonomy.status(), null, 2) };
      }
      const curiosityCommand = /^\/curiosity(?:\s+(.*))?$/i.exec(text.trim());
      if (curiosityCommand) {
        const arg = (curiosityCommand[1] || 'status').trim().toLowerCase();
        if (arg === 'status') return { handled: true, text: JSON.stringify({ ...curiosity.status(), reflection: reflection.status() }, null, 2) };
        if (arg === 'list') return { handled: true, text: JSON.stringify(curiosity.list(), null, 2) };
        const history = /^history (\d+)$/.exec(arg);
        if (history) return { handled: true, text: JSON.stringify(curiosity.reviewContext(Number(history[1])), null, 2) };
        if (arg === 'on' || arg === 'off') { updateConfig({ cognitiveEnabled: arg === 'on' }); return { handled: true, text: 'Curiosity ' + arg }; }
        if (arg === 'clear') { reflection.cancel(); curiosity.clear(); return { handled: true, text: 'Curiosity journal cleared.' }; }
        const decision = /^(resolve|dismiss)\s+(\d+)$/.exec(arg);
        if (decision) return { handled: true, text: curiosity.update(Number(decision[2]), decision[1] === 'resolve' ? 'resolved' : 'dismissed') ? 'Question updated.' : 'Open question not found.' };
        return { handled: true, text: 'Use /curiosity status, list, history <id>, on|off, resolve <id>, dismiss <id>, or clear.' };
      }
      const preference = await settingsRequests.route(text);
      if (preference) return preference;
      if (/^\/(?:agent cancel|cancel)$/i.test(text.trim())) { brain.cancel(); decisionBrain.cancel(); requests.cancel(); memoryRequests.cancel(); }
      const result = await agent.route(text.trim());
      if (result !== null) return { handled: true, text: result };
      // Explicit slash commands remain available offline; natural language goes
      // straight to the single Codex tool loop.
      const simpleMemory = /^(?:forget\s+#?\d+\s*[.!]?$|edit memory\s+#?\d+\s*:|recall\s+)/i.test(text.trim())
        || (/^(?:remember(?: that)?|recuerda(?: que)?)\s+/i.test(text.trim())
          && !/\b(?:forget|remove|delete|edit|change|instead|olvida|borra|cambia)\b|[?]/i.test(text));
      if (/^\/(?:memory|privacy|context)(?:\s|$)/i.test(text.trim())
          || (simpleMemory && commandsOnly === true)) {
        const local = await personal.route(text);
        if (local.handled) brain.reset();
        return local;
      }
      return { handled: false };
    }
    catch (err) { return { handled: true, text: `Local assistant unavailable: ${err.message}` }; }
  }));
  ipcMain.handle('task:openResult', async (_event, ref) => {
    try { if (typeof ref!=='string'||!/^[a-f0-9]{16}$/.test(ref)) throw Error('Invalid result.'); return {ok:true,...await actions.openResult(ref)}; }
    catch(error) { return {ok:false,error:error.message}; }
  });
  ipcMain.handle('integration:status', () => codexEvents.snapshot());
  ipcMain.on('overlay:interactive', (event, on) => {
    if (!speechCaller(event) || typeof on !== 'boolean' || !overlay || overlay.isDestroyed()) return;
    const ignore = ((fullscreenState.active || config.load().gamingMode) && !voiceSession) || !on;
    if (!ignore && !overlay.isFocusable()) overlay.setFocusable(true);
    overlay.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.handle('overlay:cursor', () => {
    const p = screen.getCursorScreenPoint();
    const b = overlay.getBounds();
    return { x: p.x - b.x, y: p.y - b.y, inside: p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height };
  });
  ipcMain.handle('config:get', () => rendererConfig());
  ipcMain.handle('config:set', (event, patch) => {
    if (event.sender !== overlay?.webContents) throw Error('Overlay required.');
    return updateConfig(DEV || smokeTest ? patch : overlayPatch(patch));
  });
  ipcMain.handle('demo:window', (_e, open) => demoWindow(open));
  // right-clicking her: the same menu as the tray icon (which Windows often hides behind the ^ by the clock)
  ipcMain.on('menu:open', openSettings);
  ipcMain.handle('windows:get', () => lastWindows);
  ipcMain.handle('chat:status', async event => {
    if (event.sender !== overlay?.webContents) throw Error('Overlay required.');
    return { ...await brain.status(), version: VERSION };
  });
  ipcMain.handle('chat:send', async (event, request) => foreground.run(async () => {
    if (event.sender !== overlay?.webContents) return { ok: false, error: 'Overlay required.' };
    autonomy.touch();
    const { id, messages } = request || {};
    const current = messages?.at(-1);
    if (!Number.isSafeInteger(id) || current?.role !== 'user' || typeof current.content !== 'string') return { ok: false, error: 'Invalid chat request.' };
    if (projectRouting) return { ok: false, error: 'Finish choosing your project before sending a request.' };
    if (chats.size || brain.busy || actions.busy) return { ok: false, error: 'One Capri request at a time.' };
    const abort = new AbortController();
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const stop = () => brain.cancel();
    abort.signal.addEventListener('abort', stop, { once: true });
    chats.set(id, { abort, done });
    const feedbackAnchorAtStart = projectFeedbackAnchor;
    try {
      const text = await brain.chat(current.content,
        text => overlay?.webContents.send('chat:delta', { id, text }),
        text => overlay?.webContents.send('task:progress', { id, text }), { voice: request.mode === 'voice' && voiceSession });
      if (projectFeedbackAnchor === feedbackAnchorAtStart) projectFeedbackAnchor = null;
      return { ok: true, text };
    } catch (error) { projectFeedbackAnchor = null; return { ok: false, error: abort.signal.aborted ? 'stopped' : error.message }; }
    finally { abort.signal.removeEventListener('abort', stop); chats.delete(id); finish(); }
  }));
  ipcMain.on('chat:stop', (event, id) => {
    if (event.sender !== overlay?.webContents) return;
    chats.get(id)?.abort.abort(); brain.cancel(); decisionBrain.cancel();
    settingsRequests.cancel(); agent.cancel(); requests.cancel(); memoryRequests.cancel();
  });
  // closing an app you asked her to close, once you've clicked to confirm (apps.js)
  const appInfo = (app) => app && { name: app.process, label: app.label };
  ipcMain.handle('apps:list', async () => config.load().desktopActions && !config.load().gamingMode
    ? (await apps.list().catch(() => [])).map(appInfo) : []);
  ipcMain.handle('apps:find', async (_e, wanted) => config.load().desktopActions && !config.load().gamingMode
    ? appInfo(await apps.find(wanted).catch(() => null)) : null);
  ipcMain.handle('apps:close', closeApp);
  // typing to her: the overlay takes the keyboard while the chat is open, and gives it back after
  ipcMain.on('overlay:focus', (event, on) => {
    if (!speechCaller(event)) return;
    autonomy.touch();
    if (!overlay) return;
    if ((fullscreenState.active || config.load().gamingMode) && !voiceSession) return;
    if (on === true) { overlay.setFocusable(true); overlay.focus(); }
    else if (on === false) overlay.blur();
  });
  // her report card's copy button: a picture of that part of the overlay, on the clipboard
  ipcMain.handle('panel:copy', async (_e, rect) => {
    const image = await overlay.webContents.capturePage(rect);
    if (image.isEmpty()) return false;
    const png = new Blob([image.toPNG()], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  });
  ipcMain.handle('sounds:list', () => {
    try {
      return fs.readdirSync(userSoundsDir())
        .filter((f) => SOUND_EXT.test(f))
        .map((f) => ({ name: f.replace(SOUND_EXT, '').toLowerCase(), url: `capri://usersounds/${encodeURIComponent(f)}` }));
    } catch {
      return [];
    }
  });
}

// Only in --dev: lets scripts drive the overlay and grab frames of it (no desktop content, just our window).
const testWins = new Map(); // name -> test window

async function debugHandler(route, body) {
  if (!DEV) throw new Error('debug routes need --dev');
  if (route === 'command') {
    sendCommand(body.name, body);
    return { ok: true };
  }
  if (route === 'reload') {
    overlay.webContents.reloadIgnoringCache();
    return { ok: true };
  }
  if (route === 'testwin') {
    // plain windows to sit on, opened without stealing focus, by name (`id`, default "main");
    // each one opened goes in front of the others. { open: false } without an id closes them all.
    const id = body.id ?? 'main';
    if (!body.open && body.id === undefined) {
      for (const win of testWins.values()) win.destroy();
      testWins.clear();
      return { ok: true };
    }
    testWins.get(id)?.destroy();
    testWins.delete(id);
    if (body.open) {
      const b = overlay.getBounds();
      const win = new BrowserWindow({
        x: b.x + (body.x ?? 300), y: b.y + (body.y ?? 380), width: body.w ?? 720, height: body.h ?? 380,
        show: false, alwaysOnTop: true, title: `Capri test window ${id}`, backgroundColor: '#1b1726',
      });
      win.loadURL('data:text/html,<body style="background:%231b1726"></body>');
      win.showInactive();
      testWins.set(id, win);
    }
    return { ok: true };
  }
  if (route === 'movewin' && testWins.has(body.id ?? 'main')) {
    const win = testWins.get(body.id ?? 'main');
    const [x, y] = win.getPosition();
    win.setPosition(x + (body.dx || 0), y + (body.dy || 0));
    return { ok: true };
  }
  if (route === 'mouse') {
    // the pointer moving over the overlay (css px), and clicking if asked, without touching the real one
    const at = { x: Math.round(body.x), y: Math.round(body.y) };
    overlay.webContents.sendInputEvent({ type: 'mouseMove', ...at });
    if (body.click) {
      overlay.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at });
      overlay.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at });
    }
    return { ok: true };
  }
  if (route === 'type') {
    // typing into the overlay (her chat), and Enter if asked
    if (body.text) await overlay.webContents.insertText(body.text);
    if (body.enter) {
      overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'char', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    }
    return { ok: true };
  }
  if (route === 'capture') {
    const image = await overlay.webContents.capturePage();
    // installed, the app's own folder is read-only: its data folder instead
    const dir = path.join(app.isPackaged ? app.getPath('userData') : ROOT, 'captures');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${(body.name || 'frame').replace(/[^\w-]/g, '')}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, file };
  }
  throw new Error('unknown debug route');
}

function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    // Clicking the desktop shortcut after an update must not silently keep an
    // idle, stale copy alive. Active replies are left for the explicit tray restart.
    if (!runtime().currentSource && !chats.size) { app.relaunch(); app.quit(); }
    else sendCommand('status');
  });
  if (process.platform === 'win32') app.setAppUserModelId('caprigpt.desktop');

  app.whenReady().then(() => {
    serveProtocol();
    settingsRoom = createSettingsWindow({ state: settingsState, patch: updateConfig, action: settingsAction });
    registerIpc();
    createOverlay();
    createTray();
    if (process.platform === 'win32') fullscreenWatch = startFullscreenWatch({
      read: () => smokeTest && !process.argv.includes('--fullscreen-only') && !process.argv.includes('--speech-only')
        ? null : require('./native-windows').foregroundBounds(),
      display: () => screen.dipToScreenRect(null, targetDisplay().bounds),
      onChange: onFullscreen,
    });
    watchWindows();
    // Existing OS events only; at most one in-memory snapshot with a 60-second TTL.
    for (const [event, reason] of [['resume', 'resume'], ['on-ac', 'power-change'], ['on-battery', 'power-change']]) {
      powerMonitor.on(event, () => { pcContext.onEvent(reason).catch(() => {}); autonomy.touch(); });
    }
    // Apply expiry on startup even if no memory is recalled this run.
    if (fs.existsSync(path.join(app.getPath('userData'), 'personal-memory.sqlite'))) {
      try { memory(); } catch { console.error('[capri] Personal memory unavailable; other features remain available.'); }
    }
    if (fs.existsSync(path.join(app.getPath('userData'), 'companion-goals.sqlite'))) {
      try { goals(); } catch { console.error('[capri] Saved goals unavailable.'); }
    }
    let previousConnection;
    try { previousConnection = JSON.parse(fs.readFileSync(connectionFile(), 'utf8')); } catch {}
    integrationToken = /^[a-f0-9]{64}$/.test(previousConnection?.token || '') ? previousConnection.token : randomBytes(32).toString('hex');
    const bridge = createBridge({
      port: PORT,
      onDebug: DEV ? debugHandler : null,
      integrationToken,
      onIntegrationStatus: async ({ verifyContext } = {}) => {
        const status = { ...codexEvents.snapshot(), runtime: runtime(), gamingMode: config.load().gamingMode,
          visible: Boolean(overlay?.isVisible()), rendererReady: Boolean(overlay && !overlay.webContents.isLoading()),
          companion: autonomy.status(), cognition: { ...curiosity.status(), reflection: reflection.status() } };
        if (verifyContext) {
          // Fixed read-only diagnostic phrase. Never accept commands or prompt text
          // through the HTTP status endpoint, and never return app/window names.
          const previousTopic = personal.lastAppQuestion;
          try {
            const result = await personal.route('whats openned in my pc capri?');
            status.contextCheck = { handledLocally: Boolean(result.handled),
              reportsApps: /^(Open desktop apps|Running app processes|No matching apps)/.test(result.text || '') };
          } finally { personal.lastAppQuestion = previousTopic; }
        }
        return status;
      },
      onCodexEvent: (input) => {
        const first = !codexEvents.lastSeen;
        const event = codexEvents.accept(input);
        if (!event) return false;
        if (!config.load().gamingMode) {
          overlay?.webContents.send('integration:state', codexEvents.snapshot());
          overlay?.webContents.send('integration:event', event);
        }
        if (first && codexEvents.lastSeen) rebuildTray();
        return true;
      },
    });
    bridge.once('listening', () => {
      const target = connectionFile();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Publish only after we own the port. A failed second launch must not replace it.
      fs.writeFileSync(target, JSON.stringify({ port: PORT, token: integrationToken }), { mode: 0o600 });
    });
    globalShortcut.register('Control+Alt+C', () => toggleVisible());
    reflection.schedule();
    const reflectionTimer = setInterval(() => {
      try { groundedCuriosity.sync(); } catch { /* Saved evidence remains optional. */ }
      reflection.schedule();
    }, 60000);
    reflectionTimer.unref(); app.once('before-quit', () => clearInterval(reflectionTimer));
    for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen']) powerMonitor.on(event, () => {
      sessionAvailable = event === 'resume' || event === 'unlock-screen'; autonomy.touch(); reflection.cancel();
    });
    const presenceTimer = setInterval(() => {
      try {
        groundedCuriosity.sync();
        const offered = goals().reviews.tick({
          available: autonomy.enabled() && !autonomy.busy && autonomy.canRun(),
          notify: text => {
            if (!sessionAvailable || !overlay || overlay.isDestroyed() || !autonomy.canRun()) return false;
            brain.history = [...brain.history, { role: 'assistant', content: text }].slice(-24);
            overlay.webContents.send('companion:conversation', text); return true;
          },
        });
        if (offered) autonomy.touch();
        else autonomy.run().catch(() => {});
      } catch { /* Review storage cannot stop ordinary companion conversations. */
        autonomy.run().catch(() => {});
      }
    }, 15000);
    presenceTimer.unref(); app.once('before-quit', () => clearInterval(presenceTimer));
    screen.on('display-metrics-changed', fitOverlay);
    screen.on('display-added', () => { fitOverlay(); rebuildTray(); });
    screen.on('display-removed', () => { fitOverlay(); rebuildTray(); });
  });

  app.on('before-quit', () => { autonomy.close(); reflection.close(); cognitiveBrain.cancel(); brain.cancel(); decisionBrain.cancel(); speech.cancel(true); tts.close(); agent.cancel(); requests.cancel(); memoryRequests.cancel(); for (const { abort } of chats.values()) abort.abort(); });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    windowWatch?.stop();
    fullscreenWatch?.stop();
    clearTimeout(fullscreenHideTimer);
    memoryStore?.close(); goalStore?.close(); curiosity?.close();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}

main();
