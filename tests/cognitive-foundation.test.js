'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CognitiveFoundation } = require('../src/main/cognitive-foundation');

function fixture() {
  let now = 1_000_000;
  let cfg = { agentEnabled: true, gamingMode: false, privacy: {} };
  let app = 'Code';
  let calls = 0;
  const engine = new CognitiveFoundation({
    settings: () => cfg, now: () => now,
    context: { snapshot: async () => { calls++; return { foreground: { app, title: 'Secret document title' } }; } },
  });
  return { engine, get calls() { return calls; }, setApp: v => { app=v; },
    setCfg: v => { cfg=v; }, advance: ms => { now+=ms; } };
}

test('repeated foreground visits create one private, grounded question', async t => {
  const f=fixture(); t.after(()=>f.engine.close());
  assert.equal(await f.engine.foregroundChanged(), null);
  assert.equal(await f.engine.foregroundChanged(), null);
  const question=await f.engine.foregroundChanged();
  assert.equal(question.subject,'code');
  assert.equal(question.confidence,0.35);
  assert.equal(f.engine.list().length,1);
  assert.doesNotMatch(JSON.stringify(question), /Secret document title/);
  assert.equal(await f.engine.foregroundChanged(), null);
  assert.deepEqual(f.engine.status(),{enabled:true,busy:false,questions:1,modelCalls:0,unsolicitedMessages:0,stage:'persistent-inquiry'});
});

test('permissions, gaming and agent shutdown prevent observation', async t => {
  const f=fixture(); t.after(()=>f.engine.close());
  f.setCfg({agentEnabled:true,gamingMode:true,privacy:{}});
  assert.equal(await f.engine.foregroundChanged(),null);
  f.setCfg({agentEnabled:false,gamingMode:false,privacy:{}});
  assert.equal(await f.engine.foregroundChanged(),null);
  f.setCfg({agentEnabled:true,gamingMode:false,privacy:{contextForeground:false}});
  assert.equal(await f.engine.foregroundChanged(),null);
  f.setCfg({agentEnabled:true,gamingMode:false,privacy:{contextEvents:false}});
  assert.equal(await f.engine.foregroundChanged(),null);
  assert.equal(f.calls,0);
});

test('revalidates settings after asynchronous collection', async t => {
  let resolve;
  let cfg={agentEnabled:true,gamingMode:false,privacy:{}};
  const f=new CognitiveFoundation({settings:()=>cfg, context:{snapshot:()=>new Promise(r=>{resolve=r;})}});
  t.after(()=>f.close());
  const pending=f.foregroundChanged();
  cfg={...cfg,gamingMode:true};
  resolve({foreground:{app:'Code'}});
  assert.equal(await pending,null);
  assert.equal(f.list().length,0);
});

test('rejects window titles and malformed application names', t => {
  const f=fixture(); t.after(()=>f.engine.close());
  for (const app of ['C:\\Users\\secret', 'Chrome\npassword', '']) {
    f.setApp(app);
    assert.equal(f.engine.observeApp(app),null);
  }
  assert.equal(f.engine.list().length,0);
});

test('question dismissal, resolution and clearing are local and bounded', t => {
  const f=fixture(); t.after(()=>f.engine.close());
  f.engine.observeApp('Code');f.engine.observeApp('Code');
  const row=f.engine.observeApp('Code');
  assert.equal(f.engine.update(row.id,'resolved'),true);
  assert.equal(f.engine.update(row.id,'dismissed'),false);
  assert.equal(f.engine.list()[0].status,'resolved');
  f.engine.clear();
  assert.equal(f.engine.list().length,0);
});

test('limits stored questions and expires old entries', t => {
  const f=fixture(); t.after(()=>f.engine.close());
  for(let i=0;i<120;i++){
    const app='App'+i;
    f.engine.observeApp(app);f.engine.observeApp(app);f.engine.observeApp(app);
  }
  assert.equal(f.engine.list(100).length,100);
  f.advance(31*86_400_000);
  f.engine.prune();
  assert.equal(f.engine.list().length,0);
});
