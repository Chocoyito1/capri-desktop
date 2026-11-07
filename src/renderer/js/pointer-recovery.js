// Recover hit testing when Windows stops forwarding mousemove to a click-through
// window (for example after fullscreen/activation changes). Cursor coordinates
// are transient local UI state, never recorded or supplied as model context.
export class PointerRecovery {
  constructor({ host, eligible, held, revision, update, now = () => performance.now(),
    schedule = fn => setInterval(fn, 150), cancel = clearInterval }) {
    Object.assign(this, { host, eligible, held, revision, update, now, cancel });
    this.lastEvent = -Infinity;
    this.busy = false;
    this.closed = false;
    this.timer = schedule(() => { this.sample().catch(() => {}); });
  }
  observed() { this.lastEvent = this.now(); }
  async sample(force = false) {
    if (this.closed || this.busy || !this.eligible() || this.held() || (!force && this.now() - this.lastEvent < 200)) return;
    this.busy = true;
    const revision = this.revision();
    try {
      const cursor = await this.host.cursor();
      if (this.closed || revision !== this.revision() || !this.eligible() || this.held()) return;
      const point = cursor?.inside && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? { x: cursor.x, y: cursor.y } : null;
      this.update(point);
    } catch { /* Retry at the next local UI opportunity; never queue stale points. */ }
    finally { this.busy = false; }
  }
  close() { this.closed = true; this.cancel(this.timer); }
}
