'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

// One local worker, one active utterance. Cancellation retains the warmed model.
class QwenVoice {
  constructor({ root, notify, launch = spawn, idleMs = 5 * 60 * 1000 }) {
    Object.assign(this, { root, notify, launch, idleMs });
    this.serial = 0;
  }
  send(message) { this.child?.stdin.write(JSON.stringify(message) + '\n'); }
  cancel() {
    this.serial++;
    const current = this.current;
    this.current = null;
    if (current) { clearTimeout(current.timer); current.resolve({ ok: false, error: 'cancelled' }); }
    if (this.ready) this.send({ type: 'cancel' });
    this.scheduleIdle();
  }
  scheduleIdle() {
    clearTimeout(this.idle);
    if (this.child) this.idle = setTimeout(() => this.close(), this.idleMs).unref();
  }
  close() {
    clearTimeout(this.idle);
    const child = this.child;
    this.child = null; this.ready = null; this.key = null;
    child?.kill();
    const current = this.current; this.current = null;
    if (current) { clearTimeout(current.timer); current.resolve({ ok: false, error: 'cancelled' }); }
  }
  ensure(cfg) {
    const key = JSON.stringify([cfg.ttsPython, cfg.ttsModel, cfg.ttsReference, cfg.ttsReferenceText]);
    if (this.child && key === this.key) return this.ready;
    this.close();
    if (!cfg.ttsPython || !path.isAbsolute(cfg.ttsPython) || !fs.existsSync(cfg.ttsPython)
        || !cfg.ttsModel || !path.isAbsolute(cfg.ttsModel) || !fs.existsSync(path.join(cfg.ttsModel, 'config.json'))
        || !cfg.ttsReference || !path.isAbsolute(cfg.ttsReference) || !fs.existsSync(cfg.ttsReference)
        || !cfg.ttsReferenceText?.trim()) return Promise.reject(Error('Configure the local Qwen runtime, model and voice reference first.'));
    this.key = key;
    const scriptRoot = this.root.endsWith('.asar') ? this.root + '.unpacked' : this.root;
    const child = this.child = this.launch(cfg.ttsPython, ['-u', path.join(scriptRoot, 'scripts/tts-qwen-worker.py')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let readyResolve, readyReject, detail = '';
    this.ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // Retain a handler even when startup is triggered by a later-cancelled request.
    this.ready.catch(() => {});
    const timer = setTimeout(() => { readyReject(Error('Voice warmup timed out.')); if (this.child === child) this.close(); }, 120000).unref();
    const lines = createInterface({ input: child.stdout });
    child.stderr.on('data', data => { detail = (detail + data.toString()).slice(-1500); });
    lines.on('line', line => {
      if (this.child !== child || line.length > 512000) return;
      let event; try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'ready') { clearTimeout(timer); readyResolve(event); this.scheduleIdle(); return; }
      if (event.type === 'error' && !event.id) { readyReject(Error(event.error || 'Voice unavailable.')); this.close(); return; }
      const current = this.current;
      if (!current || event.id !== current.id) return;
      if (event.type === 'chunk') {
        if (event.sampleRate !== 24000 || typeof event.audio !== 'string' || event.audio.length > 256000) return;
        if (!current.allowed()) { this.cancel(); return; }
        this.notify({ type: 'chunk', id: current.clientId, audio: event.audio, sampleRate: event.sampleRate });
      } else if (event.type === 'done' || event.type === 'error') {
        clearTimeout(current.timer); this.current = null; this.scheduleIdle();
        current.resolve(event.type === 'done' && !event.cancelled
          ? { ok: true, streamed: true, firstAudioSeconds: event.firstAudioSeconds }
          : { ok: false, error: event.error || 'cancelled' });
      }
    });
    const ended = error => {
      clearTimeout(timer); lines.close();
      readyReject(Error(error?.message || detail || 'Voice worker stopped.'));
      if (this.child === child) {
        this.child = null; this.ready = null; this.key = null;
        const current = this.current; this.current = null;
        if (current) { clearTimeout(current.timer); current.resolve({ ok: false, error: 'Voice worker stopped.' }); }
      }
    };
    child.once('error', ended); child.once('close', () => ended());
    child.stdin.on('error', ended);
    this.send({ type: 'init', model: cfg.ttsModel, reference: cfg.ttsReference, referenceText: cfg.ttsReferenceText });
    return this.ready;
  }
  async speak(cfg, request, allowed) {
    this.cancel();
    const serial = ++this.serial;
    try {
      await this.ensure(cfg);
      if (serial !== this.serial || !allowed()) return { ok: false, error: 'cancelled' };
      clearTimeout(this.idle);
      return await new Promise(resolve => {
        const id = String(serial);
        const timer = setTimeout(() => { this.cancel(); this.close(); resolve({ ok: false, error: 'Voice generation timed out.' }); }, 90000).unref();
        this.current = { id, clientId: request.id, allowed, resolve, timer };
        this.send({ type: 'speak', id, text: request.text, language: 'Auto' });
      });
    } catch (error) { return { ok: false, error: error.message }; }
  }
}
module.exports = { QwenVoice };
