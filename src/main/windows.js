'use strict';

// Optional decorative geometry watcher. Direct Win32 calls, no child process.
const { screen } = require('electron');
const native = require('./native-windows');

function startWindowWatch({ overlay, onUpdate }) {
  if (process.platform !== 'win32') return { stop() {} };
  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  let previous, timer;
  const tick = () => {
    if (overlay.isDestroyed()) { clearInterval(timer); return; }
    try {
      const snapshot = native.geometry(self), bounds = overlay.getBounds();
      const wins = snapshot.wins.map(win => {
        const dip = screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h });
        return { id: win.id, x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height, max: win.max };
      }).filter(w => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
      const result = { fg: snapshot.fg, wins }, serialized = JSON.stringify(result);
      if (serialized !== previous) { previous = serialized; onUpdate(result); }
    } catch { /* Skip transient Win32/display errors and retry on the next tick. */ }
  };
  timer = setInterval(tick, 250);
  tick();
  return { stop() { clearInterval(timer); } };
}

module.exports = { startWindowWatch };
