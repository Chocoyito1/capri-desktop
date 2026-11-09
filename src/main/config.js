'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { migratePcSettings, migrateControlRoom } = require('./settings-migration');
const { voiceSetup } = require('./voice-setup');

const DEFAULTS = {
  gamingMode: false,
  systemAccess: true,
  screenAwareness: true,
  autonomyEnabled: true,
  cognitiveEnabled: true,
  projectCuriosityEnabled: true,
  routinesEnabled: true,
  interestsEnabled: true,
  proactiveEnabled: true,
  dailyReviewEnabled: true,
  dailyReviewNotify: false,
  autonomyScreen: true,
  autonomyIntervalSeconds: 90,
  generatedDialogue: true,
  idleAnimations: true,
  cursorInteractions: true,
  personality: true,
  dailyRoutine: true,
  surpriseAnimations: true,
  desktopActions: true,
  windowTracking: true, // decorative geometry only; restore Capri's window sitting
  agentEnabled: true,
  privacy: {}, // normalized by pc-context; PC awareness defaults on
  scale: 0.6,        // sprite scale, 0.6 ≈ 250px tall
  muted: false,
  volume: 0.7,
  wakeWordEnabled: true,
  ttsEnabled: false,
  ttsEngine: 'windows',
  ttsPython: '',
  ttsReference: '',
  ttsReferenceText: '',
  ttsDevice: 'cpu',
  ttsModel: '',
  lang: 'auto',      // 'auto' follows the system language, or 'fr' / 'en'
  displayId: null,   // null = primary display
  wander: true,      // random teleports when idle
  possess: true,     // now and then she dives into the window she sits on and takes it over
  visible: true,
  welcomed: false,   // she has introduced herself (her welcome panel)
  linked: false,     // a Claude Code event has reached her at least once
  codexExecutable: '',
  codexModel: '',
  codexEffort: 'medium',
  chatModel: 'qwen3.5:9b', // retained only for rollback; runtime uses Codex
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  if (cache) return cache;
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const migrated = voiceSetup(path.resolve(__dirname, '../..'), migrateControlRoom(migratePcSettings(saved)));
    // Keep pause changes in this process, but always begin a fresh run active.
    cache = { ...DEFAULTS, ...migrated, gamingMode: false };
    if (migrated !== saved || saved.gamingMode === true) {
      try { fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); }
      catch { console.error('[capri] Could not persist updated PC defaults.'); }
    }
  } catch {
    cache = { ...DEFAULTS, ...voiceSetup(path.resolve(__dirname, '../..'), migrateControlRoom(migratePcSettings())) };
    if (cache.ttsSetupId) {
      try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); }
      catch { console.error('[capri] Could not persist prepared voice settings.'); }
    }
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[capri] could not save config:', err.message);
  }
  return cache;
}

module.exports = { load, save, DEFAULTS };
