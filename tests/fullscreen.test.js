'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {coversDisplay,startFullscreenWatch}=require('../src/main/fullscreen');

test('fullscreen matches full monitor bounds, not maximized work area, other monitors or Capri itself',()=>{
  const display={x:-1920,y:0,width:1920,height:1080};
  const window={...display,pid:123,caption:false};
  assert.equal(coversDisplay(window,display,456),true);
  assert.equal(coversDisplay({...window,caption:true},display,456),false);
  assert.equal(coversDisplay({...window,height:1040},display,456),false);
  assert.equal(coversDisplay({...window,x:0},display,456),false);
  assert.equal(coversDisplay({...window,pid:456},display,456),false);
  assert.equal(coversDisplay(null,display,456),false);
  assert.equal(coversDisplay({...window,x:-1921,width:1922},display,456),true);
});

test('geometry watcher emits changed fullscreen states immediately and survives transient failures',()=>{
  const display={x:0,y:0,width:1280,height:720},events=[];
  let row=null,fail=false;
  const watch=startFullscreenWatch({read:()=>{if(fail)throw Error('temporary');return row;},display:()=>display,onChange:value=>events.push(value),interval:10000});
  try{
    row={...display,pid:0,caption:false};watch.tick();watch.tick();
    fail=true;watch.tick();fail=false;row=null;watch.tick();
    assert.deepEqual(events,[false,true,false]);
  }finally{watch.stop();}
});

async function fixture(reduce=false){
  const source=fs.readFileSync(path.join(__dirname,'../src/renderer/js/fullscreen-presence.js'),'utf8')
    .replace("import { reducedMotion } from './util.js';",`const reducedMotion={matches:${reduce}};`);
  const {FullscreenPresence}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  global.document={body:{classList:{toggle(){}}}};
  const frames=new Map(),acks=[],poses=[];
  let clock=0,id=0,listener,resolveSnapshot;
  const capri={p:{alpha:1},root:{dataset:{}},hidden:false,scale:0.6,pos:{x:500,y:600},
    fx:{beam(){},burst(){}},voice:{play(){}},head:()=>({x:500,y:300}),endAct(){},cancelDrag(){},
    drawFrame(){poses.push(this.fullscreenProgress);}};
  const controller=new FullscreenPresence({capri,host:{onFullscreenState:fn=>{listener=fn;},
    fullscreenState:()=>new Promise(resolve=>{resolveSnapshot=resolve;}),fullscreenRendered:state=>acks.push(state)},
    now:()=>clock,schedule:fn=>{frames.set(++id,fn);return id;},cancel:id=>frames.delete(id)});
  return {controller,capri,acks,frames,poses,send:state=>listener(state),snapshot:resolveSnapshot,
    step(time){clock=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}};
}

test('rapid fullscreen changes reverse the current teleport without jumps, stale acknowledgments or stuck state',async()=>{
  const f=await fixture();
  f.send({active:true,revision:1});
  assert.equal(f.capri.fullscreen,true,'Input suppression starts synchronously');
  f.step(40);const halfway=f.controller.progress;
  assert.ok(halfway>0&&halfway<1);
  f.send({active:false,revision:2});
  assert.equal(f.controller.progress,halfway,'Reversal preserves the exact visible pose');
  f.send({active:true,revision:3});f.step(55);
  f.send({active:false,revision:4});f.step(250);
  assert.equal(f.capri.fullscreen,false);
  assert.equal(f.capri.fullscreenProgress,0);
  assert.deepEqual(f.acks,[{revision:4,hidden:false}]);
  f.send({active:true,revision:3});f.snapshot({active:true,revision:0});await Promise.resolve();
  assert.equal(f.capri.fullscreenProgress,0,'Old events and late initial snapshots cannot resurrect an old state');
  for(let revision=5;revision<105;revision++){
    f.send({active:revision%2===1,revision});f.step(250+(revision-4)*3);
  }
  f.step(1000);
  assert.equal(f.frames.size,0);assert.equal(f.capri.fullscreen,false);
  assert.equal(f.capri.p.alpha,1,'Presence never overwrites underlying pet alpha');
  assert.ok(f.poses.every(value=>value>=0&&value<=1));
});

test('completed fullscreen disappearance and reduced-motion reversal both settle',async()=>{
  for(const reduce of [false,true]){
    const f=await fixture(reduce);
    f.send({active:true,revision:1});f.step(200);
    assert.equal(f.capri.fullscreenProgress,1);assert.equal(f.capri.root.dataset.fullscreen,'away');
    assert.deepEqual(f.acks,[{revision:1,hidden:true}]);
    f.send({active:false,revision:2});f.step(400);
    assert.equal(f.capri.fullscreenProgress,0);assert.equal(f.capri.root.dataset.fullscreen,'visible');
    assert.equal(f.frames.size,0);
  }
});

test('fullscreen changes while gaming stay silent, then restore effects after resuming',async()=>{
  const f=await fixture(),sounds=[],effects=[];
  f.capri.voice.play=name=>sounds.push(name);
  f.capri.fx.beam=()=>effects.push('beam');
  f.capri.fx.burst=()=>effects.push('burst');
  f.capri.gaming=true;
  for(let revision=1;revision<=6;revision++) {
    f.send({active:revision%2===1,revision});f.step(revision*200);
  }
  assert.deepEqual(sounds,[]);assert.deepEqual(effects,[]);
  assert.equal(f.capri.fullscreen,false);
  f.capri.gaming=false;
  f.send({active:true,revision:7});f.step(1500);
  f.send({active:false,revision:8});f.step(1700);
  assert.deepEqual(sounds,['teleport-out','teleport-in']);
  assert.equal(f.capri.fullscreen,false);
});
