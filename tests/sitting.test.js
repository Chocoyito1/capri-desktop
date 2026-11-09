'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../src/renderer/js',name),'utf8');
const uri=text=>`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const motion={matches:false};
global.matchMedia=()=>motion;
async function fixture() {
  const acting=uri(source('acting.js')), util=uri(source('util.js'));
  const code=source('capri.js')
    .replace("'./speech-aura.js'", JSON.stringify(uri(source('speech-aura.js'))))
    .replace("import { SpriteRenderer, SPRITE } from './sprite.js';",'const SPRITE={feet:{x:128,y:418},head:{x:124,y:132},hip:232,height:420,width:240,pad:56};')
    .replace("from './acting.js'",`from '${acting}'`).replace("from './util.js'",`from '${util}'`);
  const {Capri}=await import(uri(code));const {Player,NEUTRAL}=await import(acting);
  const pet=Object.create(Capri.prototype);
  Object.assign(pet,{pos:{x:500,y:794},view:{w:1280,h:800},scale:0.6,p:{...NEUTRAL,sit:0,alpha:1},
    root:{style:{}},canvas:{style:{}},sprite:{draw(){}},facing:1,stance:'stand',mode:'idle',
    base:new Player('stand'),act:null,groundRest:null,bob:0,tilt:0,sx:1,sy:1,
    nextSit:0,nextIdle:Infinity,nextTwitch:Infinity,nextShed:Infinity,nextGaze:Infinity,nextMove:Infinity,
    lastActivity:performance.now(),windows:{fg:0,wins:[]},fx:{},voice:{play(){throw Error('Rest must be silent');}}});
  return {pet,Player};
}
function finish(pet) {
  const player=pet.act.player;
  pet.animate(player.start+(player.total+1)*1000/12);
}

test('a pending pickup keeps native input active outside the silhouette and clears on every exit',async()=>{
  const savedWindow=global.window,savedDocument=global.document;
  try {
    for(const exit of ['pointerup','pointercancel','lostpointercapture','blur','cancelDrag']) {
      const {pet}=await fixture();
      global.window=new EventTarget();
      global.document={body:{style:{}},getElementById:()=>({hidden:true})};
      pet.dragging=false;pet.pointerHeld=false;
      pet.canvas=new EventTarget();let captured=null,clicks=0,drops=0,onBody=true,interactive=false;
      pet.canvas.style={};
      pet.canvas.setPointerCapture=id=>{captured=id;};
      pet.canvas.hasPointerCapture=id=>captured===id;
      pet.canvas.releasePointerCapture=()=>{captured=null;};
      pet.hit=()=>onBody;pet.onClick=()=>clicks++;pet.drop=()=>drops++;
      pet.stopPointing=()=>{};
      // Exercise the actual overlay routing, including the pre-drag threshold.
      const app=source('app.js');
      const refreshCode=app.slice(app.indexOf('  const refreshHit ='),app.indexOf('  // Her biochip:'));
      const refresh=new Function('capri','setInteractive','mouse','panel','wakeListener','talkMenu','onChip',
        refreshCode+'; return refreshHit;')(pet,on=>{interactive=on;},{x:500,y:650},{rect:()=>null},null,null,()=>false);
      pet.onPointerHold=()=>refresh();pet.bindPointer();
      const send=(target,type,props={})=>target.dispatchEvent(Object.assign(new Event(type),{
        button:0,pointerId:1,clientX:500,clientY:650,...props}));
      send(pet.canvas,'pointerdown');assert.equal(pet.pointerHeld,true);assert.equal(interactive,true);
      onBody=false;send(window,'pointermove',{clientX:503});refresh();
      assert.equal(pet.dragging,false);assert.equal(interactive,true,'sub-threshold movement must not turn click-through');
      pet.nextSit=0;pet.behave(performance.now());assert.equal(pet.groundRest,null,'held pointer blocks idle movement');
      send(window,'pointerup',{pointerId:2});assert.equal(pet.pointerHeld,true,'unrelated pointer cannot release the hold');
      if(exit!=='pointerup') {
        send(window,'pointermove',{clientX:530});assert.equal(pet.dragging,true);
      }
      if(exit==='cancelDrag')pet.cancelDrag();
      else send(exit==='lostpointercapture'?pet.canvas:window,exit);
      assert.equal(pet.pointerHeld,false,exit);assert.equal(pet.dragging,false,exit);
      assert.equal(interactive,false,exit);assert.equal(captured,null,exit);
      assert.equal(clicks,exit==='pointerup'?1:0);assert.equal(drops,exit==='pointerup'?0:1);
      onBody=true;send(pet.canvas,'pointerdown');assert.equal(pet.pointerHeld,true,'next pickup remains available');pet.cancelDrag();
    }
  } finally {global.window=savedWindow;global.document=savedDocument;}
});

test('chat gestures preserve folded floor legs and window leg motion through entry and exit blends',async()=>{
  for(const floor of [true,false]) for(const name of ['listen','think','talk']) {
    const {pet}=await fixture();
    if(floor) {pet.beginRest(true);finish(pet);}
    else pet.setStance('sit',{perch:{id:1,dx:100}});
    pet.motionBlend=null;pet.animate(performance.now());
    const anchor={...pet.pos};
    pet.perform(name,pet.towardCenter());
    const start=pet.act.player.start,duration=pet.act.player.total*1000/12;
    for(let elapsed=0;elapsed<duration+220;elapsed+=16) {
      const now=start+elapsed;
      pet.animate(now);
      const base=pet.base.resolve(pet.base.sample(now).pose,pet.facing);
      if(elapsed>160) for(const key of ['kickL','kickR'])
        assert.ok(Math.abs(pet.p[key]-base[key])<0.0001,`${name} preserves ${key} on ${floor?'floor':'window'} at ${elapsed}ms`);
      assert.equal(pet.p.sit,1);
      assert.deepEqual(pet.pos,anchor);
    }
  }
});
test('desktop sitting lowers into a distinct folded-leg loop, then stands without changing its floor anchor',async()=>{
  const {pet}=await fixture();const initial={...pet.pos};const head=pet.head().y;
  assert.equal(pet.beginRest(true),true);assert.equal(pet.act.player.name,'sitDown');
  pet.animate(pet.act.player.start);assert.equal(pet.p.sit,0);
  finish(pet);
  assert.equal(pet.groundRest.phase,'seated');assert.equal(pet.base.name,'floorSit');assert.equal(pet.p.sit,1);
  assert.ok(pet.p.kickL>=1.1);assert.ok(pet.head().y>head+50);
  assert.ok(pet.groundRest.until-performance.now()>=19000);
  assert.ok(pet.groundRest.until-performance.now()<=40000);
  assert.deepEqual(pet.pos,initial);
  assert.equal(pet.beginRest(false),true);assert.equal(pet.act.player.name,'standUp');finish(pet);
  assert.equal(pet.groundRest,null);assert.equal(pet.p.sit,0);assert.equal(pet.base.name,'stand');
  assert.ok(Math.abs(pet.head().y-head)<=4,'Only the original standing bob remains');assert.deepEqual(pet.pos,initial);
});
test('idle scheduler starts a break, gets up after its deadline, and leaves time before the next sit',async()=>{
  const {pet}=await fixture();pet.behave(performance.now());finish(pet);
  pet.behave(pet.groundRest.until+1);assert.equal(pet.act.player.name,'standUp');finish(pet);
  assert.ok(pet.nextSit>performance.now()+89000);
});

test('random idle wave greets once without immediate repeats or reactions while paused',async()=>{
  const random=Math.random;
  Math.random=()=>0.99;
  try {
    const {pet}=await fixture();let greetings=0;
    pet.nextSit=Infinity;pet.nextIdle=0;pet.onIdleWave=()=>greetings++;
    pet.behave(performance.now());assert.equal(pet.act.player.name,'idleWave');assert.equal(greetings,1);
    finish(pet);pet.nextIdle=0;pet.behave(performance.now());assert.notEqual(pet.act.player.name,'idleWave');
    assert.equal(greetings,1);
    for(const field of ['hidden','gaming','fullscreen','chatThinking','dragging','busy']) {
      const {pet:paused}=await fixture();paused.nextSit=Infinity;paused.nextIdle=0;paused[field]=true;
      paused.onIdleWave=()=>{throw Error('Paused pet greeted');};paused.behave(performance.now());assert.equal(paused.act,null);
    }
  } finally {Math.random=random;}
});

test('folded foot geometry stays on the desktop floor at every size',async()=>{
  const {pet}=await fixture();
  pet.restLegs=[{x:90,y:409,side:0},{x:174,y:418,side:1}];
  pet.groundRest={phase:'seated'};
  for(const scale of [0.45,0.6,0.8])for(const seat of [0,0.15,0.45,0.8,1]) {
    pet.scale=scale;pet.p.sit=seat;pet.p.kickL=pet.p.kickR=seat*1.1;
    const bottom=Math.max(...pet.restLegs.map(({x,y,side})=>232+73*(1-0.7*seat)+(y-305)*Math.cos(seat*1.1)+(x-(side?142:106))*Math.sin(seat*1.1)*(side?-1:1)));
    assert.ok(Math.abs(pet.pos.y-418*scale+pet.restOffset+bottom*scale-pet.floor)<0.001);
  }
});
test('hidden, game, fullscreen, busy, dragging and work activity cannot start an automatic sit',async()=>{
  for(const field of ['hidden','gaming','fullscreen','busy','dragging','chatThinking']) {
    const {pet}=await fixture();pet[field]=true;
    if(field!=='chatThinking')assert.equal(pet.beginRest(true),false);
    // Hidden pets do not run the render loop; verify the explicit controller too.
    pet.behave(performance.now());assert.equal(pet.groundRest,null,field);
  }
  const {pet}=await fixture();pet.mode='work';pet.behave(performance.now());assert.equal(pet.groundRest,null);
});
test('reduced motion takes a still seat immediately and stands immediately; picking up clears the rest',async()=>{
  const {pet}=await fixture();motion.matches=true;
  try {
    assert.equal(pet.beginRest(true),true);assert.equal(pet.groundRest.phase,'seated');assert.equal(pet.act,null);
    pet.animate(performance.now()+5000);const first={head:pet.p.head,kick:pet.p.kickL};
    pet.animate(performance.now()+10000);assert.deepEqual({head:pet.p.head,kick:pet.p.kickL},first);
    pet.beginRest(false);assert.equal(pet.groundRest,null);assert.equal(pet.p.sit,0);
  } finally {motion.matches=false;}
  pet.beginRest(true);finish(pet);pet.setStance('stand');assert.equal(pet.groundRest,null);assert.equal(pet.restOffset,0);
});
test('direct posture requests support English and Spanish and reject negation, examples and other targets',async()=>{
  const chat=await import(uri(source('chat.js').replace("import { welcomePicker } from './welcome.js';", "const welcomePicker=()=>()=>'Hey. What is on your mind?';").replace("import { pick, fmt } from './util.js';",'const pick=x=>x[0],fmt=x=>x;')));
  for(const text of ['sit','sit down','Capri, could you sit down please?','take a seat','siéntate','sentate un rato'])assert.equal(chat.postureRequest(text),true,text);
  for(const text of ['stand up','get up','please stand','Capri, levántate','ponete de pie'])assert.equal(chat.postureRequest(text),false,text);
  for(const text of ['do not sit down','can you sit? I am just asking','tell me how to sit','make Firefox sit down','what if I say sit down?'])assert.equal(chat.postureRequest(text),null,text);
  const {pet}=await fixture();assert.match(await pet.requestPosture(true),/seat/);finish(pet);
  assert.match(await pet.requestPosture(false),/feet/);finish(pet);assert.equal(pet.groundRest,null);
});

test('chat applies posture locally and releases busy state even when a move fails',async()=>{
  const {Chat}=await import(uri(source('chat.js').replace("import { welcomePicker } from './welcome.js';", "const welcomePicker=()=>()=>'Hey. What is on your mind?';").replace("import { pick, fmt } from './util.js';",'const pick=x=>x[0],fmt=x=>x;')));
  const poses=[],replies=[],busy=[];
  const chat=new Chat({capri:{requestPosture:async sit=>{poses.push(sit);return 'Taking a little seat.';}},
    panel:{setChatBusy:on=>busy.push(on),chatTurn(){},stream:text=>replies.push(text)},
    voice:{},brain:{lang:'en',t:{chat:{}}},host:{onChatDelta(){},personalRoute(){throw Error('Must not call the AI route');}}});
  chat.open=true;await chat.send('sit down');assert.deepEqual(poses,[true]);assert.equal(chat.turn,0);assert.deepEqual(busy,[true,false]);
  chat.capri.requestPosture=async()=>{throw Error('interrupted');};
  await chat.send('stand up');assert.equal(chat.turn,0);assert.match(replies.at(-1),/didn’t finish/);
});


test('bouncy original-art gestures keep seated bodies at unit scale and preserve the floor/window anchor',async()=>{
  for(const floor of [true,false])for(const name of ['idleWave','idleSway','idlePreen','idleStretch',
    'idleBounce','idleBreathe','idleListen','idleYawn','listen','think','talk']) {
    const {pet}=await fixture();
    if(floor){pet.beginRest(true);finish(pet);}else pet.setStance('sit',{perch:{id:1,dx:100}});
    pet.endAct(false);const anchor={...pet.pos};pet.perform(name);
    const start=pet.act.player.start,duration=pet.act.player.total*1000/12;
    for(let time=180;time<duration;time+=16) {
      pet.animate(start+time);
      assert.equal(pet.sx,1,`${name} seated width`);assert.equal(pet.sy,1,`${name} seated height`);
      assert.equal(pet.bob,0,`${name} stays planted`);
      assert.ok(Math.abs(pet.tilt)<=1.2,'Seated leaning remains restrained');
      assert.equal(pet.p.sit,1);assert.deepEqual(pet.pos,anchor);
    }
  }
});
