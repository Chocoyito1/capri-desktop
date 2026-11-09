import { MicrophoneCapture } from './microphone.js';

// One microphone owner at a time. Detection and dictation share the same stream
// on wake, so words immediately after the address are not lost during a restart.
export class WakeListener {
  constructor({ host, indicator, blocked, onWake, onSessionEnd = () => {}, captureFactory = () => new MicrophoneCapture(), now = Date.now }) {
    Object.assign(this, { host, indicator, blocked, onWake, onSessionEnd, captureFactory, now });
    this.enabled = false; this.retryAt = 0; this.session = false;
    host.onSpeechState(event => this.receive(event));
    indicator.addEventListener('click', () => host.wakeSetEnabled(!this.enabled).catch(() => this.render('Could not change wake listening')));
    window.addEventListener('beforeunload', () => this.pause());
    this.timer = setInterval(() => this.tick(), 500);
  }
  configure(config) { this.enabled = config.wakeWordEnabled === true; if (!this.enabled) { this.pause(); this.endSession(); } this.tick(); }
  render(message) {
    this.indicator.hidden = true; // Background wake listening needs no permanent desktop badge.
    this.indicator.textContent = message || (!this.enabled ? 'Hey Capri: off' : this.id ? 'Hey Capri: listening' : 'Hey Capri: paused');
    this.indicator.setAttribute('aria-pressed', String(this.enabled));
    this.indicator.title = this.enabled ? 'Local wake listener. Click to turn off.' : 'Click to enable local Hey Capri listening.';
    this.indicator.dataset.listening = String(Boolean(this.id));
  }
  tick() {
    if (!this.enabled || this.blocked()) { this.pause(); return; }
    if (!this.id && !this.transferring && this.now() >= this.retryAt) this.start();
  }
  async start() {
    const id = this.id = crypto.randomUUID(); this.capture = this.captureFactory(); this.render('Hey Capri: loading local listener');
    try {
      const result = await this.host.speechStart({ id, mode: 'wake' });
      if (this.id !== id) { this.host.speechCancel({ id }); return; }
      if (!result.ok) throw Error(result.error);
    } catch { if (this.id === id) this.fail('Hey Capri: unavailable — check microphone / speech setup'); }
  }
  pause() {
    if (!this.id) return;
    const id = this.id; this.id = null; this.capture?.cancel(); this.capture = null;
    this.host.speechCancel({ id }); this.render();
  }
  fail(message) { this.pause(); this.retryAt = this.now() + 30000; this.render(message); }
  endSession() { if (!this.session) return; this.session = false; this.host.wakeEndSession?.(); this.onSessionEnd(); }
  async receive(event) {
    if (!this.id || event.id !== this.id) return;
    if (event.type === 'ready') {
      const id = this.id;
      try { await this.capture.start(samples => this.host.speechAudio({ id, samples }), () => { if (this.id === id) this.fail('Hey Capri: microphone disconnected'); }); if (this.id === id) this.render(); }
      catch { if (this.id === id) this.fail('Hey Capri: microphone unavailable'); }
    } else if (event.type === 'setup') {
      this.render(`Hey Capri: setting up local speech ${Math.round(event.percent || 0)}%`);
    } else if (event.type === 'wake') {
      const capture = this.capture; this.id = null; this.capture = null;
      this.transferring = true; this.session = true; this.render('Capri is listening to your request');
      try { await this.onWake({ ...event, capture }); }
      catch { capture?.cancel(); this.host.speechCancel({ id: event.id }); this.endSession(); }
      finally { this.transferring = false; }
    } else if (event.type === 'error') this.fail('Hey Capri: local speech unavailable');
    else if (event.type === 'stopped') { this.pause(); this.retryAt = this.now() + 1500; }
  }
}
