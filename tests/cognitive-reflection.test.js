'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ReflectionEngine, validateReflection, REFLECTION_SCHEMA } = require('../src/main/cognitive-reflection');

const result = {
  question: 'Would asking about this application be useful?',
  hypothesis: 'The repeated visits might indicate ongoing work.',
  counterpoint: 'Switching windows does not demonstrate a problem.',
  next_step: 'wait',
  confidence: 0.3,
  priority: 0.2,
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  let now = 100_000;
  let cfg = { agentEnabled: true, gamingMode: false, cognitiveEnabled: true };
  let pending = [{ id: 3, subject: 'code', evidence: 'foreground-activation-repeated',
    question: 'Repeated app focus', confidence: 0.35 }];
  let recorded = [];
  let modelCalls = 0;
  let canRun = true;
  let infer = async () => { modelCalls++; return JSON.stringify(result); };
  const journal = {
    allowed: () => !cfg.gamingMode && cfg.agentEnabled !== false,
    openQuestions: () => pending,
    recordReflection: (id, value) => { recorded.push({ id, value }); pending=[]; return true; },
  };
  const engine = new ReflectionEngine({
    journal, settings: () => cfg, models: async () => ['qwen3.5:9b'],
    infer: (...args) => infer(...args), canRun: () => canRun, now: () => now,
  });
  return { engine, recorded, journal, get calls() { return modelCalls; },
    setPending: p => { pending=p; }, setCanRun: v => { canRun=v; },
    setCfg: v => { cfg=v; }, setInfer: v => { infer=v; }, advance: v => { now+=v; } };
}

test('validates reflection shapes and numeric limits', () => {
  assert.deepEqual(validateReflection(result),result);
  for (const invalid of [
    { ...result, confidence: NaN }, { ...result, priority: 1.1 },
    { ...result, next_step: 'execute_command' }, { ...result, tool: 'shell' },
    { ...result, question: '' }, { ...result, hypothesis: 'X'.repeat(321) },
  ]) assert.throws(() => validateReflection(invalid),/Invalid/);
  assert.equal(REFLECTION_SCHEMA.additionalProperties,false);
});

test('generates one private reflection using the configured local model', async t => {
  const f=fixture();t.after(()=>f.engine.close());
  assert.equal(await f.engine.run(),true);
  assert.equal(f.calls,1);
  assert.equal(f.recorded.length,1);
  assert.equal(f.recorded[0].id,3);
  assert.equal(f.recorded[0].value.next_step,'wait');
  assert.equal(f.engine.status().callsLastHour,1);
});

test('never runs without permission, a question or foreground capacity', async t => {
  const f=fixture();t.after(()=>f.engine.close());
  f.setCanRun(false);assert.equal(await f.engine.run(),false);
  f.setCanRun(true);f.setPending([]);assert.equal(await f.engine.run(),false);
  f.setPending([{id:1,question:'test',subject:'code',evidence:'event'}]);
  f.setCfg({agentEnabled:true,gamingMode:true});assert.equal(await f.engine.run(),false);
  f.setCfg({agentEnabled:false,gamingMode:false});assert.equal(await f.engine.run(),false);
  assert.equal(f.calls,0);
});

test('respects two-call hourly limit even on malformed output', async t => {
  const f=fixture();t.after(()=>f.engine.close());
  f.setInfer(async () => '{invalid');
  assert.equal(await f.engine.run(),false);
  f.advance(60_000);
  assert.equal(await f.engine.run(),false);
  assert.equal(f.engine.status().callsLastHour,2);
  f.advance(60_000);
  assert.equal(await f.engine.run(),false);
});

test('cancellation after inference starts prevents journal writes', async t => {
  const f=fixture();t.after(()=>f.engine.close());
  let finish;
  f.setInfer(() => new Promise(resolve => {finish=resolve;}));
  const work=f.engine.run();
  await tick();await tick();
  f.engine.cancel();
  finish(JSON.stringify(result));
  assert.equal(await work,false);
  assert.equal(f.recorded.length,0);
});

test('rejects invalid model responses before persisting', async t => {
  const f=fixture();t.after(()=>f.engine.close());
  f.setInfer(async () => JSON.stringify({...result, next_step:'delete_files'}));
  assert.equal(await f.engine.run(),false);
  assert.equal(f.recorded.length,0);
  assert.equal(f.engine.status().failedAttempts,1);
});
