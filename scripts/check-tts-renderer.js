'use strict';
// Runs a separate hidden Electron window; does not restart the companion.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,webPreferences:{autoplayPolicy:'no-user-gesture-required'}});
  try {
    const {SpeechOutput} = require('../src/main/tts');
    const engine = new SpeechOutput({root:path.join(__dirname,'..'),config:()=>({ttsEnabled:true,ttsEngine:'windows'}),allowed:()=>true});
    const generated = await engine.speak({text:'Hey, I am Capri. The local voice pipeline is ready.'});
    if (!generated.ok) throw Error(generated.error);
    const output = path.join(__dirname,'../.caprigpt-local/tts-check');
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'windows.wav'),Buffer.from(generated.audio,'base64'));
    await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));
    const source = fs.readFileSync(path.join(__dirname,'../src/renderer/js/speech-output.js'),'utf8').replace('export class SpeechPlayer','class SpeechPlayer');
    const audio = fs.readFileSync(path.join(__dirname,'../.caprigpt-local/tts-check/windows.wav')).toString('base64');
    const result = await win.webContents.executeJavaScript(`(async()=>{
      ${source}
      let started=0,levels=0,stopped=0;
      const ctx=new AudioContext(),master=ctx.createGain();master.connect(ctx.destination);master.gain.value=0;
      const player=new SpeechPlayer({host:{ttsCancel(){stopped++;},ttsSpeak:async()=>({ok:true,audio:${JSON.stringify(audio)}})},
        voice:{ensure:()=>ctx,master},onLevel:l=>{if(l>0.001)levels++;},onError:e=>{throw Error(e);}});
      player.configure({ttsEnabled:true});await player.speak('test');started=Boolean(player.source);
      await new Promise(r=>setTimeout(r,600));player.stop();await ctx.close();
      return {started,levels,stopped,sourceCleared:player.source===null};
    })()`);
    if(!result.started || !result.levels || !result.sourceCleared)throw Error(JSON.stringify(result));
    console.log('PASS real Electron WAV decode, playback clock, amplitude hook and interruption:',JSON.stringify(result));
  } finally {win.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
