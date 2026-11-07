import { reducedMotion } from './util.js';

const ART = new URL('../../../assets/capri/portrait-blink.png', import.meta.url).href;

// A live portrait instead of a permanently running GIF: hidden panels do no work.
export class Portrait {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frame = document.createElement('canvas');
    this.frame.width = this.frame.height = 128;
    this.frameCtx = this.frame.getContext('2d');
    this.ghost = document.createElement('canvas');
    this.ghost.width = this.ghost.height = 128;
    this.ghostCtx = this.ghost.getContext('2d');
    this.active = false;
    this.raf = 0;
    this.mood = 'calm';
    this.last = 0;
    this.image = new Image();
    this.image.onload = () => { this.ready = true; this.reset(); this.refresh(); };
    this.image.onerror = () => {
      if (this.fallback) return;
      this.fallback = true;
      this.image.src = new URL('../../../assets/capri/capri-face.png', import.meta.url).href;
    };
    this.image.src = ART;
    this.tick = this.tick.bind(this);
    this.onPreference = () => { this.reset(); this.refresh(); };
    reducedMotion.addEventListener('change', this.onPreference);
    document.addEventListener('visibilitychange', this.onPreference);
  }

  reset(now = performance.now()) {
    this.nextBlink = now + 2800 + Math.random() * 2800;
    this.blinkStart = -Infinity;
    this.glitchStart = -Infinity;
    this.nextGlitch = now + 1000 + Math.random() * 1500;
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.active && !reducedMotion.matches) this.glitchStart = performance.now();
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (active) this.reset();
    this.refresh();
  }

  refresh() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.ready) return;
    this.draw(performance.now());
    if (this.active && !document.hidden && !reducedMotion.matches) this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    if (!this.active || document.hidden || reducedMotion.matches) return;
    if (now - this.last >= 1000 / 30) {
      if (now >= this.nextBlink) {
        this.blinkStart = now;
        this.nextBlink = now + 3500 + Math.random() * 3000;
      }
      if (now >= this.nextGlitch) {
        this.glitchStart = now;
        this.nextGlitch = now + 3500 + Math.random() * 3500;
      }
      this.draw(now);
      this.last = now;
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  draw(now) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const size = 64;
    const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
      this.canvas.width = this.canvas.height = pixels;
    }
    ctx.setTransform(pixels / size, 0, 0, pixels / size, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const width = this.image.naturalWidth / (this.fallback ? 1 : 2);
    const height = this.image.naturalHeight;
    const motion = this.active && !document.hidden && !reducedMotion.matches;
    const age = now - this.blinkStart;
    // Short eased close, closed hold, and slower opening. No full-image squash.
    let blink = 0;
    if (motion && age >= 0 && age < 210) {
      if (age < 65) blink = age / 65;
      else if (age < 105) blink = 1;
      else blink = 1 - (age - 105) / 105;
      blink = blink * blink * (3 - 2 * blink);
    }
    // Compose the current blink once so displaced slices never reopen her eyes.
    const frame = this.frameCtx;
    frame.clearRect(0, 0, 128, 128);
    frame.globalAlpha = 1;
    frame.drawImage(this.image, 0, 0, width, height, 0, 0, 128, 128);
    if (blink > 0 && !this.fallback) {
      frame.globalAlpha = blink;
      frame.drawImage(this.image, width, 0, width, height, 0, 0, 128, 128);
      frame.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.frame, 0, 0, size, size);
    // Brief RGB echoes and staggered signal tears; never a full-frame flash.
    const glitchAge = now - this.glitchStart;
    if (motion && glitchAge >= 0 && glitchAge < 280) {
      const phase = Math.floor(glitchAge / 40);
      const strength = Math.sin(Math.PI * glitchAge / 280);
      const offset = (phase % 2 ? -1 : 1) * (2 + strength * 3);
      const ghost = this.ghostCtx;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const [color, shift] of [['#15f5df', offset], ['#ed24a6', -offset]]) {
        ghost.globalCompositeOperation = 'source-over';
        ghost.clearRect(0, 0, 128, 128);
        ghost.drawImage(this.frame, 0, 0);
        ghost.globalCompositeOperation = 'source-in';
        ghost.fillStyle = color; ghost.fillRect(0, 0, 128, 128);
        ctx.globalAlpha = strength * 0.24;
        ctx.drawImage(this.ghost, shift, 0, size, size);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.85;
      for (const [base, h] of [[16, 4], [35, 3], [49, 2]]) {
        const y = base + phase % 3;
        ctx.drawImage(this.frame, 0, y * 2, 128, h * 2, offset, y, size, h);
      }
      ctx.globalAlpha = strength * 0.5;
      ctx.fillStyle = '#43ffd4'; ctx.fillRect(1, 20 + phase, 18, 1);
      ctx.fillStyle = '#ed24a6'; ctx.fillRect(40, 43 - phase, 23, 1);
      ctx.restore();
    }
    if (motion) {
      const scan = (now / 85) % 72 - 8;
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#43ffd4'; ctx.fillRect(0, scan, size, 2);
    }
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#090310';
    for (let y = 1; y < size; y += 3) ctx.fillRect(0, y, size, 0.6);
    ctx.globalAlpha = 1;
  }
}
