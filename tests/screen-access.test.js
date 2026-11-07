'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ScreenAccess } = require('../src/main/screen-access');
const { records } = require('../src/main/desktop-input');
function fixture() {
  const config = { systemAccess: true, screenAwareness: true }, calls = [];
  let at = 100000, foreground = 4;
  const display = { id: 7, primary: true, bounds: { x: -1000, y: 0, width: 1000, height: 800 } };
  const service = new ScreenAccess({ settings: () => config, displays: () => [display],
    capture: async () => ({ url: 'data:image/jpeg;base64,YQ==', width: 500, height: 400 }),
    foreground: () => ({ id: foreground }), toNativePoint: p => p, now: () => at,
    confirm: async () => true, input: (args, point) => { calls.push({ args, point }); return { inputSent: true }; } });
  const context = { check() {}, text: 'Click the button' };
  return { service, config, calls, display, context, tick: () => at += 31000, focus: n => foreground = n };
}
test('screen image coordinates map to the observed monitor, then the frame is consumed', async () => {
  const f = fixture(), frame = await f.service.snapshot();
  const action = { snapshotId: frame.snapshotId, kind: 'click', x: 250, y: 100, button: 'left', risk: 'routine', summary: 'Click the requested button' };
  const result = await f.service.act(action, f.context);
  assert.equal(result.inputSent, true); assert.deepEqual(f.calls[0].point, { x: -500, y: 200 });
  await assert.rejects(f.service.act(action, f.context), /fresh screen/); assert.equal(f.calls.length, 1);
});
test('stale, wrong-monitor, out-of-bounds, changed-focus and revoked inputs cannot execute', async () => {
  for (const change of ['stale', 'focus', 'geometry', 'pause', 'disabled', 'bounds']) {
    const f = fixture(), frame = await f.service.snapshot();
    const action = { snapshotId: frame.snapshotId, kind: 'click', x: 10, y: 10, risk: 'routine', summary: 'Click' };
    if (change === 'stale') f.tick();
    if (change === 'focus') f.focus(9);
    if (change === 'geometry') f.service.displays = () => [{ ...f.display, bounds: { ...f.display.bounds, width: 800 } }];
    if (change === 'pause') f.config.gamingMode = true;
    if (change === 'disabled') f.config.systemAccess = false;
    if (change === 'bounds') action.x = 999;
    await assert.rejects(f.service.act(action, f.context)); assert.equal(f.calls.length, 0, change);
  }
  await assert.rejects(fixture().service.snapshot('missing-display'), /No display/);
});
test('capture rechecks permissions and foreground, and consequential input honors review and cancellation', async () => {
  const f = fixture(); f.service.capture = async () => { f.focus(8); return { url: 'data:image/jpeg;base64,YQ==', width: 500, height: 400 }; };
  await assert.rejects(f.service.snapshot(), /foreground changed/);
  const g = fixture(), frame = await g.service.snapshot(); g.service.confirm = async () => false;
  assert.equal((await g.service.act({ snapshotId: frame.snapshotId, kind: 'key', key: 'enter', risk: 'consequential', summary: 'Send message' }, g.context)).cancelled, true);
  assert.equal(g.calls.length, 0);
  g.service.confirm = async () => { g.config.systemAccess = false; return true; };
  await assert.rejects(g.service.act({ snapshotId: frame.snapshotId, kind: 'key', key: 'enter', risk: 'consequential', summary: 'Send message' }, g.context), /revoked/);
  assert.equal(g.calls.length, 0);
});
test('native input buffers encode Unicode, key-up pairs and mouse events without recording input', () => {
  for (const size of [40, 28]) {
    const typed = records({ kind: 'type', text: 'á😀' }, size), offset = size === 40 ? 8 : 4;
    assert.equal(typed.length, 6); assert.equal(typed[0].length, size);
    assert.equal(typed[0].readUInt16LE(offset + 2), 'á'.charCodeAt(0));
    assert.equal(typed[1].readUInt32LE(offset + 4), 6);
    assert.equal(records({ kind: 'key', key: 'ctrl+a' }, size).length, 4);
    assert.equal(records({ kind: 'click', button: 'left' }, size).length, 2);
    assert.equal(records({ kind: 'scroll', amount: -2 }, size)[0].readInt32LE(offset + 8), -240);
  }
  assert.throws(() => records({ kind: 'key', key: 'run arbitrary command' }));
  assert.throws(() => records({ kind: 'type', text: 'x'.repeat(2001) }));
});

test('review cannot reuse an expired, replaced, consumed or resized frame', async () => {
  for (const change of ['expired', 'replaced', 'consumed', 'resized']) {
    const f = fixture(), frame = await f.service.snapshot();
    f.service.confirm = async () => {
      if (change === 'expired') f.tick();
      if (change === 'replaced') await f.service.snapshot();
      if (change === 'consumed') f.service.frames.clear();
      if (change === 'resized') f.display.bounds.width = 700;
      return true;
    };
    await assert.rejects(f.service.act({ snapshotId: frame.snapshotId, kind: 'key', key: 'enter',
      risk: 'consequential', summary: 'Send' }, f.context), /fresh screen|geometry changed/);
    assert.equal(f.calls.length, 0, change);
  }
});
