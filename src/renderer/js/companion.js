// Local decorative state. No desktop capture, background microphone or app actions.
const KEY = 'capri.companion.v1';
const MINUTE = 60000;
const clamp = n => Math.max(0, Math.min(1, n));
export function routineAt(date) {
  const h = date.getHours();
  return h < 6 || h >= 23 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

export class Companion {
  constructor({ capri, host, storage, clock = () => new Date(), random = Math.random, reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches }) {
    Object.assign(this, { capri, host, storage, clock, random, reduced });
    this.configure({});
    const now = clock().getTime();
    let saved;
    try { saved = JSON.parse(storage?.getItem(KEY)); } catch {}
    this.state = { energy: 0.7, warmth: 0.5, updated: now, routine: '', surprise: 0 };
    if (saved && typeof saved === 'object') {
      for (const key of ['energy', 'warmth']) if (Number.isFinite(saved[key])) this.state[key] = clamp(saved[key]);
      for (const key of ['updated', 'surprise']) if (Number.isFinite(saved[key])) this.state[key] = Math.min(now, Math.max(0, saved[key]));
      if (typeof saved.routine === 'string') this.state.routine = saved.routine.slice(0, 40);
    }
    this.nextRoutine = now + MINUTE;
    this.nextSurprise = Math.max(now + 20 * MINUTE, this.state.surprise + 30 * MINUTE);
    this.nextPointer = 0;
    this.nextDesktop = now + MINUTE;
    this.lastIdle = null;
  }

  configure(config) {
    this.options = Object.fromEntries(['idleAnimations', 'cursorInteractions', 'personality', 'dailyRoutine', 'surpriseAnimations'].map(k => [k, config[k] !== false]));
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage may be unavailable */ }
  }

  evolve() {
    const now = this.clock().getTime();
    const elapsed = Math.min(24, Math.max(0, now - this.state.updated) / 3600000);
    if (elapsed < 1 / 60) return;
    const target = routineAt(this.clock()) === 'night' ? 0.25 : 0.75;
    this.state.energy = clamp(this.state.energy + (target - this.state.energy) * Math.min(1, elapsed));
    this.state.warmth = clamp(this.state.warmth + (0.5 - this.state.warmth) * Math.min(1, elapsed / 4));
    this.state.updated = now;
    this.save();
  }

  get mood() {
    if (!this.options.personality) return 'calm';
    if (this.capri.mode === 'work' || this.capri.chatThinking) return 'focused';
    if (this.capri.mode === 'alert') return 'attentive';
    if (this.capri.mode === 'sleep' || this.state.energy < 0.35) return 'sleepy';
    return this.state.warmth > 0.65 ? 'playful' : 'curious';
  }

  interact() {
    if (!this.options.personality) return;
    this.evolve();
    this.state.warmth = clamp(this.state.warmth + 0.08);
    this.state.energy = clamp(this.state.energy + 0.03);
    this.save();
  }

  available() {
    const c = this.capri;
    return !['hidden', 'stowed', 'dormant', 'fullscreen', 'gaming', 'busy', 'dragging', 'chatThinking', 'pointing', 'sky'].some(k => c[k])
      && !c.act && !c.groundRest && c.mode === 'idle' && ['stand', 'sit'].includes(c.stance);
  }

  idle() {
    const extra = this.mood === 'sleepy' ? ['idleYawn', 'idleBreathe']
      : this.mood === 'playful' ? ['idleBounce', 'idleWave', 'idleListen'] : ['idleListen', 'idleBreathe', 'idleYawn'];
    const pool = ['idleSway', 'idlePreen', 'idleStretch', ...extra, 'idleWave'].filter(n => n !== this.lastIdle);
    return this.lastIdle = pool[Math.floor(this.random() * pool.length)];
  }

  tick() {
    this.evolve();
    if (!this.available() || this.reduced()) return false;
    const now = this.clock().getTime(), date = this.clock();
    const stamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${routineAt(date)}`;
    if (this.options.dailyRoutine && now >= this.nextRoutine && this.state.routine !== stamp) {
      this.state.routine = stamp;
      this.nextRoutine = now + MINUTE;
      this.save();
      this.capri.perform({ morning: 'idleStretch', afternoon: 'idleListen', evening: 'idleBreathe', night: 'idleYawn' }[routineAt(date)]);
      return true;
    }
    if (this.options.surpriseAnimations && now >= this.nextSurprise) {
      // Rate limit across restarts as well as in this session. Busy time never queues a burst.
      this.nextSurprise = now + (20 + this.random() * 20) * MINUTE;
      if (this.random() >= 0.25) return false;
      this.state.surprise = now;
      this.nextSurprise = Math.max(this.nextSurprise, now + 30 * MINUTE);
      this.save();
      this.capri.perform(this.capri.stance === 'sit' ? 'split' : this.random() < 0.5 ? 'spin' : 'hop');
      return true;
    }
    return false;
  }

  pointer(x, y) {
    if (!this.options.cursorInteractions || !this.available() || this.reduced()) return false;
    const now = this.clock().getTime(), h = this.capri.head();
    if (Math.hypot(x - h.x, y - h.y) > 180) { this.hoverAt = null; return false; }
    if (this.hoverAt == null) this.hoverAt = now;
    if (now - this.hoverAt < 1200 || now < this.nextPointer) return false;
    this.nextPointer = now + 30000;
    this.interact();
    this.capri.perform(this.mood === 'playful' ? 'idleWave' : 'idleListen', x < h.x ? -1 : 1);
    return true;
  }

  desktop(data) {
    const previous = this.foreground;
    this.foreground = data.fg;
    const now = this.clock().getTime();
    if (!this.options.cursorInteractions || !this.available() || this.reduced() || !previous || previous === data.fg || now < this.nextDesktop) return;
    this.nextDesktop = now + MINUTE;
    this.capri.perform('idleListen', this.capri.towardCenter());
  }

  context() {
    this.evolve();
    return `Decorative companion mood: ${this.mood}. Personality: gently curious, playful when engaged, quiet during work. These are fictional animation states, not real emotions. Local routine: ${this.options.dailyRoutine ? routineAt(this.clock()) : 'disabled'}.`;
  }

  async request(action) {
    const c = this.capri;
    if (action === 'help') return 'Try wave, dance, stretch, take a nap, wake up, come here, sit down, stand up, or how are you feeling. You can type or dictate, review, and Send.';
    if (action === 'mood') { this.evolve(); return `Feeling ${this.mood}. ${this.options.personality ? 'A little desktop ghost keeping you company.' : 'Personality changes are turned off.'}`; }
    if (['hidden', 'stowed', 'fullscreen', 'gaming', 'busy', 'dragging', 'chatThinking', 'pointing', 'sky'].some(k => c[k])
        || c.stance === 'fall' || c.mode === 'work' || c.mode === 'alert' || (c.act && c.act.player.priority > 0) || (c.dormant && action !== 'wake')) return 'Let me finish what I’m doing first, then ask again.';
    c.endAct?.(false); // Direct requests can replace a decorative idle or talking gesture.
    if (action === 'wake') { c.wake(); this.interact(); return 'I’m here!'; }
    if (action === 'nap') { c.setMode('sleep'); return 'Taking a quiet little nap.'; }
    if (c.dormant || c.groundRest) return 'Ask me to wake up or stand up first.';
    if (action === 'come') {
      const cursor = await this.host.cursor().catch(() => null);
      if (!cursor?.inside) return 'Move your pointer onto my display and ask again.';
      // The cursor request may complete after game mode or a foreground task starts.
      if (!this.available()) return 'Let me finish what I’m doing first, then ask again.';
      if (this.reduced()) return 'Come here is paused while reduced motion is enabled.';
      this.interact();
      await c.summon(cursor);
      return 'Here I am.';
    }
    c.wake();
    this.interact();
    if (this.reduced()) return 'I’m keeping still while reduced motion is enabled.';
    c.perform({ wave: 'idleWave', dance: 'idleBounce', stretch: 'idleStretch' }[action], c.towardCenter());
    return { wave: 'Hi! A little wave for you.', dance: 'A little ghost dance!', stretch: 'Stretching out.' }[action];
  }
}
