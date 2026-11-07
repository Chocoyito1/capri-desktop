// The transmission panel next to Capri, and the one-line ticker she wears while Claude works.

import { clamp, ease, reducedMotion } from './util.js';
import { Portrait } from './portrait.js';

const NOISE = '▚▞▙▟░▒#%&/\\<>01XZ';

// Existing mood names now share one consistent animated portrait.
export const FACES = Object.fromEntries(['calm', 'aside', 'smug', 'wide', 'look', 'laugh', 'many', 'grin']
  .map(name => [name, 'portrait-blink.png']));
const KIND_FACE = { alert: 'many', done: 'look', error: 'laugh', work: 'calm', idle: 'calm', report: 'smug', chat: 'look' };
const PRIORITY = { info: 1, idle: 1, work: 2, done: 3, error: 3, report: 3, chat: 3, alert: 4 };
const DECODE_STEP_MS = 28;
const COUNT_MS = 700; // her report's numbers counting up

export class Panel {
  constructor({ panel, ticker, labels }) {
    this.el = panel;
    this.tickerEl = ticker;
    this.labels = labels;
    this.line = panel.querySelector('.panel__line');
    this.portrait = panel.querySelector('.panel__face canvas');
    this.animatedPortrait = new Portrait(this.portrait);
    this.quote = panel.querySelector('.panel__quote');
    this.reply = panel.querySelector('.panel__reply');
    this.report = panel.querySelector('.panel__report');
    this.actions = panel.querySelector('.panel__actions');
    this.onAction = null; // (id) => void, a button of the message was clicked
    this.onDismiss = null; // (message) => void, a message left: closed, timed out or replaced
    this.summary = panel.querySelector('.panel__summary');
    this.log = panel.querySelector('.panel__log');
    this.tag = panel.querySelector('.panel__tag');
    this.state = panel.querySelector('.panel__state');
    this.activity = panel.querySelector('.panel__activity');
    this.tickerVerb = ticker.querySelector('.ticker__verb');
    this.tickerTarget = ticker.querySelector('.ticker__target');
    this.current = null;
    this.hideTimer = null;
    this.decodeTimer = null;
    this.anchor = { x: 0, y: 0, side: 1 };
    this.view = { w: innerWidth, h: innerHeight };
    this.onChar = null;    // (mood) => void, for the voice blips
    this.onTalk = null;    // (talking: boolean) => void
    this.suspended = false;
    this.tickerAction = null;
    this.tickerShownAt = 0;
    this.tickerTimer = null;
    this.missed = null; // a Claude message that came while you were chatting with her, shown after

    // talking to her (chat.js): a line to type in, under her answer
    this.chatForm = panel.querySelector('.panel__chat');
    this.chatInput = panel.querySelector('.panel__input');
    this.chatSend = panel.querySelector('.panel__send');
    this.chatClose = panel.querySelector('.panel__close');
    this.chatTyping = panel.querySelector('.panel__typing');
    this.chatTyping?.addEventListener('click', event => { event.stopPropagation(); this.onTyping?.(); this.setConversationMode('text'); this.onFocus?.(); this.chatInput.focus(); });
    this.note = panel.querySelector('.panel__note');
    this.chatForm.addEventListener('click', (e) => { this.onFocus?.(); e.stopPropagation(); });
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (!text || this.chatInput.disabled || this.chatInput.readOnly) return;
      this.chatInput.value = '';
      this.chatInput.scrollTop = 0;
      this.resizeChatInput();
      this.current?.onSend?.(text);
    });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (!this.chatInput.disabled && !this.chatInput.readOnly) this.chatForm.requestSubmit();
      }
    });
    this.chatInput.addEventListener('input', () => { this.resizeChatInput(); this.place(); });
    this.chatClose.addEventListener('click', event => { event.stopPropagation(); this.hide(); });

    this.el.addEventListener('click', () => {
      if (this.current?.chat) { this.onFocus?.(); this.chatInput.focus(); } // a chat stays until you close it
      else this.hide();
    });
  }

  get visible() {
    return !this.el.hidden && !this.suspended && !this.leaving;
  }

  resizeChatInput() {
    const input = this.chatInput;
    if (this.chatForm?.dataset && input) this.chatForm.dataset.hasDraft = String(Boolean(input.value.trim()));
    if (!input || this.chatForm.hidden || !input.clientWidth) return;
    const width = input.getBoundingClientRect().width;
    if (this.chatInputSize?.width === width && this.chatInputSize?.text === input.value) return;
    this.chatInputSize = { width, text: input.value };
    const { scrollTop } = input;
    // Measure at one row so deleting or replacing text can shrink the composer.
    input.style.height = '32px';
    input.style.overflowY = 'hidden';
    const height = Math.min(68, Math.max(32, input.scrollHeight + 2));
    input.style.height = `${height}px`;
    input.style.overflowY = height === 68 && input.scrollHeight > input.clientHeight ? 'auto' : 'hidden';
    input.scrollTop = scrollTop;
  }

  // Message: { kind, line, tag, quote, reply, summary, log: [{verb, target, error}], actions, guide,
  //            hold (ms | null for sticky) }
  // reply: Claude's whole answer, in a block that scrolls
  // actions: buttons, [{ id, label, primary }]; clicking one calls the message's onAction(id),
  //          or the panel's
  // guide: the quote is an explanation, shown whole
  // badge: the word in the corner, instead of the one for its kind
  // face: her expression (a key of FACES), instead of the one for its kind
  // report: her report card, { date, hero: { value, label }, stats: [{ value, label, hot }],
  //         longest: { label, project, time }, foot }
  // chat: a line to type to her, { placeholder, send, close, noteTag, note }; onSend(text) gets
  //       what you typed
  // onLeave: () => void, when this message goes (closed, timed out or replaced)
  setActivity(text) {
    this.activity.textContent = text || '';
    this.activity.hidden = !text;
  }

  say(msg) {
    const cur = this.current;
    if (cur && this.visible && cur.kind !== msg.kind && PRIORITY[cur.kind] > PRIORITY[msg.kind] && performance.now() - cur.at < 2600) {
      return false; // don't step on something more important that just appeared
    }
    // nor on something you may be reading: an answer, her report (progress lines don't knock it off)
    if (cur?.reply && this.visible && PRIORITY[msg.kind] < 2) return false;
    if (cur?.report && this.visible && PRIORITY[msg.kind] < 3) return false;
    // nor on a chat with her: only a permission prompt breaks in; Claude finishing waits until after
    // (even while she teleports and the panel is put aside for a moment)
    if (cur?.chat && !this.el.hidden && !this.leaving && PRIORITY[msg.kind] < 4) {
      if (PRIORITY[msg.kind] >= 3) this.missed = { ...msg, missedAt: performance.now() };
      return false;
    }
    clearTimeout(this.leaveTimer);
    if (cur && this.visible) this.onDismiss?.(cur);
    cur?.onLeave?.();
    this.current = { ...msg, at: performance.now() };
    clearTimeout(this.hideTimer);

    this.el.dataset.kind = msg.kind;
    this.setFace(msg.face || KIND_FACE[msg.kind] || 'grin');
    this.tag.textContent = msg.tag || '';
    this.state.textContent = msg.badge || this.labels.state[msg.kind] || '';
    this.setActivity(msg.activity);
    this.quote.textContent = msg.quote || '';
    this.quote.hidden = !msg.quote;
    this.reply.textContent = msg.reply || '';
    this.reply.hidden = !msg.reply;
    this.reply.scrollTop = 0;
    this.el.classList.toggle('has-reply', Boolean(msg.reply));
    this.el.classList.toggle('has-report', Boolean(msg.report));
    this.el.classList.toggle('is-guide', Boolean(msg.guide));
    this.renderReport(msg.report);
    this.renderActions(msg.actions, msg.onAction);
    this.renderChat(msg.chat);
    this.summary.textContent = msg.summary || '';
    this.summary.hidden = !msg.summary;
    this.renderLog(msg.log || []);

    clearTimeout(this.tickerTimer);
    this.tickerEl.hidden = true;
    this.leaving = false;
    this.el.hidden = false;
    this.animatedPortrait.setActive(!this.suspended);
    this.el.classList.remove('is-leaving');
    this.replayEnter();
    this.place();
    this.decode(msg.line || '', msg.kind);

    if (msg.hold) this.hideTimer = setTimeout(() => this.hide(), msg.hold);
    return true;
  }

  // Retain semantic moods without swapping between mismatched static crops.
  setFace(name) {
    this.animatedPortrait.setMood(FACES[name] ? name : 'grin');
  }

  // Her report card: today's big number, three smaller ones, the longest mission, a footer.
  // The numbers count up on twos, like her animation.
  renderReport(report) {
    clearInterval(this.countTimer);
    this.report.hidden = !report;
    if (!report) {
      this.report.replaceChildren();
      return;
    }
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const number = (className, value) => {
      const node = el('b', className, '0');
      node.dataset.value = value;
      return node;
    };
    const head = el('header', 'report__head');
    head.append(el('span', 'report__title', this.labels.report.title), el('span', 'report__date', report.date));
    const hero = el('div', 'report__hero');
    hero.append(number('report__big', report.hero.value), el('span', 'report__label', report.hero.label));
    const grid = el('dl', 'report__grid');
    for (const stat of report.stats) {
      const cell = el('div', stat.hot ? 'report__cell is-hot' : 'report__cell');
      const value = el('dd');
      value.append(number('report__num', stat.value));
      cell.append(el('dt', 'report__label', stat.label), value);
      grid.append(cell);
    }
    const parts = [head, hero, grid];
    if (report.longest) {
      const longest = el('p', 'report__longest');
      longest.append(el('span', 'report__chip', report.longest.label), el('span', 'report__project', report.longest.project), el('b', 'report__time', report.longest.time));
      parts.push(longest);
    }
    const foot = el('footer', 'report__foot');
    foot.append(el('span', '', report.foot), el('span', 'report__sign', 'CAPRI // PROJECT CAPRICORN'));
    parts.push(foot);
    this.report.replaceChildren(...parts);

    const numbers = [...this.report.querySelectorAll('[data-value]')];
    const show = (node, k) => {
      node.textContent = Math.round(Number(node.dataset.value) * k).toLocaleString(document.documentElement.lang);
    };
    if (reducedMotion.matches) {
      numbers.forEach((node) => show(node, 1));
      return;
    }
    const t0 = performance.now();
    const step = () => {
      let counting = false;
      numbers.forEach((node, i) => {
        const k = clamp((performance.now() - t0 - 180 - i * 70) / COUNT_MS, 0, 1);
        show(node, ease.out(k));
        if (k < 1) counting = true;
      });
      if (!counting) clearInterval(this.countTimer);
    };
    step();
    this.countTimer = setInterval(step, 1000 / 12);
  }

  renderActions(actions = [], onAction = null) {
    this.actions.replaceChildren(...actions.map(({ id, label, primary }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = primary ? 'panel__action is-primary' : 'panel__action';
      button.dataset.id = id;
      button.textContent = label;
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // a click on the panel itself closes it
        if (onAction) onAction(id);
        else this.onAction?.(id);
      });
      return button;
    }));
    this.actions.hidden = !actions.length;
  }

  // New buttons on the message on screen (in a chat: the app she offers to close), or none.
  setActions(actions, onAction) {
    if (!this.current) return;
    this.current.actions = actions;
    this.renderActions(actions, onAction);
    this.place();
  }

  renderChat(chat) {
    if (!chat) this.onSpeechCancel?.();
    this.el.classList.toggle('is-chat', Boolean(chat));
    this.el.classList.toggle('is-voice', Boolean(chat && chat.mode === 'voice'));
    this.el.classList.remove('has-chat-turn');
    this.line.classList.remove('is-streaming');
    this.chatForm.hidden = !chat;
    this.note.hidden = !chat?.note;
    if (!chat) return;
    const speechStatus = this.el.querySelector('.panel__dictation-status');
    if (speechStatus) { speechStatus.hidden = true; speechStatus.textContent = ''; }
    this.chatInput.placeholder = chat.placeholder;
    this.chatInput.setAttribute('aria-label', chat.placeholder);
    this.chatInput.disabled = false;
    this.chatSend.disabled = false;
    this.chatSend.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    this.chatSend.setAttribute('aria-label', chat.send); this.chatSend.title = chat.send;
    this.setConversationMode(chat.mode || 'text');
    this.chatClose.setAttribute('aria-label', chat.close);
    this.note.replaceChildren();
    if (chat.note) {
      const tag = document.createElement('b');
      tag.textContent = chat.noteTag || '';
      this.note.replaceChildren(tag, ` ${chat.note}`);
    }
    if (chat.autofocus !== false) requestAnimationFrame(() => this.chatInput.focus());
  }

  setConversationMode(mode) {
    if (!this.current?.chat) return;
    const voice = mode === 'voice';
    this.current.chat.mode = voice ? 'voice' : 'text';
    this.el.classList.toggle('is-voice', voice);
    if (this.chatTyping) {
      this.chatTyping.hidden = !voice;
      const label = this.current.chat.typingLabel || 'Switch to typing';
      this.chatTyping.setAttribute('aria-label', label); this.chatTyping.title = label;
    }
    this.chatInput.placeholder = voice ? (this.current.chat.voicePlaceholder || 'Say something...') : this.current.chat.placeholder;
    this.chatInput.setAttribute('aria-label', this.chatInput.placeholder);
    this.chatInputSize = null;
    this.place();
  }

  // A chat turn: what you said goes up top, her answer starts coming in under it (stream), without
  // announcing the panel all over again.
  chatTurn({ quote, face }) {
    if (!this.current?.chat) return;
    this.el.classList.add('has-chat-turn');
    clearInterval(this.decodeTimer);
    this.setFace(face);
    this.quote.textContent = quote;
    this.quote.hidden = !quote;
    this.line.textContent = '';
    this.line.classList.add('is-streaming');
    this.place();
  }

  // Her answer so far (done: all of it).
  stream(text, { done = false } = {}) {
    if (!this.current?.chat) return;
    this.line.textContent = text;
    this.line.classList.toggle('is-streaming', !done);
    this.line.scrollTop = this.line.scrollHeight;
    this.place();
  }

  // While she answers you can't send another.
  setChatBusy(busy) {
    this.chatInput.disabled = busy;
    this.chatSend.disabled = busy;
    this.onChatBusy?.(busy);
    if (!busy && this.current?.chat) this.chatInput.focus();
  }

  // A button of the message on screen says something else now ("Copied").
  relabel(id, label) {
    const button = this.actions.querySelector(`[data-id="${id}"]`);
    if (button) button.textContent = label;
  }

  // A picture of the panel as it is (her report card), handed to `copy` as a rect of the overlay:
  // on a dark plate of its own, without its buttons, so it reads anywhere it's pasted.
  async snapshot(copy) {
    this.el.classList.add('is-capturing');
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    await frame();
    const r = this.el.getBoundingClientRect();
    const pad = 18;
    const rect = {
      x: Math.max(0, Math.floor(r.left - pad)),
      y: Math.max(0, Math.floor(r.top - pad)),
      width: Math.ceil(r.width + pad * 2 + 6), // + her violet shadow
      height: Math.ceil(r.height + pad * 2 + 6),
    };
    const plate = document.createElement('div');
    plate.className = 'snap-plate';
    Object.assign(plate.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.append(plate);
    await frame();
    await frame();
    try {
      return await copy(rect);
    } finally {
      plate.remove();
      this.el.classList.remove('is-capturing');
    }
  }

  // Refresh the log of the message on screen without re-announcing it.
  updateLog(log) {
    if (this.current && this.visible) this.renderLog(log);
  }

  renderLog(entries) {
    this.log.replaceChildren(...entries.slice(-4).map((e) => {
      const li = document.createElement('li');
      if (e.error) li.className = 'is-error';
      const verb = document.createElement('span');
      verb.className = 'panel__verb';
      verb.textContent = e.verb;
      const target = document.createElement('span');
      target.className = 'panel__target';
      target.textContent = e.target || '';
      li.append(verb, target);
      return li;
    }));
    this.log.hidden = entries.length === 0;
  }

  hide() {
    if (this.el.hidden || this.leaving) return;
    const gone = this.current;
    // Preserve the conversation card's height while mic cleanup clears its status.
    if (gone?.chat) this.el.style.setProperty('--closing-height', `${this.el.offsetHeight}px`);
    this.current = null;
    this.leaving = true;
    this.el.classList.remove('is-entering');
    if (!reducedMotion.matches) this.el.classList.add('is-leaving');
    this.onSpeechCancel?.();
    this.animatedPortrait.setActive(false);
    clearTimeout(this.hideTimer);
    clearInterval(this.decodeTimer);
    this.onTalk?.(false);
    if (gone) {
      this.onDismiss?.(gone);
      gone.onLeave?.();
    }
    const missed = gone?.chat && this.missed;
    this.missed = null;
    if (missed && performance.now() - missed.missedAt < 120000) setTimeout(() => this.say(missed), 400);
    const finish = () => {
      if (!this.leaving) return;
      this.el.hidden = true;
      this.onHidden?.();
    };
    if (reducedMotion.matches) finish();
    else {
      const duration = gone?.chat ? (gone.chat.mode === 'voice' ? 180 : 160) : 150;
      this.leaveTimer = setTimeout(finish, duration);
    }
    if (this.tickerAction) this.setTicker(this.tickerAction);
  }

  // Only drop a sticky alert (permission prompt) once it has been dealt with.
  clearKind(kind) {
    if (this.current?.kind === kind) this.hide();
  }

  suspend() {
    this.onSpeechCancel?.();
    this.suspended = true;
    this.animatedPortrait.setActive(false);
    this.el.style.visibility = 'hidden';
    this.tickerEl.style.visibility = 'hidden';
  }

  resume() {
    this.suspended = false;
    this.animatedPortrait.setActive(!this.el.hidden && !this.leaving);
    this.el.style.visibility = '';
    this.tickerEl.style.visibility = '';
    this.place();
    if (!this.el.hidden) this.replayEnter();
    else if (this.tickerAction) this.setTicker(this.tickerAction);
  }

  replayEnter() {
    this.el.classList.remove('is-entering');
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add('is-entering');
  }

  decode(text, kind) {
    clearInterval(this.decodeTimer);
    if (reducedMotion.matches || !text) {
      this.line.textContent = text;
      return;
    }
    const chars = [...text];
    let done = 0;
    this.onTalk?.(true);
    const step = () => {
      done = Math.min(chars.length, done + 2);
      const head = chars.slice(0, done).join('');
      let tail = '';
      for (let i = done; i < Math.min(chars.length, done + 6); i++) {
        tail += chars[i] === ' ' ? ' ' : NOISE[Math.floor(Math.random() * NOISE.length)];
      }
      this.line.textContent = head + tail;
      if (chars[done - 1] && chars[done - 1] !== ' ') this.onChar?.(kind);
      if (done >= chars.length) {
        clearInterval(this.decodeTimer);
        this.line.textContent = text;
        this.onTalk?.(false);
      }
    };
    step();
    this.decodeTimer = setInterval(step, DECODE_STEP_MS);
  }

  // Ticker: "▸ Modifie  main.js" floating over her head while Claude works.
  // Throttled so a burst of tool calls reads as a flicker of activity, not noise.
  setTicker(action) {
    this.tickerAction = action;
    clearTimeout(this.tickerTimer);
    if (!action || this.visible || this.suspended) {
      this.tickerEl.hidden = true;
      return;
    }
    const wait = Math.max(0, 380 - (performance.now() - this.tickerShownAt), this.leaving && !this.el.hidden ? 170 : 0);
    this.tickerTimer = setTimeout(() => {
      // A full message may have opened while this throttled update was waiting.
      if (this.visible || this.suspended || this.tickerAction !== action) return;
      // Claude thinking: the seconds counting up don't flash each time, only the first one does
      const counting = action.thinking && this.tickerEl.dataset.thinking === 'true' && !this.tickerEl.hidden;
      this.tickerShownAt = performance.now();
      this.tickerVerb.textContent = action.verb;
      this.tickerTarget.textContent = action.target || '';
      this.tickerEl.dataset.error = action.error ? 'true' : 'false';
      this.tickerEl.dataset.thinking = action.thinking ? 'true' : 'false';
      this.tickerEl.hidden = false;
      if (!counting) {
        this.tickerEl.classList.remove('is-flash');
        void this.tickerEl.offsetWidth;
        this.tickerEl.classList.add('is-flash');
      }
      this.place();
    }, wait);
  }

  setAnchor(anchor, view) {
    this.anchor = anchor;
    this.view = view;
    this.place();
  }

  // Sit on the tips of her mane, leaning toward the middle of the screen; tail points at her.
  place() {
    if (!this.el.hidden) this.resizeChatInput();
    const { x, y, top: crown = y - 80, lean = 0 } = this.anchor;
    const { w } = this.view;
    const margin = 14;
    // lean: the side she wants it on (away from what she's pointing at), else toward the middle
    const towardLeft = lean ? lean < 0 : x > w / 2;

    if (!this.el.hidden) {
      const pw = this.el.offsetWidth;
      const ph = this.el.offsetHeight;
      let left = towardLeft ? x - pw + 46 : x - 46;
      left = clamp(left, margin, w - pw - margin);
      let top = crown - ph + 14;
      let below = false;
      if (top < margin) {
        top = y + 40;
        below = true;
      }
      if (this.view.h) top = clamp(top, margin, this.view.h - ph - margin); // a tall one (an answer) stays on screen
      this.el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      this.el.style.setProperty('--tail-x', `${clamp(x - left, 24, pw - 24)}px`);
      this.el.dataset.below = below ? 'true' : 'false';
    }

    if (!this.tickerEl.hidden) {
      const tw = this.tickerEl.offsetWidth;
      const left = clamp(x - tw / 2, margin, w - tw - margin);
      const top = Math.max(margin, crown - this.tickerEl.offsetHeight - 10);
      this.tickerEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }
  }

  rect() {
    if (this.el.hidden || this.suspended) return null;
    return this.el.getBoundingClientRect();
  }
}
