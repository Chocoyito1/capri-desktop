'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { SpeechInput } = require('../src/main/speech');
const tick = () => new Promise(resolve => setImmediate(resolve));
const uri = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function controller() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/voice-call.js'), 'utf8')
    .replace("import { MicrophoneCapture } from './microphone.js';", 'class MicrophoneCapture {}')
    .replace("import { speechDetector } from './speech-detector.js';", 'const speechDetector=()=>{};');
  global.window = global.document = { addEventListener() {} };
  const { VoiceCall } = await import(uri(source));
  const events = [], callbacks = {}, attributes = {};
  const indicator = { hidden: true, dataset: {}, style: {}, addEventListener() {}, setAttribute(k,v) { attributes[k]=v; }, getAttribute(k) { return attributes[k]; } };
  const history = { history: [], trimHistory() {} };
  const speaker = { stop() { events.push('stop-audio'); this.pending=null;this.source=null;this.response=null; },
    beginResponse() { events.push('begin-reply');this.response={}; }, updateResponse(text,done) { events.push({spoken:text,done}); } };
  const capture = { stream: {}, cancel() { events.push('cancel-mic'); }, start: async () => {} };
  const detector = { start: async () => {events.push('start-detector');}, pause: async () => {} };
  const host = { onSpeechState: fn => callbacks.speech=fn, onChatDelta: fn => callbacks.delta=fn,
    speechStart: async () => ({ok:true}), speechConversation: async () => ({ok:true}),
    speechCancel: ({id}) => events.push({cancel:id}), speechReset: ({id}) => events.push({reset:id}),
    speechAudio() {}, wakeEndSession() {events.push('end-session');}, chatStop: id=>events.push({stopTurn:id}),
    personalRoute: async () => ({handled:false}), chatSend: async () => ({ok:true,text:'I am here, sweetheart.'}) };
  const call = new VoiceCall({host,speaker,indicator,history,captureFactory:()=>capture,
    detectorFactory: async config => { callbacks.detector=config;return detector; }});
  return {call,host,speaker,capture,detector,events,callbacks,indicator,history};
}

test('wake voice uses the same mic, submits only complete addressed speech and never needs a panel', async () => {
  const f=await controller();
  try {
    await f.call.start({id:'voice-call-01',capture:f.capture,text:'Can you',complete:false});
    assert.equal(f.call.active,true);assert.equal(f.indicator.hidden,false);
    assert.equal(f.events.some(e=>e==='cancel-mic'),false);
    f.callbacks.speech({id:'voice-call-01',type:'final',text:'help me?',complete:true});await tick();await tick();
    assert.deepEqual(f.history.history.map(m=>m.content),['Can you help me?','I am here, sweetheart.']);
    assert(f.events.some(e=>e.spoken==='I am here, sweetheart.'&&e.done));
  } finally { f.call.end(); }
});

test('speech onset cuts audio, cancels generation and rejects stale deltas/results before the next turn', async () => {
  const f=await controller();let finish;
  f.host.chatSend=()=>new Promise(resolve=>{finish=resolve;});
  try {
    await f.call.start({id:'voice-call-02',capture:f.capture,text:'Hello',complete:true});await tick();
    const turn=f.call.turn;f.speaker.source={};
    f.callbacks.detector.onStart();
    assert.equal(f.speaker.source,null);assert.equal(f.call.turn,null);
    assert(f.events.some(e=>e.stopTurn===turn));assert(f.events.some(e=>e.reset==='voice-call-02'));
    const before=f.events.filter(e=>e.spoken).length;
    f.callbacks.delta({id:turn,text:'Stale words'});finish({ok:true,text:'Stale answer'});await tick();
    assert.equal(f.events.filter(e=>e.spoken).length,before);assert.deepEqual(f.history.history,[]);
    f.host.chatSend=async()=>({ok:true,text:'Listening to the new request.'});
    f.callbacks.speech({id:'voice-call-02',type:'final',text:'Actually, something else.',complete:true});await tick();await tick();
    assert.equal(f.history.history[0].content,'Actually, something else.');
  } finally {f.call.end();}
});

test('manual voice does not show listening before the microphone and recognizer are ready', async () => {
  const f=await controller();f.capture.stream=null;f.capture.start=async()=>{f.capture.stream={};};
  try {
    const starting=f.call.start();await tick();
    assert.equal(f.call.phase,'starting');assert.equal(f.capture.stream,null);
    f.callbacks.speech({id:f.call.id,type:'ready'});await starting;
    assert.equal(f.call.phase,'listening');assert(f.capture.stream);
    assert(f.events.includes('start-detector'));
  }finally{f.call.end();}
});

test('voice ignores echo transcripts until neural speech onset and can end by voice', async () => {
  const f=await controller();
  try {
    await f.call.start({id:'voice-call-03',capture:f.capture,text:'Hi',complete:true});await tick();await tick();
    const count=f.history.history.length;f.callbacks.speech({id:f.call.id,type:'final',text:'Echo of Capri',complete:true});await tick();
    assert.equal(f.history.history.length,count);
    f.callbacks.detector.onStart();f.callbacks.speech({id:f.call.id,type:'final',text:'Stop listening.',complete:true});
    assert.equal(f.call.active,false);assert.equal(f.indicator.hidden,true);
  } finally {f.call.end();}
});

test('a failed voice reply reports the problem by voice and keeps the session recoverable', async () => {
  const f=await controller();const errors=[];
  f.host.chatSend=async()=>({ok:false,error:'backend unavailable'});f.speaker.speak=async text=>errors.push(text);
  try {
    await f.call.start({id:'voice-error-05',capture:f.capture,text:'Hello',complete:true});await tick();await tick();
    assert.equal(f.call.active,true);assert.equal(errors.length,1);assert.match(errors[0],/try again/);
  }finally{f.call.end();}
});

test('continuous main speech survives 90 seconds and interruption discards old recognition', async () => {
  const events=[],jobs=[];
  const input=new SpeechInput({allowed:()=>true,wakeAllowed:()=>false,notify:e=>events.push(e),
    engine:{start:async()=>{},stop(){},transcribe:()=>new Promise(resolve=>jobs.push(resolve))}});
  try {
    input.start({id:'voice-session-04',mode:'conversation'});await tick();const slot=input.current;
    for(let i=0;i<100;i++)input.audio({id:slot.id,samples:Buffer.alloc(32000)});
    assert.equal(slot.total,0);assert.equal(slot.timeout,undefined);
    input.enqueue(slot,Buffer.alloc(4000));input.resetUtterance(slot.id);jobs[0]('Old echo transcript');await tick();
    assert.equal(events.some(e=>e.type==='final'),false);
    input.enqueue(slot,Buffer.alloc(4000));jobs[1]('New request');await tick();
    assert.equal(events.at(-1).text,'New request');
  } finally {input.cancel(true);}
});

test('typed chat remains silent even with spoken replies enabled', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/renderer/js/chat.js'),'utf8')
    .replace("import { pick, fmt } from './util.js';",'const pick=x=>x[0],fmt=x=>x;')
    .replace("import { welcomePicker } from './welcome.js';",'const welcomePicker=()=>()=>"Hi";');
  const {Chat}=await import(uri(source));let delta;
  const spoken={enabled:true,stop(){},beginResponse(){assert.fail('Text chat must not start speech');},updateResponse(){assert.fail('Text chat must not speak');},speak(){assert.fail('Text chat must not speak');}};
  const chat=new Chat({voice:{spoken,play(){}},capri:{pulse(){}},brain:{lang:'en',t:{chat:{}}},
    panel:{current:{chat:{mode:'text'}},setChatBusy(){},setActions(){},chatTurn(){},stream(){},setFace(){}},
    host:{onChatDelta:fn=>delta=fn,personalRoute:async()=>({handled:false}),chatSend:async({id})=>{delta({id,text:'Hello.'});return {ok:true,text:'Hello.'};}}});
  chat.open=true;chat.persona=()=>'';await chat.send('Hi');
});
