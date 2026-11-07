'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {SpeechInput}=require('../src/main/speech');
const {SpeechSegmenter}=require('../src/main/speech-segmenter');
const {wave}=require('../src/main/whisper-engine');
const fs=require('node:fs'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tone=(count=1600,amplitude=5000)=>{const b=Buffer.alloc(count*2);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(i*.1)*amplitude),i*2);return b;};
function fixture(deferStart=false){
  const events=[],jobs=[];let allowed=true,starts=0,stops=0,ready;
  const engine={device:'GPU',start:()=>{starts++;return deferStart?new Promise(resolve=>{ready=resolve;}):Promise.resolve();},
    stop:()=>{stops++;},transcribe:(pcm,signal)=>new Promise((resolve,reject)=>jobs.push({pcm,signal,resolve,reject}))};
  const speech=new SpeechInput({allowed:()=>allowed,notify:event=>events.push(event),engine});
  return {speech,events,jobs,ready:()=>ready(),pause:()=>{allowed=false;},counts:()=>({starts,stops}),
    audio:(id='session-001',pcm=tone())=>speech.audio({id,samples:pcm})};
}

test('Whisper starts only after a valid user request and prevents duplicate sessions',async()=>{
  const f=fixture();
  try{
    assert.deepEqual(f.counts(),{starts:0,stops:0});
    assert.equal(f.speech.start(null).ok,false);assert.equal(f.speech.start({id:'x;bad'}).ok,false);
    assert.equal(f.speech.start({id:'session-001'}).ok,true);await tick();
    assert.equal(f.events[0].engine,'Whisper large-v3-turbo');assert.equal(f.events[0].language,'auto');
    assert.equal(f.speech.start({id:'session-002'}).error,'speech-busy');
  }finally{f.speech.cancel();}
});

test('cancelling model startup cannot activate an old session after a new one starts',async()=>{
  const f=fixture(true);
  try{
    f.speech.start({id:'session-001'});const oldReady=f.ready;f.speech.stop('session-001');
    assert.equal(f.speech.current,null);oldReady();await tick();
    assert.equal(f.events.some(event=>event.type==='ready'),false);
    f.speech.start({id:'session-002'});f.ready();await tick();
    f.audio('session-001');assert.equal(f.speech.current.total,0);
    f.pause();f.audio('session-002');assert.equal(f.speech.current,null);
    assert.equal(f.speech.start({id:'session-003'}).error,'speech-paused');
  }finally{f.speech.cancel();}
});

test('stop flushes the last complete phrase before unlocking the draft; stale results are discarded',async()=>{
  const f=fixture();
  try{
    f.speech.start({id:'session-001'});await tick();f.audio();f.audio();f.audio();
    f.speech.stop('wrong-session');assert.equal(f.speech.current.phase,'listening');
    f.speech.stop('session-001');assert.equal(f.jobs.length,1);assert.equal(f.speech.current.phase,'stopping');
    f.jobs[0].resolve('Final spoken words');await tick();
    assert.equal(f.events.at(-2).text,'Final spoken words');assert.equal(f.events.at(-1).type,'stopped');
    f.speech.start({id:'session-002'});await tick();f.audio('session-002');f.audio('session-002');f.speech.stop('session-002');
    const job=f.jobs[1];f.speech.cancel();assert.equal(job.signal.aborted,true);job.resolve('late words');await tick();
    assert.equal(f.events.some(event=>event.text==='late words'),false);
  }finally{f.speech.cancel();}
});

test('silence is not sent to Whisper; speech boundaries and WAV format are bounded',()=>{
  const chunks=[],segmenter=new SpeechSegmenter(pcm=>chunks.push(pcm));
  for(let i=0;i<100;i++)segmenter.add(Buffer.alloc(3200));assert.equal(chunks.length,0);
  for(let i=0;i<4;i++)segmenter.add(tone());for(let i=0;i<8;i++)segmenter.add(Buffer.alloc(3200));
  assert.equal(chunks.length,1);assert.ok(chunks[0].length<16000*2*3);
  const encoded=wave(chunks[0]);assert.equal(encoded.toString('ascii',0,4),'RIFF');
  assert.equal(encoded.readUInt32LE(24),16000);assert.equal(encoded.readUInt16LE(22),1);
  assert.equal(encoded.readUInt16LE(34),16);assert.equal(encoded.readUInt32LE(40),chunks[0].length);
});

async function rendererFixture(){
  const source=fs.readFileSync(path.join(__dirname,'../src/renderer/js/dictation.js'),'utf8')
    .replace("import { MicrophoneCapture } from './microphone.js';",'class MicrophoneCapture {async start(){} async stop(){} async cancel(){}}');
  const {Dictation}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const element=()=>({disabled:false,hidden:true,style:{setProperty(){}},classList:{toggle(){}},setAttribute(){},addEventListener(){}});
  const button=element(),status=element(),input={...element(),value:'Please',selectionStart:6,selectionEnd:6,maxLength:500,
    focus(){},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
  const panel={chatInput:input,chatSend:element(),current:{chat:true},el:{querySelector:q=>q==='.panel__mic'?button:status}};
  global.window={addEventListener(){}};global.document={addEventListener(){},hidden:false};
  const calls=[];let receive;
  const host={onSpeechState:fn=>{receive=fn;},speechStart:async request=>{calls.push(['start',request]);return {ok:true};},speechAudio(){},
    speechStop:async request=>{calls.push(['stop',request]);return {ok:true};},speechCancel:request=>calls.push(['cancel',request])};
  const dictation=new Dictation({panel,host});
  return {dictation,panel,input,status,calls,send:row=>receive({id:dictation.id,...row})};
}

test('wake handoff preserves the stream, strips the address upstream and submits once after speech finishes',async()=>{
  const f=await rendererFixture();let sent=0;
  f.input.value='';f.input.selectionStart=f.input.selectionEnd=0;
  f.panel.chatForm={requestSubmit(){sent++;}};
  const capture={async stop(){},cancel(){}};
  f.dictation.adoptWake({id:'wake-handoff-01',capture,text:'Open Firefox',complete:true});
  assert.equal(f.dictation.capture,capture);assert.equal(f.input.value,'Open Firefox');
  assert.equal(sent,0,'Wait for pending audio to flush before sending');
  await tick();assert.equal(f.calls.at(-1)[0],'stop');
  f.send({type:'stopped'});assert.equal(sent,1);assert.equal(f.dictation.id,null);
  f.send({id:'wake-handoff-01',type:'stopped'});assert.equal(sent,1);
});

test('wake cancellation never submits a partial request and existing drafts require review',async()=>{
  const f=await rendererFixture();let sent=0;
  f.panel.chatForm={requestSubmit(){sent++;}};
  const capture={async stop(){},cancel(){}};
  f.dictation.adoptWake({id:'wake-handoff-02',capture,text:'Open Firefox',complete:true});
  await tick();f.send({type:'stopped'});
  assert.equal(sent,0,'Do not automatically send a command appended to an existing draft');
  assert.match(f.input.value,/Please Open Firefox/);
  f.input.value='';f.input.selectionStart=f.input.selectionEnd=0;
  f.dictation.adoptWake({id:'wake-handoff-03',capture,text:'Delete this',complete:false});
  f.send({type:'stopped',cancelled:true});assert.equal(sent,0);
});

test('switching a wake request to typing preserves its transcript for review without auto-send',async()=>{
  const f=await rendererFixture();let sent=0;
  f.input.value='';f.input.selectionStart=f.input.selectionEnd=0;
  f.panel.chatForm={requestSubmit(){sent++;}};
  f.dictation.adoptWake({id:'wake-to-typing-01',capture:{async stop(){},cancel(){}},text:'Help me plan tomorrow',complete:false});
  f.panel.onTyping();await tick();f.send({type:'stopped'});
  assert.equal(sent,0);assert.equal(f.input.value,'Help me plan tomorrow');assert.equal(f.input.readOnly,false);
});

test('Whisper phrase results preserve the draft and never auto-send; late session results cannot overwrite it',async()=>{
  const f=await rendererFixture();await f.dictation.toggle();const id=f.dictation.id;
  assert.equal(f.input.readOnly,true);assert.equal(f.panel.chatSend.disabled,true);
  f.send({type:'ready',language:'auto'});await tick();f.send({type:'final',text:'open Firefox'});
  assert.equal(f.input.value,'Please open Firefox');
  await f.dictation.stop();f.send({type:'final',text:'now'});f.send({type:'stopped'});
  assert.equal(f.input.value,'Please open Firefox now');assert.equal(f.input.readOnly,false);
  assert.equal(f.panel.chatSend.disabled,false);assert.equal(f.calls.some(([name])=>name==='send'),false);
  await f.dictation.toggle();f.send({id,type:'final',text:'old words'});assert.equal(f.input.value,'Please open Firefox now');f.dictation.cancel();
});

test('closing a panel cancels capture; device errors unlock input; full drafts stay bounded',async()=>{
  const f=await rendererFixture();await f.dictation.toggle();f.panel.onSpeechCancel();
  assert.equal(f.dictation.id,null);assert.equal(f.calls.at(-1)[0],'cancel');
  await f.dictation.toggle();f.send({type:'error',text:'microphone-unavailable'});f.send({type:'stopped'});
  assert.match(f.status.textContent,/Microphone unavailable/);assert.equal(f.input.readOnly,false);
  f.input.value='a'.repeat(499);f.input.selectionStart=f.input.selectionEnd=499;
  await f.dictation.toggle();f.send({type:'final',text:'many extra words'});assert.ok(f.input.value.length<=500);f.dictation.cancel();
});
