// Isolated native audio-clock/visual check; output is silenced after analysis.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.caprigpt-local/speech-aura-check');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const timeout = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 520,
    webPreferences: { offscreen: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
  try {
    const url = name => pathToFileURL(path.join(root, name)).href;
    const page = path.join(output, 'preview.html');
    fs.writeFileSync(page, `<!doctype html><link rel="stylesheet" href="${url('src/renderer/styles/capri.css')}">
      <body style="background:#211c2b"><div class="capri"><canvas class="capri__sprite"></canvas></div>
      <script type="module">
      import { Capri } from '${url('src/renderer/js/capri.js')}';
      import { SpeechPlayer } from '${url('src/renderer/js/speech-output.js')}';
      const image = new Image(); image.src='${url('assets/capri/capri-full.png')}'; await image.decode();
      const canvas=document.querySelector('canvas');
      const pet=new Capri({root:canvas.parentElement,canvas,image,fx:{},voice:{play(){}}});
      pet.pos={x:300,y:450};pet.setScale(.85);pet.behave=()=>{};
      const ctx=new AudioContext(), master=ctx.createGain(), silent=ctx.createGain();
      silent.gain.value=0;master.connect(silent).connect(ctx.destination);
      const levels=[];
      const player=new SpeechPlayer({host:{},voice:{ensure:()=>ctx,master},onLevel:level=>{pet.speechLevel=level;levels.push(level)}});
      player.configure({ttsEnabled:true}); await ctx.resume();
      const tone=ctx.createBuffer(1,ctx.sampleRate*.6,ctx.sampleRate);
      const samples=tone.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i*2*Math.PI*220/ctx.sampleRate)*.1;
      window.fixture={pet,player,ctx,master,levels,tone,canvas};window.ready=true;
      </script>`);
    await win.loadFile(page);
    for (let i=0;i<100;i++) {
      if(await win.webContents.executeJavaScript('Boolean(window.ready)')) break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const {pet,player,ctx,master,levels,tone,canvas}=fixture;
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const check=(v,m)=>{if(!v)throw Error(m)};
      check(!canvas.classList.contains('has-speech-aura'),'idle stays clear');
      player.schedule(ctx,tone);
      await wait(350);
      check(levels.some(l=>l>.01),'actual audio amplitude');
      check(canvas.classList.contains('has-speech-aura'),'voice activates aura');
      check(getComputedStyle(canvas).filter.includes('drop-shadow'),'CSS filter parses');
      window.activeAmount=pet.speechAura.amount;
      return {activeAmount:window.activeAmount,filter:getComputedStyle(canvas).filter};
    })()`);
    fs.writeFileSync(path.join(output,'speaking.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      const {pet,player,ctx,master,tone,canvas}=fixture;
      const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(v,m)=>{if(!v)throw Error(m)};
      await wait(1100);check(!canvas.classList.contains('has-speech-aura'),'natural end fades fully');
      master.gain.value=0;player.schedule(ctx,tone);await wait(300);
      check(!canvas.classList.contains('has-speech-aura'),'zero volume stays clear');
      player.stop();master.gain.value=1;player.schedule(ctx,tone);await wait(250);
      check(pet.speechAura.amount>.3,'second voice activates');player.stop();
      await wait(900);check(!canvas.classList.contains('has-speech-aura'),'interruption fades fully');await ctx.close();
    })()`);
    fs.writeFileSync(path.join(output,'silent.png'), (await win.webContents.capturePage()).toPNG());
    console.log('PASS native speech amplitude, aura rendering, natural end, zero volume and interruption', JSON.stringify(result));
  } finally { clearTimeout(timeout); win.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
