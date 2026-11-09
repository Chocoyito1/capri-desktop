import { MicrophoneCapture } from './microphone.js';
import { speechDetector } from './speech-detector.js';

const clean = text => String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
  .replace(/\[\[[\s\S]*?(\]\]|$)/g, '').trim();
const goodbye = /^(?:cancel|never ?mind|stop listening|end (?:the )?call|goodbye(?: capri)?|cancelar|cancela|deja de escuchar|termina (?:la )?llamada|adios)[.!?]*$/i;

// Voice turns share Capri's backend/history, but never create a chat surface.
export class VoiceCall {
  constructor({ host, speaker, indicator, history, onStart = async () => {}, onEnd = () => {},
    detectorFactory = speechDetector, captureFactory = () => new MicrophoneCapture(), idleMs = 60000 }) {
    Object.assign(this, { host, speaker, indicator, history, onStart, onEnd, detectorFactory, captureFactory, idleMs });
    this.revision = 0; this.lastTurn = 0;
    host.onSpeechState(event => this.receive(event));
    host.onChatDelta(({ id, text }) => {
      if (id !== this.turn || !this.id) return;
      this.answer += text; this.speaker.updateResponse(clean(this.answer));
    });
    indicator.addEventListener('click', () => this.end());
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.end(); });
    window.addEventListener('beforeunload', () => this.end());
  }
  get active() { return Boolean(this.id); }
  state(value, message = '') {
    this.phase = value; this.indicator.hidden = !this.active;
    this.indicator.dataset.state = value;
    this.indicator.setAttribute('aria-label', message || ({ listening: 'Capri is listening. Click to end voice conversation.',
      thinking: 'Capri is thinking. You can interrupt.', speaking: 'Capri is speaking. You can interrupt.',
      starting: 'Preparing voice conversation.', error: 'Voice conversation unavailable.' }[value]));
    this.indicator.title = this.indicator.getAttribute('aria-label');
  }
  place(head, view) {
    this.indicator.style.left = `${Math.max(22, Math.min(view.w - 22, head.x))}px`;
    this.indicator.style.top = `${Math.max(42, Math.min(view.h - 22, (head.top ?? head.y - 40) - 10))}px`;
  }
  async prepare() {
    this.preparing ||= this.detectorFactory({ stream: () => this.capture?.stream,
      onStart: () => this.speechStart(), onEnd: () => { this.userSpeaking = false; } })
      .then(detector => this.detector = detector).catch(error => { this.preparing = null; throw error; });
    return this.preparing;
  }
  async start(wake = null) {
    this.end(false);
    const revision = this.revision;
    this.id = wake?.id || crypto.randomUUID(); this.capture = wake?.capture || this.captureFactory();
    this.readySignal = wake ? Promise.resolve(true) : new Promise(resolve => { this.readyResolve = resolve; });
    this.fromWake = Boolean(wake); this.text = ''; this.acceptSpeech = true;
    this.initializing = true; this.early = [];
    this.state('starting');
    try {
      if (wake?.text?.length > 500) throw Error('The addressed request was too long; try a shorter request.');
      await this.onStart(); if (revision !== this.revision) return;
      if (wake) {
        const result = await this.host.speechConversation({ id: this.id });
        if (!result.ok) throw Error(result.error);
      } else {
        const result = await this.host.speechStart({ id: this.id, mode: 'conversation' });
        if (!result.ok) throw Error(result.error);
      }
      if (revision !== this.revision) return;
      const detector = await this.prepare(); if (revision !== this.revision) return;
      if (!wake) {
        if (!await this.readySignal || revision !== this.revision) return;
        await (this.openingPromise ||= this.openCapture());
      } else { await this.pausing; if (revision !== this.revision) return; await detector.start(); }
      if (revision !== this.revision) return;
      const id = this.id;
      this.capture.stream?.getAudioTracks?.().forEach(track => track.addEventListener('ended', () => { if (this.id === id) this.end(); }));
      this.initializing = false; this.state('listening'); this.keepAlive();
      if (wake?.text) this.final(wake.text, wake.complete !== false);
      for (const event of this.early) this.final(event.text, event.complete !== false);
      this.early = [];
    } catch (error) {
      if (revision !== this.revision) return;
      this.state('error', error.message); this.end();
    }
  }
  async openCapture() {
    if (!this.id || this.opening || this.capture.stream) return;
    this.opening = true; const id = this.id, capture = this.capture;
    try {
      await capture.start(samples => { if (this.id === id) this.host.speechAudio({ id, samples }); }, () => { if (this.id === id) this.end(); });
      if (this.id !== id) return;
      const detector = await this.prepare(); if (this.id !== id) return;
      await this.pausing; if (this.id !== id) return;
      await detector.start(); if (this.id === id) this.state('listening');
    } catch { if (this.id === id) this.end(); }
    finally { if (this.id === id) this.opening = false; }
  }
  speechStart() {
    if (!this.id) return;
    this.userSpeaking = true; this.keepAlive();
    if (this.turn || this.speaker.pending || this.speaker.source || this.speaker.response) {
      this.interrupt(); this.text = ''; this.host.speechReset({ id: this.id });
    }
    this.acceptSpeech = true; this.state('listening');
  }
  interrupt() {
    this.generation = (this.generation || 0) + 1;
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = null; this.speaker.stop();
  }
  keepAlive() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.turn || this.userSpeaking || this.speaker.pending || this.speaker.source) this.keepAlive();
      else this.end();
    }, this.idleMs);
  }
  receive(event) {
    if (!this.id || event.id !== this.id) return;
    if (event.type === 'ready') {
      this.ready = true; this.readyResolve?.(true); this.readyResolve = null;
      if (this.detector) this.openingPromise ||= this.openCapture();
    }
    else if (event.type === 'final') {
      if (this.initializing) this.early.push(event);
      else this.final(event.text, event.complete !== false);
    }
    else if (event.type === 'error' || event.type === 'stopped') this.end();
  }
  final(text, complete) {
    if (!this.id || !this.acceptSpeech || typeof text !== 'string') return;
    if (this.overlong) { if (complete) this.overlong = false; return; }
    this.text = [this.text, text].filter(Boolean).join(' ');
    if (this.text.length > 1500) { this.text = ''; this.overlong = !complete; this.state('listening'); return; }
    if (!complete) return;
    const message = this.text.trim(); this.text = '';
    if (!message) return;
    if (goodbye.test(message)) { this.end(); return; }
    this.reply(message);
  }
  async reply(text) {
    this.interrupt(); const generation = this.generation, session = this.id;
    this.keepAlive(); this.state('thinking'); this.acceptSpeech = false;
    // Let an interrupted backend finish cancelling before starting the next turn.
    await this.inFlight?.catch(() => {});
    if (this.id !== session || generation !== this.generation) return;
    const id = this.turn = this.lastTurn = Math.max(Date.now(), this.lastTurn + 1);
    this.answer = '';
    const run = async () => {
      const local = await this.host.personalRoute(text, id, this.history?.history || [], false);
      if (this.id !== session || generation !== this.generation) return;
      this.speaker.beginResponse();
      const result = local.handled ? { ok: true, text: local.text } : await this.host.chatSend({
        id, mode: 'voice', messages: [{ role: 'user', content: text }] });
      if (this.id !== session || generation !== this.generation) return;
      if (!result.ok) throw Error(result.error || 'Voice reply unavailable.');
      this.turn = null; this.speaker.updateResponse(clean(result.text), true);
      this.history?.history.push({ role: 'user', content: text }, { role: 'assistant', content: clean(result.text) });
      this.history?.trimHistory(); this.state('speaking');
    };
    this.inFlight = run().catch(async () => {
      if (this.id === session && generation === this.generation) {
        this.turn = null; this.speaker.stop(); this.state('listening'); this.acceptSpeech = true;
        await this.speaker.speak?.(this.history?.brain?.lang === 'es'
          ? 'No pude terminar esa respuesta. ¿Me lo dices otra vez?'
          : "I couldn't finish that reply. Could you try again?");
      }
    });
    await this.inFlight;
  }
  playback(active) {
    if (!this.id) return;
    if (active) { this.acceptSpeech = false; this.state('speaking'); }
    else if (!this.turn) { this.acceptSpeech = true; this.state('listening'); this.keepAlive(); }
  }
  end(notify = true) {
    const id = this.id; this.id = null; this.revision++; this.ready = false; this.opening = false;
    this.readyResolve?.(false); this.readyResolve = null; this.openingPromise = null;
    clearTimeout(this.idle); this.interrupt(); this.capture?.cancel(); this.capture = null;
    this.pausing = this.detector?.pause().catch(() => {}); this.userSpeaking = false; this.text = '';
    this.overlong = false; this.state('idle');
    if (id) { this.host.speechCancel({ id }); if (notify) this.host.wakeEndSession(); this.onEnd(); }
  }
}
