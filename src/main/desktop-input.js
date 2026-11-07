'use strict';
// Native input output only: no hooks, keystroke collection or persistent worker.
let cached;
function native() {
  if (process.platform !== 'win32') throw Error('Desktop input requires Windows.');
  if (cached) return cached;
  const ffi = require('koffi'), path = require('node:path');
  const user = ffi.load(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'user32.dll'));
  cached = { size: ffi.sizeof('void *') === 8 ? 40 : 28,
    send: user.func('__stdcall', 'SendInput', 'uint32', ['uint32', 'void *', 'int32']),
    cursor: user.func('__stdcall', 'SetCursorPos', 'int32', ['int32', 'int32']) };
  return cached;
}
const KEYS = { ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10, win: 0x5b,
  enter: 0x0d, tab: 9, escape: 0x1b, backspace: 8, delete: 0x2e, space: 0x20,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22 };
function records(action, size = 40) {
  const offset = size === 40 ? 8 : 4;
  const key = (vk, scan = 0, flags = 0) => {
    const b = Buffer.alloc(size); b.writeUInt32LE(1); b.writeUInt16LE(vk, offset);
    b.writeUInt16LE(scan, offset + 2); b.writeUInt32LE(flags, offset + 4); return b;
  };
  const mouse = (flags, amount = 0) => {
    const b = Buffer.alloc(size); b.writeInt32LE(amount, offset + 8); b.writeUInt32LE(flags, offset + 12); return b;
  };
  if (action.kind === 'type') {
    if (typeof action.text !== 'string' || !action.text || action.text.length > 2000) throw Error('Type 1–2000 characters at a time.');
    return Array.from({ length: action.text.length }, (_, i) => [key(0, action.text.charCodeAt(i), 4), key(0, action.text.charCodeAt(i), 6)]).flat();
  }
  if (action.kind === 'key') {
    if (typeof action.key !== 'string') throw Error('A key or chord is required.');
    const codes = action.key.toLowerCase().split('+').map(x => x.trim()).map(name =>
      KEYS[name] ?? (/^[a-z0-9]$/.test(name) ? name.toUpperCase().charCodeAt(0) : /^f(?:[1-9]|1[0-2])$/.test(name) ? 0x6f + Number(name.slice(1)) : null));
    if (!codes.length || codes.length > 4 || codes.includes(null)) throw Error('Unsupported keyboard chord.');
    return [...codes.map(vk => key(vk)), ...codes.toReversed().map(vk => key(vk, 0, 2))];
  }
  if (action.kind === 'click') {
    const flags = { left: [2, 4], right: [8, 16], middle: [32, 64] }[action.button || 'left'];
    if (!flags) throw Error('Invalid mouse button.');
    return flags.map(flag => mouse(flag));
  }
  if (action.kind === 'scroll') {
    if (!Number.isInteger(action.amount) || !action.amount || Math.abs(action.amount) > 10) throw Error('Scroll by -10 to 10 wheel steps.');
    return [mouse(0x0800, action.amount * 120)];
  }
  throw Error('Unsupported desktop input action.');
}
async function perform(action, point, { check = () => {} } = {}) {
  check(); const api = native();
  if (action.kind === 'drag') {
    const [down, up] = records({ kind: 'click', button: 'left' }, api.size);
    if (!point?.to) throw Error('Drag destination is required.');
    if (!api.cursor(point.x, point.y)) throw Error('Could not position the pointer.');
    try {
      if (api.send(1, down, api.size) !== 1) throw Error('Windows rejected mouse input.');
      for (let step = 1; step <= 12; step++) {
        check(); if (!api.cursor(Math.round(point.x + (point.to.x - point.x) * step / 12), Math.round(point.y + (point.to.y - point.y) * step / 12))) throw Error('Pointer movement failed.');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    } finally { api.send(1, up, api.size); }
    return { inputSent: true, verifiedOutcome: false };
  }
  const input = records(action, api.size);
  if (point && !api.cursor(point.x, point.y)) throw Error('Could not position the pointer.');
  if (api.send(input.length, Buffer.concat(input), api.size) !== input.length) throw Error('Windows rejected desktop input. Elevated or protected windows may be inaccessible.');
  return { inputSent: true, verifiedOutcome: false };
}
module.exports = { records, perform };
