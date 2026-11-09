// Audio stays in the overlay; the local worker streams signed 16-bit PCM.
export class SpeechPlayer {
  constructor({ host, voice, onLevel = () => {}, onError = () => {}, onPlayback = () => {} }) {
    Object.assign(this, { host, voice, onLevel, onError, onPlayback });
    this.epoch = 0; this.serial = 0; this.sources = new Set(); this.chunkChain = Promise.resolve();
    host.onTtsState?.(event => {
      if (event.type === 'stopped') this.stop(false);
      else if (event.type === 'preview') this.speak(event.text);
      else if (event.type === 'chunk' && event.id === this.pending?.id) {
        const epoch = this.epoch;
        this.chunkChain = this.chunkChain.then(() => this.pcm(event, epoch)).catch(error => {
          if (epoch === this.epoch) { this.onError(error.message); this.stop(); }
        });
      }
    });
    window.addEventListener('beforeunload', () => this.stop());
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.stop(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  get enabled() { return Boolean(this.config?.ttsEnabled && !this.config.muted); }
  configure(cfg) { this.config = cfg; this.stop(); }
  stop(notify = true) {
    this.epoch++; this.pending = null; this.response = null; this.nextTime = 0; this.responseSuppressed = true;
    cancelAnimationFrame(this.raf);
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear(); this.source = null; this.analyser?.disconnect(); this.analyser = null;
    this.onLevel(0);
    this.playing = false; this.onPlayback(false);
    if (notify) this.host.ttsCancel?.();
  }
  async context(epoch) {
    const ctx = this.voice.ensure(); await ctx.resume();
    return epoch === this.epoch ? ctx : null;
  }
  schedule(ctx, buffer) {
    if (!this.playing) { this.playing = true; this.onPlayback(true); }
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
      this.analyser.connect(this.voice.master);
      const samples = new Float32Array(256);
      const frame = () => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(samples);
        // The analyser precedes master gain; silent output must stay visually silent.
        const gain = this.enabled && !this.voice.muted && ctx.state === 'running'
          ? Math.max(0, this.voice.master.gain.value) : 0;
        this.onLevel(Math.sqrt(samples.reduce((n, x) => n + x*x, 0) / samples.length) * gain);
        this.raf = requestAnimationFrame(frame);
      };
      frame();
    }
    const source = this.source = ctx.createBufferSource();
    source.buffer = buffer; source.connect(this.analyser); this.sources.add(source);
    const at = Math.max(this.nextTime || 0, ctx.currentTime + 0.06);
    this.nextTime = at + buffer.duration;
    source.onended = () => { this.sources.delete(source); source.disconnect(); this.finishIfIdle(); };
    source.start(at);
  }
  async pcm(event, epoch) {
    if (epoch !== this.epoch || event.sampleRate !== 24000) return;
    const bytes = Uint8Array.from(atob(event.audio), char => char.charCodeAt(0));
    if (!bytes.length || bytes.length % 2 || bytes.length > 192000) return;
    const ctx = await this.context(epoch); if (!ctx) return;
    const buffer = ctx.createBuffer(1, bytes.length / 2, event.sampleRate);
    const output = buffer.getChannelData(0), view = new DataView(bytes.buffer);
    for (let i = 0; i < output.length; i++) output[i] = view.getInt16(i*2, true) / 32768;
    this.schedule(ctx, buffer);
  }
  finishIfIdle() {
    if (!this.sources.size && !this.pending && (!this.response || (this.response.done && !this.response.busy && !this.response.queue.length))) this.stop(false);
  }
  async speak(text) { this.stop(); if (this.enabled) await this.play(text); }
  async play(text) {
    const epoch = this.epoch, token = { id: `voice-${++this.serial}-${Date.now()}` };
    this.pending = token;
    try {
      const result = await this.host.ttsSpeak({ text, id: token.id });
      if (this.pending !== token || epoch !== this.epoch) return;
      if (!result.ok) {
        if (result.error !== 'cancelled') this.onError(result.error);
        this.stop(); return;
      }
      if (result.streamed) await this.chunkChain;
      else {
        const ctx = await this.context(epoch); if (!ctx) return;
        const bytes = Uint8Array.from(atob(result.audio), char => char.charCodeAt(0));
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        if (epoch !== this.epoch || this.pending !== token) return;
        this.schedule(ctx, buffer);
      }
      if (this.pending === token) { this.pending = null; this.finishIfIdle(); }
    } catch (error) {
      if (this.pending === token) { this.pending = null; this.onError(error.message); this.finishIfIdle(); }
    }
  }
  beginResponse() {
    this.stop();
    this.responseSuppressed = false;
    if (!this.enabled || this.config.ttsEngine !== 'qwen') return false;
    this.response = { consumed: '', queue: [], done: false, busy: false };
    return true;
  }
  updateResponse(text, done = false) {
    const response = this.response;
    if (!response) { if (done && !this.responseSuppressed) this.speak(text); return; }
    // Hold structured output until complete so code and control tags cannot leak.
    if (!done && /[`\[]/.test(text)) return;
    const plain = speechText(text);
    if (!plain.startsWith(response.consumed)) { this.stop(); return; }
    let remaining = plain.slice(response.consumed.length);
    while (remaining.trim()) {
      const match = /[.!?]["'”’]?(?=\s)/.exec(remaining);
      let end = match ? match.index + match[0].length : done ? remaining.length : 0;
      if (!done && end < 35) {
        const next = /[.!?]["'”’]?(?=\s)/g; next.lastIndex = Math.max(end, 1);
        const later = next.exec(remaining); end = later ? later.index + later[0].length : 0;
      }
      if (!end && remaining.length > 350) end = remaining.lastIndexOf(' ', 300);
      if (!end) break;
      if (end > 350) end = remaining.lastIndexOf(' ', 300) || end;
      const part = remaining.slice(0, end);
      response.consumed += part; response.queue.push(part.trim());
      remaining = remaining.slice(end);
    }
    response.done = done; this.drain(response);
  }
  async drain(response) {
    if (response.busy) return;
    response.busy = true;
    while (this.response === response && response.queue.length) await this.play(response.queue.shift());
    response.busy = false; this.finishIfIdle();
  }
}

export function speechText(text) {
  return String(text || '').replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/\[\[[\s\S]*?(?:\]\]|$)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
}
