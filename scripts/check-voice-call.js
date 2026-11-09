'use strict';
// Offline native renderer/VAD check using synthesized audio, never the user's mic.
const {app,BrowserWindow,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'.caprigpt-local/voice-call-check');
fs.mkdirSync(scratch,{recursive:true});app.setPath('userData',path.join(scratch,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'capri',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const sourceFile=process.env.CAPRI_VOICE_TEST_WAV;
if(!sourceFile)throw Error('Set CAPRI_VOICE_TEST_WAV to an authorized local speech sample.');
app.whenReady().then(async()=>{
  protocol.handle('capri',request=>{
    const target=path.resolve(root,'.'+new URL(request.url).pathname);
    if(!target.startsWith(root+path.sep))return new Response('forbidden',{status:403});
    return net.fetch(pathToFileURL(target).href);
  });
  const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
  const mic=html.match(/<button id="voice-indicator"[\s\S]*?<\/button>/)[0];
  fs.writeFileSync(path.join(scratch,'check.html'),`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self' 'wasm-unsafe-eval';style-src 'self';connect-src 'self' capri:;worker-src 'self';img-src 'self';media-src 'self' blob:"><link rel="stylesheet" href="capri://app/src/renderer/styles/capri.css"><body class="voice-session">${mic}<section class="panel">Hidden chat content must not be visible.</section>`);
  const win=new BrowserWindow({show:false,width:600,height:450,webPreferences:{autoplayPolicy:'no-user-gesture-required',backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level>=2)console.error(event.message);});
  const limit=setTimeout(()=>{console.error('Voice call check timed out');app.exit(1);},60000);
  try{
    await win.loadURL('capri://app/.caprigpt-local/voice-call-check/check.html');
    const sample=fs.readFileSync(sourceFile).toString('base64');
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const {VoiceCall}=await import('capri://app/src/renderer/js/voice-call.js');
      const ctx=new AudioContext({sampleRate:16000});await ctx.resume();
      const destination=ctx.createMediaStreamDestination();
      const speech=await ctx.decodeAudioData(Uint8Array.from(atob(${JSON.stringify(sample)}),c=>c.charCodeAt(0)).buffer);
      const events=[];let resetAt=null,started,positiveAt=null,firstFrame=null,frames=0;
      const speaker={stop(){this.source=null;this.pending=null;this.response=null;},beginResponse(){},updateResponse(){}};
      const host={onSpeechState(){},onChatDelta(){},speechConversation:async()=>({ok:true}),speechReset(){resetAt??=performance.now();events.push('interrupt');},speechCancel(){},wakeEndSession(){},chatStop(){}};
      const capture={stream:destination.stream,cancel(){}};
      const indicator=document.getElementById('voice-indicator');
      const call=new VoiceCall({host,speaker,indicator});
      await call.start({id:'native-voice-call',capture,text:'',complete:true});
      if(!call.active)throw Error('Voice call failed to initialize');
      call.detector.options.onFrameProcessed=(probabilities)=>{frames++;firstFrame??=performance.now();if(probabilities.isSpeech>.5)positiveAt??=performance.now();};
      // A real reply begins after listening/recognition; prime the first inference
      // before measuring interruption of that reply.
      for(let i=0;i<150&&frames<5;i++)await new Promise(r=>setTimeout(r,20));
      frames=0;firstFrame=null;positiveAt=null;
      call.place({x:300,y:230},{w:600,h:450});
      const rect=indicator.getBoundingClientRect(),panelVisible=getComputedStyle(document.querySelector('.panel')).visibility;
      speaker.source={};
      const buffer=ctx.createBuffer(1,16000+speech.length,16000),data=buffer.getChannelData(0);
      for(let i=8000;i<8160;i++)data[i]=Math.random()-.5;
      data.set(speech.getChannelData(0),16000);
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(destination);
      started=performance.now();source.start();
      for(let i=0;i<180&&resetAt===null;i++)await new Promise(r=>setTimeout(r,25));
      const delay=resetAt===null?null:resetAt-started;
      const result={active:call.active,icon:{width:rect.width,height:rect.height,left:rect.left,top:rect.top},panelVisible,
        speechDetected:resetAt!==null,interruptionMs:delay,firstFrameMs:firstFrame-started,firstPositiveMs:positiveAt-started,frames,ignoredClick:delay===null?false:delay>900,stoppedAudio:speaker.source===null};
      source.stop();call.end();destination.stream.getTracks().forEach(t=>t.stop());await ctx.close();
      return result;
    })()`);
    if(!result.active||!result.speechDetected||!result.ignoredClick||!result.stoppedAudio||result.panelVisible!=='hidden'||result.icon.width>32)throw Error(JSON.stringify(result));
    fs.writeFileSync(path.join(scratch,'result.json'),JSON.stringify(result,null,2));
    console.log('PASS native local Silero speech detection, click rejection, voice interruption, compact icon and hidden panel:',JSON.stringify(result));
  }finally{clearTimeout(limit);win.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
