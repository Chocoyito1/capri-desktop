import { SpeechPlayer } from './speech-output.js';
import { Capri } from './capri.js';
import { Companion } from './companion.js';
import { FxLayer, GRAB_FRAMES } from './fx.js';
import { Chip, Mask } from './chip.js';
import { Panel } from './panel.js';
import { Voice } from './voice.js';
import { Brain } from './brain.js';
import { Mission } from './mission.js';
import { Chat } from './chat.js';
import { TalkMenu } from './talk-menu.js';
import { IntegrationCompanion } from './integration.js';
import { FullscreenPresence } from './fullscreen-presence.js';
import { PointerRecovery } from './pointer-recovery.js';
import { Dictation } from './dictation.js';
import { WakeListener } from './wake-listener.js';
import { VoiceCall } from './voice-call.js';
import { LINES } from './lines.js';
import { pick } from './util.js';

const host = window.host;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// close-ups of her for the cut-ins, frames of the show (tools/build-cutins.py)
const CUTINS = ['grin', 'laugh', 'eyes', 'many', 'look'];

async function boot() {
  const [config, image, intro, ...cutins] = await Promise.all([
    host.getConfig(),
    loadImage('../../assets/capri/capri-full.png'),
    // her intro: her close-up grabbing the screen, and its drawings with her mouth and arm moving
    Promise.all(GRAB_FRAMES.map((name) => loadImage(`../../assets/capri/intro-${name}.webp`).catch(() => null)))
      // decoded now, not the first time each one shows up (a hitch right on "hi", on the wave)
      .then((cels) => Promise.all(cels.map((cel) => cel && createImageBitmap(cel))))
      .then((cels) => (cels[0] ? Object.fromEntries(GRAB_FRAMES.map((name, i) => [name, cels[i]])) : null)),
    ...CUTINS.map((name) => loadImage(`../../assets/capri/cutin-${name}.png`)),
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('400 11px "JetBrains Mono"'),
  ]);
  document.documentElement.lang = config.lang;

  const fx = new FxLayer(document.getElementById('fx'), {
    cutins: Object.fromEntries(CUTINS.map((name, i) => [name, cutins[i]])),
    intro,
  });
  fx.resize(innerWidth, innerHeight);
  const chip = new Chip(document.getElementById('chip'));
  chip.place(innerWidth, innerHeight);
  const mask = new Mask(document.getElementById('mask'));

  const voice = new Voice();
  voice.configure(config);
  host.listSounds().then((list) => list.length && voice.loadCustom(list));

  const panel = new Panel({
    panel: document.getElementById('panel'),
    ticker: document.getElementById('ticker'),
    labels: LINES[config.lang] || LINES.fr,
  });

  const capri = new Capri({
    root: document.getElementById('capri'),
    canvas: document.getElementById('sprite'),
    image,
    fx,
    voice,
  });
  capri.wander = config.wander;
  capri.possessWindows = config.possess;
  capri.gaming = Boolean(config.gamingMode);
  capri.setScale(config.scale);
  let companionStorage;
  try { companionStorage = window.localStorage; } catch {}
  capri.companion = new Companion({ capri, host, storage: companionStorage });
  capri.companion.configure(config);

  const mission = new Mission();
  const brain = new Brain({ capri, panel, voice, host, mission, lang: config.lang, generatedDialogue: config.generatedDialogue !== false });
  new IntegrationCompanion({ capri, panel, voice, host, brain });

  // Click-through everywhere except on her body, the panel and her biochip.
  let talkMenu, wakeListener, voiceCall;
  let interactive = false;
  let mouse = null;
  let pointerRevision = 0;
  const setInteractive = (on, force = false) => {
    if (!force && on === interactive) return;
    interactive = on;
    host.setInteractive(on);
  };
  const onChip = () => Boolean(chip.visible && mouse && chip.contains(mouse.x, mouse.y, 0));
  const refreshHit = (force = false) => {
    if (capri.fullscreen && !wakeListener?.session) return setInteractive(false, force);
    if (capri.pointerHeld || capri.dragging) return setInteractive(true, force);
    if (!mouse) return setInteractive(false, force);
    const r = panel.rect();
    const onPanel = r && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
    const indicator = document.getElementById('voice-indicator');
    const ir = !indicator.hidden && indicator.getBoundingClientRect();
    const onWakeIndicator = ir && mouse.x >= ir.left && mouse.x <= ir.right && mouse.y >= ir.top && mouse.y <= ir.bottom;
    document.body.style.cursor = onChip() ? 'pointer' : '';
    return setInteractive(Boolean(onPanel || onWakeIndicator || talkMenu?.contains(mouse.x, mouse.y) || capri.hit(mouse.x, mouse.y) || onChip()), force);
  };
  // Her biochip: her eyes on it follow the pointer over it, and she comes out when you click it
  // (only then, so the pointer passing through that corner doesn't call her back).
  // Her mask, asleep: the pointer coming over it stirs her, and a moment of that wakes her up.
  let wakeTimer = 0;
  const comeOut = () => {
    if (capri.stowed) host.setConfig({ visible: true }); // the tray and Ctrl+Alt+C follow
    capri.unstow();
  };
  const hoverChip = () => {
    chip.pointer = chip.visible && mouse && chip.contains(mouse.x, mouse.y) ? mouse : null;
    const near = mask.visible && mouse && mask.contains(mouse.x, mouse.y, 30);
    mask.pointer = near ? mouse : null;
    if (!near) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    } else if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        if (capri.dormant) capri.wake();
      }, 400);
    }
  };
  const pointerRecovery = new PointerRecovery({ host,
    eligible: () => !document.hidden && !capri.gaming && (!capri.fullscreen || Boolean(wakeListener?.session)),
    held: () => capri.pointerHeld || capri.dragging, revision: () => pointerRevision,
    update: point => { mouse = point; refreshHit(true); hoverChip(); },
  });
  window.addEventListener('beforeunload', () => pointerRecovery.close());
  window.addEventListener('mousemove', (e) => {
    pointerRecovery.observed();
    pointerRevision++;
    mouse = { x: e.clientX, y: e.clientY };
    refreshHit();
    hoverChip();
  });
  document.addEventListener('mouseleave', () => {
    pointerRevision++;
    mouse = null;
    refreshHit();
    hoverChip();
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) host.openMenu();
  });
  window.addEventListener('click', (e) => {
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) comeOut();
  });

  // wiring
  capri.onPointerHold = () => {
    refreshHit();
    if (!capri.pointerHeld && !capri.dragging && !talkMenu?.visible && !(panel.visible && panel.current?.chat)) host.focusOverlay(false);
  };
  capri.onMove = (head) => {
    // pointing at something: the panel goes on her other side, so it doesn't cover it
    panel.setAnchor({ ...head, lean: capri.pointing ? -capri.pointing.dir : 0 }, capri.view);
    talkMenu?.place(head, capri.view);
    voiceCall?.place(head, capri.view);
    // she may have moved out from under a still pointer: never leave a dead click zone behind
    refreshHit();
  };
  capri.onTeleport = (phase) => { if (wakeListener?.session) return; if (phase === 'start') talkMenu?.hide(); return phase === 'start' ? panel.suspend() : panel.resume(); };
  capri.chipAt = () => chip.center();
  capri.onStow = () => {
    talkMenu?.hide();
    chip.setMode(capri.mode);
    chip.show();
  };
  capri.onUnstow = () => chip.hide();
  capri.onDoze = (phase, face) => {
    if (phase === 'start') {
      mask.place(face.x, face.y, capri.scale * 1.1);
      mask.show();
    } else if (phase === 'waking') {
      mask.wake();
    } else {
      mask.hide();
    }
  };
  capri.onMode = (mode, prev) => chip.setMode(mode, prev);
  // now and then she says something about the satellite: while she looks at it, or once
  // the red light has gone up (never during, nothing should cover that)
  capri.onGaze = () => host.companionEvent?.('idle');
  capri.onClick = () => {
    voiceCall?.end();
    if (panel.visible) panel.hide();
    talkMenu?.show();
  };
  panel.onChar = (kind) => {
    if (panel.current?.chat?.mode === 'text' || !voice.spoken?.config?.ttsEnabled) voice.play('blip', { mood: kind });
  };
  panel.onTalk = (talking) => talking && capri.mode !== 'sleep'
    && !capri.act?.player.name.startsWith('idle') && capri.perform('talk');
  panel.onFocus = () => host.focusOverlay(true); // Restore typing after a fullscreen exit, only on a user click.
  capri.onMenu = () => host.openMenu();

  voice.spoken = new SpeechPlayer({ host, voice,
    onPlayback: active => voiceCall?.playback(active),
    onLevel: level => {
      capri.speechLevel = level;
      if (level > 0.015 && !capri.act && capri.mode !== 'sleep') capri.perform('talk');
    },
    onError: error => {
      if (voiceCall?.active) { voiceCall.end(); return; }
      if (!chat?.open) return;
      const status = panel.el.querySelector('.panel__dictation-status'); status.textContent = `Voice: ${error}`; status.hidden = false;
    },
  });
  voice.spoken.configure(config);
  host.onFullscreenState(state => { if (state.active && !wakeListener?.session) voice.spoken.stop(); });
  const chat = new Chat({ capri, panel, voice, host, brain });
  capri.onIdleWave = () => {}; // A wave is an animation; speech comes from Codex.
  const publishCompanionState = () => {
    if (voiceCall?.active) capri.nextMove = capri.nextGaze = performance.now() + 60000;
    return host.companionState?.({ mood: capri.companion.mood,
    routine: capri.companion.options.dailyRoutine ? (new Date().getHours() < 6 ? 'night' : new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening') : '',
    chatOpen: chat.open || Boolean(voiceCall?.active), voiceActive: Boolean(voiceCall?.active), canSpeak: !wakeListener?.session && !talkMenu?.visible && !capri.busy && capri.mode !== 'alert' && !['alert', 'error', 'report'].includes(panel.current?.kind) });
  };
  setInterval(publishCompanionState, 15000);
  host.onBodyAction?.(async ({ id, action }) => {
    let result;
    try { result = action === 'sit' || action === 'stand' ? await capri.requestPosture(action === 'sit') : await capri.companion.request(action); }
    catch (error) { result = `Action failed: ${error.message}`; }
    host.bodyResult({ id, result }); publishCompanionState();
  });
  const dictation = new Dictation({ panel, host, language: () => brain.lang,
    canListen: () => chat.open && (!capri.gaming && !capri.fullscreen || wakeListener?.session),
    beforeStart: async () => { voiceCall?.end(); voice.spoken.stop(); wakeListener?.pause(); } });
  let restoreStowed = false;
  voiceCall = new VoiceCall({ host, speaker: voice.spoken, history: chat,
    indicator: document.getElementById('voice-indicator'),
    onStart: async () => {
      if (!voice.spoken.enabled) throw Error('Enable spoken replies in Sound settings first.');
      dictation.cancel(); chat.close(); panel.hide(); panel.setTicker(null); talkMenu?.hide();
      wakeListener.session = true; document.body.classList.add('voice-session');
      restoreStowed = capri.stowed; if (capri.stowed) await capri.unstow();
      capri.wake(); capri.nextMove = capri.nextGaze = performance.now() + 60000;
      voiceCall.place(capri.head(), capri.view); publishCompanionState(); refreshHit(true);
    },
    onEnd: () => {
      wakeListener.session = false; document.body.classList.remove('voice-session');
      if (restoreStowed) capri.stowNow(); restoreStowed = false;
      publishCompanionState(); refreshHit(true);
    } });
  chat.onStart = () => voiceCall.end();
  talkMenu = new TalkMenu({ el: document.getElementById('talk-menu'), capri, host,
    language: () => brain.lang, onChange: () => refreshHit(),
    onChoose: async (mode, greeting) => {
      if (mode === 'voice') { wakeListener.pause(); await voiceCall.start(); return; }
      voiceCall.end();
      await chat.start(false, greeting, { mode });
    } });
  brain.onTalk = () => { voiceCall.end(); talkMenu.hide({ keepFocus: true }); return chat.start(); };
  wakeListener = new WakeListener({ host, indicator: document.getElementById('wake-indicator'),
    blocked: () => Boolean(voiceCall.active || dictation.id || voice.spoken.pending || voice.spoken.source),
    onSessionEnd: () => { if (voiceCall.fromWake) voiceCall.end(false); document.body.classList.remove('voice-session'); refreshHit(true); },
    onWake: async event => {
      await voiceCall.start(event);
    } });
  chat.onClose = () => { if (!voiceCall.active && !panel.leaving && !wakeListener.transferring) wakeListener.endSession(); };
  panel.onHidden = () => { if (!voiceCall.active && !chat.open && !wakeListener.transferring) wakeListener.endSession(); };
  wakeListener.configure(config);
  if (config.wakeWordEnabled) voiceCall.prepare().catch(() => {});
  // The demo's second half, after its fake Claude session: everything she does on her own, one
  // after the other, a line before each.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (done, max = 15000) => {
    for (const t0 = Date.now(); !done() && Date.now() - t0 < max;) await wait(100);
  };
  const free = () => !capri.busy && !capri.act && capri.stance !== 'fall';
  brain.onShowcase = async () => {
    const t = brain.t.showcase;
    const caption = (line) => panel.say({ kind: 'info', line, hold: 2200 });
    capri.nextMove = capri.nextGaze = performance.now() + 120000; // nothing of her own in between
    if (capri.stowed) await capri.unstow();
    if (capri.dormant) capri.wake();
    await until(free);
    panel.hide();

    caption(t.minds);
    await wait(1000);
    await capri.perform('split');
    await wait(900);

    caption(t.zap);
    await wait(1000);
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    await wait(1800);

    panel.hide();
    if (capri.gaze({ big: true })) await until(() => !capri.sky);
    await wait(2500);

    // a little terminal opens for her to take over, and closes under her once she's done with it
    if (capri.possessWindows && (await host.demoWindow(true))) {
      const top = () => capri.windows.wins.find((w) => capri.canSit(w)); // it opens on top of everything
      await until(top, 4000);
      const win = top();
      const seat = win && { win, dx: win.w * 0.4 };
      if (seat) {
        panel.hide();
        await capri.sitOn(seat);
        await until(free);
        caption(t.possess);
        await wait(1400);
        panel.hide();
        await capri.possess();
        await wait(1800);
      }
      host.demoWindow(false);
      await wait(400);
      await until(free); // she may have fallen off it
      await wait(900);
    }

    caption(t.sleep);
    await wait(1400);
    panel.hide();
    capri.setMode('sleep');
    await wait(2500); // dozing off
    await capri.doze();
    await wait(4500);
    capri.wake();
    await until(free);
    await wait(1200);

    caption(t.chip);
    await wait(1600);
    panel.hide();
    await capri.stow();
    await wait(3500);
    await capri.unstow();
    await wait(600);
    panel.say({ kind: 'info', line: t.end, hold: 5000 });
  };

  host.onAgentSuggestion(text => {
    if (wakeListener.session) return;
    if (typeof text !== 'string' || capri.gaming || capri.fullscreen || chat.turn || talkMenu.visible) return;
    if (chat.open) panel.stream(text, { done: true });
    else if (panel.visible && ['alert', 'error', 'report'].includes(panel.current?.kind)) return;
    else panel.say({ kind: 'info', face: 'look', line: text, hold: 10000 });
  });
  host.onConversation?.(text => {
    if (wakeListener.session || chat.open || panel.visible || talkMenu.visible || capri.gaming || capri.fullscreen ||
        typeof text !== 'string' || text.length > 320) return;
    const es = brain.lang === 'es';
    panel.say({ kind: 'info', face: 'look', line: text, hold: 20000,
      actions: [{ id: 'reply', label: es ? 'Responder' : 'Reply', primary: true },
        { id: 'quiet', label: es ? 'Silenciar charlas' : 'Pause check-ins' }],
      onAction: async id => {
        voice.spoken?.stop(); panel.hide();
        if (id === 'reply') await chat.start(false, text);
        if (id === 'quiet') await host.personalRoute('/companion off');
      },
    });
  });
  new FullscreenPresence({ capri, host, onChange: () => {
    ++pointerRevision;
    // Main can override click-through during a transition; resend even when
    // the renderer cache thinks nothing changed, including rapid reversals.
    refreshHit(true);
    if (capri.fullscreen) { talkMenu.hide(); if (!dictation.fromWake) dictation.cancel(); }
    else if (!capri.gaming) pointerRecovery.sample(true);
  } });
  host.onWindows((data) => {
    capri.setWindows(data);
    capri.companion.desktop(data);
    brain.onWindows(data);
  });
  // the windows as they are now: the watcher only speaks again when something changes
  host.windowsNow().then((data) => data && capri.setWindows(data));

  host.onResize(({ width, height }) => {
    fx.resize(width, height);
    chip.place(width, height);
    capri.setView(width, height);
  });
  window.addEventListener('resize', () => {
    fx.resize(innerWidth, innerHeight);
    chip.place(innerWidth, innerHeight);
    capri.setView(innerWidth, innerHeight);
  });

  host.onConfig((cfg) => {
    if ((!cfg.wakeWordEnabled && voiceCall.fromWake) || !cfg.ttsEnabled || cfg.muted) voiceCall.end();
    capri.companion.configure(cfg);
    wakeListener.configure(cfg);
    voice.configure(cfg);
    voice.spoken.configure(cfg);
    capri.gaming = Boolean(cfg.gamingMode);
    if (capri.gaming || cfg.visible === false) { talkMenu.hide(); if (!dictation.fromWake) dictation.cancel(); }
    capri.wander = cfg.wander;
    capri.possessWindows = cfg.possess;
    if (cfg.scale !== capri.scale) capri.setScale(cfg.scale);
    if (cfg.lang !== brain.lang) {
      brain.lang = cfg.lang;
      panel.labels = LINES[cfg.lang] || LINES.fr;
      document.documentElement.lang = cfg.lang;
    }
  });

  host.onCommand(async (cmd) => {
    const t = brain.t;
    switch (cmd.name) {
      case 'gamingDeparture':
        voiceCall.end();
        chat.close();
        panel.hide();
        try {
          await capri.gamingDeparture();
        } finally {
          host.gamingAnimationReady();
        }
        break;
      case 'gamingPrepareReturn':
        try { capri.prepareGamingReturn(); }
        finally { host.gamingAnimationReady(); }
        break;
      case 'gamingArrival':
        await capri.gamingArrival();
        break;
      case 'teleport':
        capri.teleport(capri.spot('random'));
        break;
      case 'status':
        brain.status();
        break;
      case 'chat': voiceCall.end(); talkMenu.hide({ keepFocus: true }); // "Talk to her" in her menu
        chat.start();
        break;
      case 'memory':
        chat.start(true);
        break;
      case 'interests':
        talkMenu.hide({ keepFocus: true });
        await chat.start(true);
        await chat.send('/interests list');
        break;
      case 'reviews':
        talkMenu.hide({ keepFocus: true });
        await chat.start(true);
        await chat.send('/review today');
        break;
      case 'curiosity':
        talkMenu.hide({ keepFocus: true });
        await chat.start(true);
        await chat.send('/curiosity list');
        break;
      case 'routines':
        talkMenu.hide({ keepFocus: true });
        await chat.start(false);
        await chat.send('/routines list');
        break;
      case 'report': // "Mission report" in her menu
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (brain.report()) capri.perform('curious', capri.towardCenter());
        break;
      case 'fakeClaude': { // --dev: the topmost window (the test window) is where a prompt was typed, and you're elsewhere
        const win = capri.windows.wins[0];
        if (win) {
          brain.sessions.set('dev', { id: 'dev', project: 'dev', taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, waiting: false, window: win.id, seen: Date.now() });
          capri.windows = { ...capri.windows, fg: -1 };
        }
        break;
      }
      case 'stow': // Ctrl+Alt+C: into her biochip, or back out
        if (cmd.on) voiceCall.end();
        if (cmd.on) dictation.cancel();
        if (cmd.on) capri.stow();
        else capri.unstow();
        break;
      case 'satellite': // the whole sequence, on demand (tray)
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (capri.stance === 'peek') await capri.unpeek();
        if (!capri.gaze({ big: true })) setTimeout(() => capri.gaze({ big: true }), 1500);
        break;
      // --dev helpers
      case 'intro': // her intro again, as when she starts (still: as with Windows' animations off)
        panel.hide();
        await capri.intro(capri.spot('post'), cmd.still ? { still: true } : {});
        break;
      case 'pose':
        capri.debug = cmd.params || null;
        if (cmd.still) capri.nextMove = capri.nextGaze = Infinity; // no wandering off mid-test
        if (cmd.hush) {
          panel.setTicker(null);
          panel.hide();
        }
        if (cmd.scale) capri.setScale(cmd.scale);
        if (cmd.stance) capri.setStance(cmd.stance, cmd);
        if (cmd.at) capri.pos = cmd.at;
        if (cmd.facing) capri.facing = cmd.facing;
        capri.drawFrame();
        break;
      case 'config': // a setting, as if changed from her menu
        host.setConfig(cmd.patch || {});
        break;
      case 'focus': // as if window `fg` had come to the front
        capri.windows = { ...capri.windows, fg: cmd.fg };
        brain.onWindows(capri.windows);
        break;
      case 'freeze':
        capri.hidden = Boolean(cmd.on);
        break;
      case 'act':
        // behaviours by method name (gaze, celebrate, hurt, shed, peek, fall, wanderStep...) or acts by name
        if (cmd.act === 'sit') {
          // pile: n-th window she could sit on from the top of the pile (0: the --dev test window
          // opened last), instead of the usual choice
          const top = cmd.pile !== undefined && capri.windows.wins.filter((w) => capri.canSit(w))[cmd.pile];
          const seat = top ? { win: top, dx: top.w * 0.4 } : capri.pickSeat();
          if (seat) capri.sitOn(seat);
        } else if (typeof capri[cmd.act] === 'function') capri[cmd.act](...(cmd.args || []));
        else capri.perform(cmd.act, cmd.dir || 0);
        break;
      default:
        break;
    }
  });

  // entrance: her face big in the corner says hi, then she dives down to her spot
  // (put away last time: she starts in her biochip)
  if (config.visible === false) capri.stowNow();
  else if (intro) await capri.intro(capri.spot('post'));
  else await capri.materialize(capri.spot('post'));
  if (!config.welcomed) host.setConfig({ welcomed: true });
  publishCompanionState();
  host.companionEvent?.('startup');
  document.documentElement.dataset.caprigptReady = 'true';

  // In the evening, after a real day's work, she brings you her report card once, on her own,
  // at a quiet moment.
  setInterval(() => {
    const day = mission.day;
    const quiet = !brain.busySessions.length && !panel.visible && !capri.busy && !capri.act;
    if (!capri.companion.options.dailyRoutine || capri.gaming || capri.fullscreen) return;
    if (new Date().getHours() < 18 || day.reported || day.missions < 3 || !quiet) return;
    if (capri.stowed || capri.dormant || capri.mode === 'sleep') return;
    if (brain.report()) {
      mission.markReported();
      capri.perform('curious', capri.towardCenter());
    }
  }, 60000);
}

boot().catch((err) => {
  console.error('[capri] boot failed', err);
});
