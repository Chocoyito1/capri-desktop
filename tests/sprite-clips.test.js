const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const atlas = JSON.parse(fs.readFileSync('assets/capri/animation-v2/atlas.json'));
const load = () => import('data:text/javascript;base64,' + fs.readFileSync('src/renderer/js/sprite-clips.js').toString('base64'));

test('production cel exposures hold drawings and settle without time drift', async () => {
  const {validateAtlas, sampleClip} = await load();
  validateAtlas(atlas);
  assert.equal(sampleClip(atlas,'curious',249).index,0);
  assert.equal(sampleClip(atlas,'curious',250).index,1);
  assert.equal(sampleClip(atlas,'curious',1920).index,0);
  assert.equal(sampleClip(atlas,'curious',1e9).index,0);
  assert.equal(sampleClip(atlas,'rest',atlas.clips.rest.durationMs).index,0);
  assert.equal(sampleClip(atlas,'rest',NaN),null);
  const indices = new Set();
  for(let t=0;t<1920;t++) indices.add(sampleClip(atlas,'curious',t).index);
  assert.equal(indices.size,8);
});

test('atlas validation rejects out of bounds frames, paths and invalid exposures', async () => {
  const {validateAtlas} = await load();
  for (const mutate of [a=>a.frames[0].rect[0]=-1,a=>a.frames[0].rect[2]=241,
    a=>a.clips.curious.exposures[0][0]=999,a=>a.clips.curious.exposures[0][1]=0,
    a=>a.clips.curious.durationMs++,a=>a.image='../other.png',a=>a.width=0,
    a=>a.clips.rest.stillFrame=999,a=>a.clips.rest.exposures[0]=[0],a=>a.height=8192]) {
    const a = structuredClone(atlas);mutate(a);assert.throws(()=>validateAtlas(a));
  }
  assert.throws(()=>validateAtlas(atlas,1,1));
});

test('cel selection preserves intro, sitting, priority actions and reduced-motion entry', async () => {
  const {selectCelClip} = await load();
  const pet={p:{alpha:1},stance:'stand',mode:'idle',base:{name:'stand'}};
  assert.equal(selectCelClip(pet),'rest');
  for (const patch of [{busy:true},{stance:'sit'},{stance:'fall'},{dragging:true},{gaming:true},
    {groundRest:{}},{pointing:{}},{fullscreenProgress:.5},{mode:'sleep'},{pointerHeld:true},
    {p:{alpha:1,collapse:.2}},{act:{player:{name:'victory'}}}]) assert.equal(selectCelClip({...pet,...patch}),null);
  assert.equal(selectCelClip({...pet,act:{player:{name:'idlePreen'}}}),'curious');
  assert.equal(selectCelClip({...pet,act:{player:{name:'think'}}}),'curious');
});


test('breathing loop contains twelve new drawings, a shared seam, and a neutral motion-off hold', async () => {
  const {sampleClip} = await load();
  const rest = atlas.clips.rest;
  const indices = new Set();
  for (let ms=0;ms<rest.durationMs;ms++) indices.add(sampleClip(atlas,'rest',ms).index);
  assert.equal(indices.size,13, '12 breathing drawings plus the existing shared neutral');
  assert.equal(sampleClip(atlas,'rest',rest.durationMs-1).index,0);
  assert.equal(sampleClip(atlas,'rest',rest.durationMs).index,0);
  assert.equal(sampleClip(atlas,'rest',2100,true).index,0);
  assert.equal(atlas.frames.length,20);
  assert.equal(new Set(atlas.frames.map(frame=>frame.sha256)).size,20,'Every supplied drawing is distinct');
  const crypto = require('node:crypto');
  for(const source of atlas.sources) assert.equal(
    crypto.createHash('sha256').update(fs.readFileSync('assets/capri/animation-v2/'+source.path)).digest('hex'),source.sha256);
});

test('base cel clock loops continuously and restarts at neutral after an interrupted gesture', async () => {
  const {CelPlayback, sampleClip} = await load();
  const clock = new CelPlayback(), base={}, gesture={};
  assert.equal(clock.sample(atlas,'rest',base,100).index,0);
  assert.equal(clock.sample(atlas,'rest',base,1600).index,sampleClip(atlas,'rest',1500).index);
  assert.notEqual(clock.sample(atlas,'rest',base,1600).index,0);
  assert.equal(clock.sample(atlas,'curious',gesture,1700,{startAt:1700,durationMs:1920}).index,0);
  assert.notEqual(clock.sample(atlas,'curious',gesture,2500,{startAt:1700,durationMs:1920}).index,0);
  assert.equal(clock.sample(atlas,'rest',base,2600).index,0);
  assert.notEqual(clock.sample(atlas,'rest',base,4100).index,0);
  assert.equal(clock.sample(atlas,null,null,4200),null);
  assert.equal(clock.sample(atlas,'rest',base,10000).index,0,'Unsupported states clear old idle phase');
});

test('motion preferences hold neutral and resume the base at neutral without changing gesture timing', async () => {
  const {CelPlayback} = await load();
  const clock = new CelPlayback(), base={}, act={};
  clock.sample(atlas,'rest',base,0);
  assert.notEqual(clock.sample(atlas,'rest',base,1500).index,0);
  assert.equal(clock.sample(atlas,'rest',base,1600,{still:true}).index,0);
  assert.equal(clock.sample(atlas,'rest',base,5000,{still:true}).index,0);
  assert.equal(clock.sample(atlas,'rest',base,6000).index,0);
  assert.equal(clock.sample(atlas,'curious',act,6250,{startAt:6000,durationMs:3840}).index,0,'Gesture keeps its owner timing');
  assert.equal(clock.sample(atlas,'curious',act,6500,{startAt:6000,durationMs:3840}).index,1);
});
