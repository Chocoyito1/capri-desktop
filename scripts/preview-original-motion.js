// Render original-art motion before/after without touching the live companion.
// Uses HEAD as the before baseline. Output stays in ignored local diagnostics.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.caprigpt-local','charming-motion');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
const before=path.join(output,'before.mjs');
fs.writeFileSync(before,execFileSync('git',['show','HEAD:src/renderer/js/acting.js'],{cwd:root}));
const timeout=setTimeout(()=>{console.error('Motion preview timed out');app.exit(1)},45000);
app.whenReady().then(async()=>{
  try {
    const url=file=>pathToFileURL(path.join(root,file)).href;
    const html=path.join(output,'preview.html');
    fs.writeFileSync(html,`<!doctype html><body><script type="module">
      import {Capri} from '${url('src/renderer/js/capri.js')}';
      import {Player} from '${url('src/renderer/js/acting.js')}';
      import {Player as BeforePlayer} from '${pathToFileURL(before).href}';
      try {
        window.requestAnimationFrame=()=>0;
        const image=new Image();image.src='${url('assets/capri/capri-full.png')}';await image.decode();
        const actors=[BeforePlayer,Player].map((P,i)=>{
          const root=document.createElement('div'),canvas=document.createElement('canvas');root.append(canvas);
          const pet=new Capri({root,canvas,image,fx:{},voice:{play(){}}});
          pet.setScale(.6);pet.pos={x:150+i*300,y:332};pet.base=new P('stand',{at:0});pet.debug={seed:7};
          return {pet,P};
        });
        const output=document.createElement('canvas');output.width=600;output.height=360;
        const ctx=output.getContext('2d');
        window.begin=name=>{
          for(const {pet,P} of actors) {
            pet.motionBlend=null;pet.base=new P('stand',{at:0});
            pet.act=name==='stand'?null:{player:new P(name,{at:0}),done(){}};
          }
          return Math.max(...actors.map(({P})=>{const p=new P(name,{at:0});return p.total*1000/(p.act.fps||12)}));
        };
        window.render=async time=>{
          ctx.fillStyle='#211c2b';ctx.fillRect(0,0,600,360);
          ctx.fillStyle='#bbb0ca';ctx.font='14px sans-serif';ctx.fillText('Before',124,23);ctx.fillText('Now',435,23);
          ctx.strokeStyle='#403548';ctx.beginPath();ctx.moveTo(300,10);ctx.lineTo(300,350);ctx.stroke();
          for(const {pet} of actors) {
            const p=pet.act?.player;
            if(p && time>=p.total*1000/(p.act.fps||12)){pet.act=null;pet.motionBlend=null;}
            pet.drawFrame(time);
            if(pet.celFrame)throw Error('Preview must use original artwork');
            const bitmap=new Image();bitmap.src=pet.canvas.toDataURL();await bitmap.decode();
            const scale=pet.scale,px=(56+128)*scale,py=(56+418)*scale;
            ctx.save();ctx.translate(pet.pos.x,pet.pos.y+pet.bob);
            ctx.rotate(pet.tilt*Math.PI/180);ctx.scale(pet.facing*pet.sx,pet.sy);
            ctx.drawImage(bitmap,-px,-py,parseFloat(pet.canvas.style.width),parseFloat(pet.canvas.style.height));ctx.restore();
            if(pet.sprite.gl.getError()!==pet.sprite.gl.NO_ERROR)throw Error('WebGL error');
          }
          return output.toDataURL('image/png').split(',')[1];
        };
        window.ready=true;
      }catch(e){window.failure=e.stack}
    </script>`);
    const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
    await win.loadFile(html);
    let ready=false;
    for(let i=0;i<100;i++){
      const result=await win.webContents.executeJavaScript('({ready:window.ready,failure:window.failure})');
      if(result.failure)throw Error(result.failure);
      if(result.ready){ready=true;break;}await new Promise(r=>setTimeout(r,50));
    }
    if(!ready)throw Error('No renderer');
    for(const name of ['stand','idleWave','idleBounce']) {
      const dir=path.join(output,name);fs.mkdirSync(dir,{recursive:true});
      const duration=await win.webContents.executeJavaScript('window.begin('+JSON.stringify(name)+')');
      let count=0;
      for(let time=0;time<duration;time+=40) {
        const png=await win.webContents.executeJavaScript('window.render('+time+')');
        fs.writeFileSync(path.join(dir,String(count++).padStart(3,'0')+'.png'),Buffer.from(png,'base64'));
      }
      fs.writeFileSync(path.join(dir,'sequence.json'),JSON.stringify({count,frameMs:40}));
      console.log(name+': '+count+' actual WebGL frames');
    }
    clearTimeout(timeout);app.exit(0);
  }catch(e){console.error(e);clearTimeout(timeout);app.exit(1)}
});
