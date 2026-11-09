'use strict';
// Isolated visual/animation check. Does not start Capri, models or PC observation.
const {app,BrowserWindow} = require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.caprigpt-local','portrait-check');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const url=file=>pathToFileURL(path.join(root,file)).href;
const deadline=setTimeout(()=>{console.error('Portrait check timed out');app.exit(1);},20000);
app.whenReady().then(async()=>{
  try {
    fs.writeFileSync(path.join(out,'preview.css'),`body{background:#241c30;overflow:auto;padding:24px;box-sizing:border-box}
      #capri,#fx,#chip,#mask{display:none}.panel{position:relative!important;transform:none!important;left:auto!important;top:auto!important;margin:0 0 28px;width:430px!important}
      .panel__frame{animation:none!important}.panel__tail{display:none}h1{font:600 16px 'Chakra Petch';color:#eadff3;margin:0 0 20px}`);
    const markup=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8')
      .replace('href="styles/capri.css"',`href="${url('src/renderer/styles/capri.css')}"`)
      .replace('</head>','<link rel="stylesheet" href="preview.css"></head>')
      .replace('<body>','<body><h1>CAPRI / LIVE PORTRAIT</h1>')
      .replace('src="js/app.js"','src="harness.js"');
    fs.writeFileSync(path.join(out,'index.html'),markup);
    fs.writeFileSync(path.join(out,'harness.js'),`
      import { Panel } from '${url('src/renderer/js/panel.js')}';
      import { LINES } from '${url('src/renderer/js/lines.js')}';
      import { Dictation } from '${url('src/renderer/js/dictation.js')}';
      try {
        const base=document.querySelector('#panel'),ticker=document.querySelector('#ticker');
        const second=base.cloneNode(true);second.id='portrait-chat';document.body.append(second);
        const idle=new Panel({panel:base,ticker,labels:LINES.en});
        const chat=new Panel({panel:second,ticker:ticker.cloneNode(true),labels:LINES.en});
        idle.say({kind:'idle',line:'Nothing running. Just floating.',actions:[{id:'talk',label:'Talk to me'}]});
        chat.say({kind:'chat',badge:'AI · LIVE',tag:'QWEN3.5:9B',activity:'Codex: no activity received yet.',
          line:'You want to chat? We’re all ears. All of ours.',chat:{placeholder:'Say something…',send:'Send',close:'Close'},
          onSend:text=>{window.submitted=text;}});
        await document.fonts.ready;
        for(let i=0;i<100&&!idle.animatedPortrait.ready;i++)await new Promise(r=>setTimeout(r,30));
        if(!idle.animatedPortrait.ready||idle.animatedPortrait.fallback)throw Error('New sprite sheet failed to decode');
        await new Promise(r=>setTimeout(r,900));
        const portrait=idle.animatedPortrait;
        cancelAnimationFrame(portrait.raf);portrait.raf=0;
        portrait.blinkStart=-Infinity;portrait.glitchStart=-Infinity;portrait.draw(1000);
        const open=portrait.canvas.toDataURL();
        portrait.blinkStart=1000;portrait.draw(1080);const closed=portrait.canvas.toDataURL();
        if(open===closed)throw Error('Blink did not change the eyes');
        portrait.blinkStart=-Infinity;portrait.glitchStart=1000;portrait.draw(1050);
        if(open===portrait.canvas.toDataURL())throw Error('Glitch bands not rendered');
        idle.suspend();if(portrait.raf!==0)throw Error('Suspended portrait still running');
        idle.resume();if(!portrait.raf)throw Error('Portrait did not resume');
        idle.hide();if(portrait.raf!==0)throw Error('Hidden portrait still running');
        idle.say({kind:'idle',line:'Nothing running. Just floating.',actions:[{id:'talk',label:'Talk to me'}]});
        for(const mood of ['calm','aside','smug','wide','look','laugh','many','grin'])idle.setFace(mood);
        if(document.querySelectorAll('.panel__face img').length)throw Error('Static portraits remain in panel');
        await new Promise(r=>setTimeout(r,1100));
        window.previewPanels={idle,chat};
        const input=chat.chatInput;
        if(input.tagName!=='TEXTAREA'||input.rows!==1)throw Error('Composer must start with one text row');
        const write=value=>{input.value=value;input.dispatchEvent(new Event('input'));};
        const height=input.getBoundingClientRect().height;
        if(height!==27)throw Error('Empty composer is not one line');
        write('First line\\nSecond line');
        if(input.getBoundingClientRect().height!==45)throw Error('Composer did not grow to two lines');
        write('First line\\nSecond line\\nThird line');
        if(input.getBoundingClientRect().height!==63)throw Error('Composer did not grow to three lines');
        input.value='A'.repeat(490);input.dispatchEvent(new Event('input'));
        if(input.scrollWidth>input.clientWidth+1)throw Error('Long words overflow horizontally');
        if(input.scrollHeight<=height)throw Error('Long draft does not scroll vertically');
        if(input.getBoundingClientRect().height!==63||getComputedStyle(input).overflowY!=='auto')throw Error('Long composer is not capped at three scrolling lines');
        write('Short again');
        if(input.getBoundingClientRect().height!==27)throw Error('Deleting text did not shrink the composer');
        Dictation.prototype.write.call({input,panel:chat,prefix:'',suffix:'',final:'A dictated sentence. '.repeat(15),partial:'',stop(){}});
        if(input.getBoundingClientRect().height!==63)throw Error('Programmatic dictation did not grow the composer');
        input.value='First line\\nSecond line\\nThird line\\nFourth line';
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));
        if(window.submitted)throw Error('Shift+Enter unexpectedly submitted');
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
        if(window.submitted)throw Error('Composition Enter unexpectedly submitted');
        input.readOnly=true;
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        if(window.submitted)throw Error('Dictation draft submitted while read-only');
        input.readOnly=false;
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        if(window.submitted!=='First line\\nSecond line\\nThird line\\nFourth line')throw Error('Enter did not submit the complete multiline draft');
        if(input.value!==''||input.scrollTop!==0||input.getBoundingClientRect().height!==27)throw Error('Sent draft did not reset to one line');
        input.value='Hey Capri, can you help me plan the next upgrade? I want to keep the cyber vibe and make the conversation feel natural.\\nHere is another thought…';
        input.dispatchEvent(new Event('input'));
        // Freeze a representative interference burst for the visual preview.
        for(const p of [idle,chat]){
          const portrait=p.animatedPortrait;cancelAnimationFrame(portrait.raf);portrait.raf=0;
          portrait.blinkStart=-Infinity;portrait.glitchStart=1000;portrait.draw(1130);
        }
        window.result={ok:true};
      } catch(error){window.result={ok:false,error:error.stack};}
    `);
    const win=new BrowserWindow({show:false,width:550,height:570,webPreferences:{backgroundThrottling:false}});
    await win.loadFile(path.join(out,'index.html'));
    let result;
    for(let i=0;i<140;i++){result=await win.webContents.executeJavaScript('window.result');if(result)break;await new Promise(r=>setTimeout(r,50));}
    assert.ok(result?.ok,result?.error||'No renderer result');
    await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    fs.writeFileSync(path.join(out,'panels.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`Object.values(window.previewPanels).forEach(p=>p.animatedPortrait.refresh())`);
    assert.equal(await win.webContents.executeJavaScript(`Object.values(window.previewPanels).every(p=>p.animatedPortrait.raf!==0)`),true,'Visible portraits run before reduced motion is enabled');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await new Promise(r=>setTimeout(r,100));
    assert.equal(await win.webContents.executeJavaScript(`Object.values(window.previewPanels).every(p=>p.animatedPortrait.raf===0)`),true,'Reduced motion pauses portrait loops');
    console.log('PASS: asset decode, blink/RGB tears, moods, hide/suspend/resume, reduced motion, composer grows 1 → 2 → 3 lines and shrinks, long-word wrapping, scrolling, dictation resizing, Enter submit and Shift+Enter/composition guards.');
    console.log('Preview: '+path.join(out,'panels.png'));
    clearTimeout(deadline);app.exit(0);
  }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
});
