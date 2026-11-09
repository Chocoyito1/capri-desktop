'use strict';

// Full monitor bounds, rather than the work area: maximizing is not fullscreen.
function coversDisplay(window, display, ownPid = process.pid) {
  if (!window || window.pid === ownPid || window.caption || !display) return false;
  const tolerance = 2;
  return window.x <= display.x + tolerance && window.y <= display.y + tolerance
    && window.x + window.width >= display.x + display.width - tolerance
    && window.y + window.height >= display.y + display.height - tolerance;
}

function startFullscreenWatch({ read, display, onChange, interval = 50,
  ownPid = process.pid, now = Date.now, enterDelay = 150 }) {
  let previous, candidateAt;
  const tick = () => {
    try {
      const window = read();
      // Focusing our chat/launcher says nothing about the app underneath.
      // Do not manufacture a fullscreen exit and re-entry when focus returns.
      if (window?.pid === ownPid) { candidateAt = undefined; return; }
      const active = coversDisplay(window, display(), ownPid);
      if (!active) candidateAt = undefined;
      if (active && previous !== true) {
        candidateAt ??= now();
        // Native activation can briefly expose a fullscreen-shaped window.
        // Require a sustained observation before animating/hiding the pet.
        if (now() - candidateAt < enterDelay) return;
      }
      if (active !== previous) { previous = active; onChange(active); }
    } catch { /* A transient native/display failure must not flash Capri back in. */ }
  };
  const timer = setInterval(tick, interval);
  tick();
  return { tick, stop() { clearInterval(timer); } };
}

module.exports = { coversDisplay, startFullscreenWatch };
