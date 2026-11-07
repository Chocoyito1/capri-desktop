import { reducedMotion } from './util.js';

// One reversible transition. No async vanish/arrive tasks or stale completion callbacks.
export class FullscreenPresence {
  constructor({ capri, host, onChange = () => {}, now = () => performance.now(), schedule = callback => requestAnimationFrame(callback),
    cancel = handle => cancelAnimationFrame(handle) }) {
    Object.assign(this, { capri, host, onChange, now, schedule, cancel });
    this.progress = 0;
    this.target = 0;
    this.revision = -1;
    this.frame = 0;
    this.tick = this.tick.bind(this);
    host.onFullscreenState(state => this.setState(state));
    host.fullscreenState().then(state => this.setState(state)).catch(() => {});
  }

  advance(now) {
    if (!this.duration) return;
    const t = Math.min(1, Math.max(0, (now - this.start) / this.duration));
    const eased = t * t * (3 - 2 * t);
    this.progress = this.from + (this.target - this.from) * eased;
  }

  setState({ active, revision }) {
    if (!Number.isInteger(revision) || revision <= this.revision) return;
    const now = this.now();
    this.advance(now);
    this.revision = revision;
    this.target = active ? 1 : 0;
    this.from = this.progress;
    this.start = now;
    this.duration = (reducedMotion.matches ? 80 : 160) * Math.abs(this.target - this.from);
    if (this.frame) this.cancel(this.frame);
    this.frame = 0;
    this.capri.cancelDrag?.();
    this.capri.fullscreen = Boolean(active) || this.progress > 0;
    this.capri.fullscreenProgress = this.progress;
    document.body.classList.toggle('fullscreen-presence', this.capri.fullscreen);
    if (active) this.capri.endAct(false);
    // Reuse the original red/violet teleport language, without piling up emitters.
    if (Math.abs(this.target - this.from) > 0.00001 && !reducedMotion.matches
        && now - (this.lastEffect ?? -Infinity) > 120 && !this.capri.hidden && !this.capri.gaming) {
      this.lastEffect = now;
      const head = this.capri.head();
      const ground = this.capri.pos.y;
      this.capri.fx.beam(this.capri.pos.x, ground, { down: !active, width: 40 * this.capri.scale + 8, life: 160 });
      this.capri.fx.burst(head.x, head.y, { count: 10, power: 0.5, spread: 75 * this.capri.scale, inward: !active });
      this.capri.voice.play(active ? 'teleport-out' : 'teleport-in', { soft: true });
    }
    this.onChange(Boolean(active));
    this.tick(now);
  }

  tick(now = this.now()) {
    this.frame = 0;
    this.advance(now);
    this.capri.fullscreenProgress = this.progress;
    this.capri.drawFrame(now);
    if (Math.abs(this.progress - this.target) > 0.00001) {
      this.frame = this.schedule(this.tick);
      return;
    }
    this.progress = this.target;
    this.capri.fullscreenProgress = this.target;
    this.capri.fullscreen = Boolean(this.target);
    document.body.classList.toggle('fullscreen-presence', Boolean(this.target));
    this.capri.root.dataset.fullscreen = this.target ? 'away' : 'visible';
    this.onChange(Boolean(this.target));
    this.host.fullscreenRendered({ revision: this.revision, hidden: Boolean(this.target) });
  }
}
