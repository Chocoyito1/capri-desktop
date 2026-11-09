// The voice analyser is the only input: thinking, text and microphone activity
// cannot illuminate her. A short attack/release bridges syllables without flicker.
export class SpeechAura {
  constructor(canvas) {
    this.canvas = canvas;
    this.amount = 0;
    this.lastTime = null;
  }

  update(level, now, { visible = true, reducedMotion = false } = {}) {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(64, now - this.lastTime));
    this.lastTime = now;
    const audible = Number.isFinite(level) && level > 0.002;
    const target = visible && audible ? Math.min(1, 0.4 + Math.sqrt(level) * 2.2) : 0;
    const duration = target > this.amount ? 65 : 125;
    this.amount += (target - this.amount) * (1 - Math.exp(-dt / duration));
    if (!visible || (target === 0 && this.amount < 0.005)) this.amount = 0;
    const active = this.amount > 0;
    this.canvas.classList.toggle('has-speech-aura', active);
    if (active) {
      const pulse = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(now / 145);
      this.canvas.style.setProperty('--speech-aura', (this.amount * pulse).toFixed(4));
    } else {
      this.canvas.style.removeProperty('--speech-aura');
    }
  }
}
