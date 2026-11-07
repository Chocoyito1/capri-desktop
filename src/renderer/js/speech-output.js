// Playback stays in the overlay; generation stays in a cancellable local process.
export class SpeechPlayer {
  constructor({ host, voice, onLevel = () => {}, onError = () => {} }) {
    Object.assign(this, { host, voice, onLevel, onError });
    this.epoch = 0;
    host.onTtsState?.(event => { if (event.type === 'stopped') this.stop(false); });
    window.addEventListener('beforeunload', () => this.stop());
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.stop(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  configure(cfg) { this.config = cfg; this.stop(); }
  stop(notify = true) {
    this.epoch++;
    this.pending = null;
    cancelAnimationFrame(this.raf);
    this.source?.stop(); this.source?.disconnect(); this.analyser?.disconnect();
    this.source = null; this.analyser = null;
    this.onLevel(0);
    if (notify) this.host.ttsCancel?.();
  }
  async speak(text) {
    this.stop();
    if (!this.config?.ttsEnabled || this.config.muted) return;
    // The stop IPC emitted before this invoke may produce a notification; acquire
    // the playback epoch only after main has accepted the job.
    const token = {};
    this.pending = token;
    try {
      const result = await this.host.ttsSpeak({ text });
      if (this.pending !== token) return;
      if (!result.ok) { if (result.error !== 'cancelled') this.onError(result.error); return; }
      const epoch = this.epoch, ctx = this.voice.ensure();
      await ctx.resume();
      const bytes = Uint8Array.from(atob(result.audio), char => char.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      if (epoch !== this.epoch || this.pending !== token) return;
      const source = this.source = ctx.createBufferSource();
      const analyser = this.analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      source.buffer = buffer; source.connect(analyser).connect(this.voice.master);
      const samples = new Float32Array(256);
      const frame = () => {
        if (this.source !== source) return;
        analyser.getFloatTimeDomainData(samples);
        this.onLevel(Math.sqrt(samples.reduce((n, x) => n + x*x, 0) / samples.length));
        this.raf = requestAnimationFrame(frame);
      };
      source.onended = () => { if (this.source === source) this.stop(false); };
      source.start(); frame();
    } catch (error) { if (this.pending === token) this.onError(error.message); }
  }
}
