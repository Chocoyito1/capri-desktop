'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function fixture(t) {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/pointer-recovery.js'), 'utf8');
  const { PointerRecovery } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let now = 1000, revision = 0, eligible = true, held = false, calls = 0, get = async () => ({ inside: true, x: 12, y: 30 });
  const updates = [];
  const recovery = new PointerRecovery({ host: { cursor: () => { calls++; return get(); } }, now: () => now,
    eligible: () => eligible, held: () => held, revision: () => revision, update: p => updates.push(p),
    schedule: () => 1, cancel() {} });
  t.after(() => recovery.close());
  return { recovery, updates, get calls() { return calls; }, tick(ms = 300) { now += ms; },
    event() { revision++; recovery.observed(); }, block() { eligible = false; }, hold() { held = true; }, get(fn) { get = fn; } };
}
test('missing forwarded mousemove recovers the real cursor without stealing an active drag', async t => {
  const f = await fixture(t);
  await f.recovery.sample(); assert.deepEqual(f.updates, [{ x: 12, y: 30 }]);
  f.event(); await f.recovery.sample(); assert.equal(f.calls, 1);
  f.tick(); await f.recovery.sample(); assert.equal(f.calls, 2);
  f.hold(); f.tick(); await f.recovery.sample(true); assert.equal(f.calls, 2);
});
test('stale cursor replies cannot override a new mouse event, fullscreen, capture or disposal', async t => {
  for (const change of ['event', 'fullscreen', 'held', 'closed']) {
    const f = await fixture(t); let finish;
    f.get(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.recovery.sample(true); await f.recovery.sample(true);
    assert.equal(f.calls, 1, 'No overlapping cursor requests');
    if (change === 'event') f.event();
    if (change === 'fullscreen') f.block();
    if (change === 'held') f.hold();
    if (change === 'closed') f.recovery.close();
    finish({ inside: true, x: 40, y: 60 }); await pending;
    assert.deepEqual(f.updates, [], change);
  }
});
test('outside-window cursors restore click-through and temporary failures remain retryable', async t => {
  const f = await fixture(t);
  f.get(async () => { throw Error('temporary'); }); await f.recovery.sample();
  f.get(async () => ({ inside: false, x: 10, y: 10 })); await f.recovery.sample();
  assert.deepEqual(f.updates, [null]); assert.equal(f.recovery.busy, false);
});
