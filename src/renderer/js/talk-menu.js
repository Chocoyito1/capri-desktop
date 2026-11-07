import { welcomePicker } from './welcome.js';

export class TalkMenu {
  constructor({ el, capri, host, language, onChoose, onChange = () => {} }) {
    Object.assign(this, { el, capri, host, language, onChoose, onChange });
    this.greeting = el.querySelector('.talk-menu__hello');
    this.pick = welcomePicker();
    el.addEventListener('click', event => {
      event.stopPropagation();
      const button = event.target.closest('[data-talk]');
      if (!button) return;
      const greeting = this.greeting.textContent;
      this.hide({ keepFocus: true }); this.onChoose(button.dataset.talk, greeting);
    });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && this.visible) { event.preventDefault(); this.hide(); } });
    window.addEventListener('blur', () => this.hide());
    window.addEventListener('pointerdown', event => { if (this.visible && !el.contains(event.target) && !capri.hit(event.clientX, event.clientY)) this.hide(); });
  }
  get visible() { return !this.el.hidden; }
  toggle() {
    if (this.visible) return this.hide();
    if (this.capri.gaming || this.capri.fullscreen || this.capri.stowed || this.capri.dragging) return;
    this.capri.wake();
    this.greeting.textContent = this.pick(this.language());
    const es = this.language() === 'es';
    for (const button of this.el.querySelectorAll('[data-talk]')) {
      const label = button.dataset.talk === 'voice' ? (es ? 'Hablar por voz' : 'Talk by voice') : (es ? 'Escribir' : 'Text chat');
      button.title = label; button.setAttribute('aria-label', label);
    }
    this.el.hidden = false;
    this.capri.nextMove = this.capri.nextGaze = performance.now() + 60000;
    this.place(); this.host.focusOverlay(true);
    this.el.tabIndex = -1;
    this.el.focus({ preventScroll: true }); this.onChange();
  }
  hide({ keepFocus = false } = {}) {
    if (!this.visible) return;
    this.el.hidden = true;
    // Hiding the launcher as a drag starts must not blur the window: blur
    // releases pointer capture and used to cancel the pickup immediately.
    if (!keepFocus && !this.capri.pointerHeld && !this.capri.dragging) this.host.focusOverlay(false);
    this.onChange();
  }
  place(head = this.capri.head(), view = this.capri.view) {
    if (!this.visible) return;
    if (this.capri.gaming || this.capri.fullscreen || this.capri.stowed || this.capri.dragging) return this.hide();
    const width = this.el.offsetWidth, height = this.el.offsetHeight;
    this.el.style.left = `${Math.max(10, Math.min(view.w - width - 10, head.x - width / 2))}px`;
    this.el.style.top = `${Math.max(10, Math.min(view.h - height - 10, (head.top ?? head.y - 80) - height - 12))}px`;
  }
  contains(x, y) {
    if (!this.visible) return false;
    return [...this.el.querySelectorAll('button')].some(button => {
      const r = button.getBoundingClientRect();
      return ((x - (r.left + r.width / 2)) / (r.width / 2)) ** 2 + ((y - (r.top + r.height / 2)) / (r.height / 2)) ** 2 <= 1;
    });
  }
}
