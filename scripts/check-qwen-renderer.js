'use strict';
// Isolated, silent native playback check. Does not modify or restart live Capri.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SpeechOutput } = require('../src/main/tts');
const root = path.resolve(__dirname, '..');
const setupFile = process.env.CAPRI_VOICE_SETUP || path.join(root, '.caprigpt-local/voice-setup.json');
const cfg = { ...JSON.parse(fs.readFileSync(setupFile, 'utf8')), ttsEnabled: true, ttsEngine: 'qwen' };
const scratch = path.join(root, '.caprigpt-local/qwen-renderer-check'); fs.mkdirSync(scratch, { recursive: true });
app.setPath('userData', path.join(scratch, 'profile'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'src/preload.js'), autoplayPolicy: 'no-user-gesture-required' } });
  const output = new SpeechOutput({ root, config: () => cfg, allowed: () => true,
    notify: event => { if (!window.isDestroyed()) window.webContents.send('tts:state', event); } });
  const timeout = setTimeout(() => { output.close(); app.exit(1); }, 150000);
  ipcMain.handle('tts:speak', (event, request) => event.sender === window.webContents ? output.speak(request) : { ok: false });
  ipcMain.on('tts:cancel', event => { if (event.sender === window.webContents) output.cancel(false); });
  try {
    fs.writeFileSync(path.join(scratch, 'check.html'), '<!doctype html><title>Capri voice check</title>');
    await window.loadFile(path.join(scratch, 'check.html'));
    await output.qwen.ensure(cfg);
    const moduleUrl = pathToFileURL(path.join(root, 'src/renderer/js/speech-output.js')).href;
    const result = await window.webContents.executeJavaScript(`(async () => {
      const {SpeechPlayer}=await import(${JSON.stringify(moduleUrl)});
      const ctx=new AudioContext(),master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
      let levels=0;const errors=[];
      const player=new SpeechPlayer({host:window.host,voice:{ensure:()=>ctx,master},onLevel:l=>{if(l>0.001)levels++},onError:e=>errors.push(e)});
      player.configure({ttsEnabled:true,ttsEngine:'qwen'});
      await player.speak("Easy, sweetheart. We can take this one step at a time. I am right here.");
      const scheduled=player.sources.size,queuedSeconds=player.nextTime-ctx.currentTime;
      player.stop();const cleared=player.sources.size===0;
      const late=player.speak('This request must be cancelled before playback starts.');
      player.stop();await late;
      const stale=player.sources.size;await ctx.close();
      return {levels,scheduled,queuedSeconds,cleared,stale,errors};
    })()`);
    if (!result.levels || !result.scheduled || !result.cleared || result.stale || result.errors.length) throw Error(JSON.stringify(result));
    fs.writeFileSync(path.join(scratch, 'result.json'), JSON.stringify(result, null, 2));
    console.log('PASS real Qwen PCM streaming, Electron audio clock, amplitude, queue and interruption:', JSON.stringify(result));
  } finally { clearTimeout(timeout); output.close(); window.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
