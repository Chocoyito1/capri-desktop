// Isolated real Electron/WebGL check. Never opens or restarts the live companion.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
const output = path.join(root,'.caprigpt-local','cel-check');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
const timeout=setTimeout(()=>{console.error('Cel check timed out');app.exit(1)},30000);
app.whenReady().then(async()=>{
  try {
    const url=f=>pathToFileURL(path.join(root,f)).href;
    const page=path.join(output,'preview.html');
    fs.writeFileSync(page,`<!doctype html><body style="margin:0;background:#211c2b"><main></main><script type="module">
      import {Capri} from '${url('src/renderer/js/capri.js')}';
      try {
        window.requestAnimationFrame=()=>0;
        const root=document.createElement('div'),canvas=document.createElement('canvas');root.append(canvas);document.body.append(root);
        const image=new Image();image.src='${url('assets/capri/capri-full.png')}';await image.decode();
        const originalRoot=document.createElement('div'),originalCanvas=document.createElement('canvas');
        originalRoot.append(originalCanvas);
        const original=new Capri({root:originalRoot,canvas:originalCanvas,image,fx:{},voice:{play(){}}});
        if(await original.sprite.framesReady || original.sprite.cels)throw Error('Default must not load candidate art');
        original.drawFrame();
        if(original.celFrame)throw Error('Default must preserve original artwork');
        const originalGL=original.sprite.gl,originalProgram=originalGL.getParameter(originalGL.CURRENT_PROGRAM);
        if(originalGL.getUniform(originalProgram,originalGL.getUniformLocation(originalProgram,'uFrameMode'))!==0)
          throw Error('Default must use original renderer');
        originalGL.getExtension('WEBGL_lose_context')?.loseContext();
        const pet=new Capri({root,canvas,image,fx:{},voice:{play(){}},previewCelArt:true});window.pet=pet;
        const check=(v,m)=>{if(!v)throw Error(m)};
        check(await pet.sprite.framesReady,'assets load');
        pet.setScale(.9);pet.pos={x:300,y:450};pet.drawFrame();check(pet.celFrame.index===0,'standing cel');
        check(pet.sprite.cels.atlas.frames.length===20,'20 packed complete drawings');
        const idleStart=pet.sprite.celPlayback.startedAt;
        const period=pet.sprite.cels.atlas.clips.rest.durationMs;
        const idleSeen=new Set();
        for(let t=0;t<period;t+=20) {
          pet.drawFrame(idleStart+t);idleSeen.add(pet.celFrame.index);
          check(pet.bob===0&&pet.tilt===0&&pet.sx===1&&pet.sy===1,'idle uses drawings rather than deformations');
        }
        check(idleSeen.size===13,'all 12 breathing/blinking drawings and shared neutral play');
        pet.drawFrame(idleStart+period);check(pet.celFrame.index===0,'shared loop seam');
        pet.companion={options:{idleAnimations:false}};
        pet.drawFrame(idleStart+period+2000);check(pet.celFrame.index===0,'idle preference holds neutral');
        pet.companion.options.idleAnimations=true;
        pet.drawFrame(idleStart+period+2100);check(pet.celFrame.index===0,'reenabling idle starts neutral');
        pet.drawFrame(idleStart+period+3600);check(pet.celFrame.index!==0,'idle resumes');
        pet.companion=null;
        const gl=pet.sprite.gl,program=gl.getParameter(gl.CURRENT_PROGRAM);
        check(gl.getUniform(program,gl.getUniformLocation(program,'uFrameMode'))===1,'GPU cel path');
        pet.perform('idlePreen');const start=pet.act.player.start;
        const duration=pet.act.player.total*1000/12;
        const seen=new Set();
        for(let i=0;i<90;i++) {
          pet.drawFrame(start+i/90*duration);seen.add(pet.celFrame.index);
          check(pet.bob===0&&pet.tilt===0&&pet.sx===1&&pet.sy===1,'no rig deformation');
          check(gl.getError()===gl.NO_ERROR,'WebGL errors');
        }
        check(seen.size===8,'all full drawings play');
        pet.drawFrame(start+duration+1);check(!pet.act&&pet.celFrame.index===0,'settles to rest');
        // Actual alpha of the rendered cel must control click-through in both directions.
        const frame=pet.celFrame;
        for(const facing of [-1,1]) {
          pet.facing=facing;
          for(const [x,y] of [[0,0],[128,415],[120,210],[230,50]]) {
            check(pet.hit(pet.pos.x+(x-128)*pet.scale*facing,pet.pos.y+(y-418)*pet.scale)===pet.sprite.hitFrame(frame,x,y),'cel hit test');
          }
        }
        pet.perform('think');pet.drawFrame(pet.act.player.start+500);check(pet.celFrame,'thinking reuses curious');
        pet.busy=true;pet.drawFrame();check(!pet.celFrame,'intro and travel keep original');pet.busy=false;
        pet.endAct(false);pet.setStance('sit',{perch:{id:1,dx:100}});pet.drawFrame();check(!pet.celFrame,'ledge fallback');
        check(gl.getUniform(program,gl.getUniformLocation(program,'uFrameMode'))===0,'GPU rig restored');
        pet.setStance('stand');pet.perform('idlePreen');pet.drawFrame(pet.act.player.start+850);
        // Snapshots from the actual GPU path at native desktop scale, both backdrops.
        pet.endAct(false);pet.sprite.celPlayback.reset();pet.drawFrame(20000);
        const gallery=document.querySelector('main');gallery.style.cssText='display:flex;flex-wrap:wrap;gap:4px';
        for(const color of ['#211c2b','#eeeeed']) {
          for(const [label,time] of [['neutral',0],['inhale',1740],['blink',2220],['settle',3000]]) {
            pet.setScale(.6);pet.drawFrame(20000+time);
            const cell=document.createElement('figure');cell.style.cssText='margin:0;background:'+color+';color:#888';
            const caption=document.createElement('figcaption');caption.textContent=label;
            const snapshot=new Image();snapshot.src=canvas.toDataURL();await snapshot.decode();
            snapshot.style.width=canvas.style.width;snapshot.style.height=canvas.style.height;
            cell.append(caption,snapshot);gallery.append(cell);
          }
        }
        root.remove();
        pet.perform('idlePreen');pet.drawFrame(pet.act.player.start+850);
        window.result={ok:true,seen:seen.size};
      } catch(e) {window.result={error:e.stack}}
    </script>`);
    const win=new BrowserWindow({show:false,width:920,height:780,webPreferences:{backgroundThrottling:false,offscreen:true}});
    await win.loadFile(page);let result;
    for(let i=0;i<200;i++){result=await win.webContents.executeJavaScript('window.result');if(result)break;await new Promise(r=>setTimeout(r,50))}
    if(!result?.ok)throw Error(result?.error||'No result');
    win.webContents.invalidate();
    await win.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,150))');
    fs.writeFileSync(path.join(output,'breathing-gallery.png'),(await win.webContents.capturePage()).toPNG());
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{
      features:[{name:'prefers-reduced-motion',value:'reduce'}]
    });
    const held=await win.webContents.executeJavaScript(`(async()=>{
      await new Promise(r=>setTimeout(r,60));
      pet.drawFrame(pet.act.player.start+900);
      const first=pet.celFrame.index;
      pet.drawFrame(pet.act.player.start+1200);
      return matchMedia('(prefers-reduced-motion: reduce)').matches&&first===0&&pet.celFrame.index===0;
    })()`);
    if(!held)throw Error('Reduced motion did not hold a complete drawing');
    win.webContents.debugger.detach();
    console.log('PASS: original artwork default, preview-only candidate art, 20 GPU drawings, breathing/blinking loop, neutral seam and return, idle preference, alpha hit tests, reduced-motion hold, original rig fallback');
    clearTimeout(timeout);app.exit(0);
  }catch(e){console.error(e);clearTimeout(timeout);app.exit(1)}
});
