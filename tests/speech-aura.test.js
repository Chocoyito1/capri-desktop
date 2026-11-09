const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/speech-aura.js'), 'utf8');
  const { SpeechAura } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const classes = new Set(), properties = new Map();
  const aura = new SpeechAura({ classList: { toggle(k,v) { v ? classes.add(k) : classes.delete(k); } },
    style: { setProperty(k,v) { properties.set(k,v); }, removeProperty(k) { properties.delete(k); } } });
  return { aura, classes, properties };
}

test('aura follows sound with a smooth attack, syllable release and complete silence cleanup', async () => {
  const { aura, classes, properties } = await fixture();
  aura.update(0, 0); aura.update(0, 16);
  assert.equal(classes.size, 0);
  aura.update(.06, 32);
  const attack = aura.amount;
  assert(attack > 0 && attack < .4);
  for (let t=48; t<=400; t+=16) aura.update(.06, t);
  assert(aura.amount > .7);
  const peak = aura.amount;
  aura.update(0, 416);
  assert(aura.amount > 0 && aura.amount < peak);
  aura.update(.06, 432);
  assert(aura.amount > attack);
  for (let t=448; t<=1600; t+=16) aura.update(0, t);
  assert.equal(aura.amount, 0);
  assert.equal(classes.size, 0);
  assert.equal(properties.size, 0);
});

test('hidden characters clear immediately; reduced motion retains a steady sound envelope', async () => {
  const { aura, properties } = await fixture();
  aura.update(.1, 0);
  for (let t=16; t<=400; t+=16) aura.update(.1, t, { reducedMotion: true });
  assert.equal(Number(properties.get('--speech-aura')), Number(aura.amount.toFixed(4)));
  aura.update(.1, 416, { visible: false });
  assert.equal(aura.amount, 0);
  assert.equal(properties.size, 0);
  for (let t=432; t<=1800; t+=16) aura.update(NaN, t);
  assert.equal(aura.amount, 0);
});
