'use strict';
// Run with npm run test:desktop. Exercises our own app via its preload IPC API.
const { app, BrowserWindow, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
process.env.CAPRI_PORT = '47824';
const scratch = path.resolve(__dirname, '../../../work');
fs.mkdirSync(scratch, { recursive: true });
process.env.CAPRIGPT_TEST_PROFILE = fs.mkdtempSync(path.join(scratch, 'caprigpt-smoke-'));
process.env.CAPRIGPT_CONNECTION_FILE = path.join(process.env.CAPRIGPT_TEST_PROFILE, 'integration.json');
let cognitiveProbe, proactiveProbe, reflectionProbe, actionsProbe, interestsProbe, cognitiveSchemaSeen = false, foregroundContext, foregroundWorkspace;
if (process.argv.includes('--cognitive-only')) {
  require('../src/main/native-windows').context = () => ({ foreground: { app: 'Code', title: 'Synthetic project' } });
  require('../src/main/native-windows').foregroundBounds = () => null;
  for (const [file, key, capture] of [
    ['cognitive-foundation', 'CognitiveFoundation', value => cognitiveProbe = value],
    ['proactive-conversation', 'ProactiveConversation', value => proactiveProbe = value],
    ['cognitive-reflection', 'ReflectionEngine', value => reflectionProbe = value],
    ['action-agent', 'ActionAgent', value => actionsProbe = value],
    ['companion-interests', 'CompanionInterests', value => interestsProbe = value],
  ]) {
    const module = require('../src/main/' + file), Original = module[key];
    module[key] = class extends Original { constructor(options) { super(options); capture(this); } };
  }
  const { CodexBrain } = require('../src/main/codex-brain');
  CodexBrain.prototype.status = async () => ({ ok: true, backend: 'codex', model: 'codex' });
  CodexBrain.prototype.chat = async function(text, delta, progress, options = {}) {
    if (this.cwd.endsWith('caprigpt-codex-cognition')) {
      assert.deepEqual(this.tools.specs(), []);
      assert.equal(options.recordHistory, false); assert.ok(options.outputSchema);
      cognitiveSchemaSeen = true;
      if (options.outputSchema.properties.domain) return JSON.stringify({ domain: 'worldbuilding', focus: 'Map a weather-shaped city',
        question: 'What if streets moved with the rain?', rationale: 'A small rule could make an interesting fictional place.', continuationId: null });
      if (options.outputSchema.properties.hypothesis) return JSON.stringify({
        question: 'Would a second pair of eyes be useful?', hypothesis: 'Possibly ordinary project work.',
        counterpoint: 'App visits do not establish intent.', confidence: 0.3, priority: 0.4, next_step: 'ask_later' });
      return JSON.stringify({ speak: true, message: 'What kind of game would you like to build?' });
    }
    foregroundContext = this.context();
    foregroundWorkspace = typeof this.workspace === 'function' ? this.workspace() : this.workspace;
    if (!/goal context probe/i.test(text)) assert.ok(this.history.some(row => row.content.includes('What kind of game')));
    delta?.('A platformer sounds fun.'); return 'A platformer sounds fun.';
  };
}
const requestEffects=[];
if (process.argv.includes('--fullscreen-only')) {
  const { CodexBrain } = require('../src/main/codex-brain');
  CodexBrain.prototype.status = async () => ({ ok: true, backend: 'codex', model: 'codex' });
  CodexBrain.prototype.chat = async function(text, delta) { delta?.('Left click restored.'); return 'Left click restored.'; };
}
if(process.argv.includes('--requests-only')) {
  require('../src/main/ollama-runtime').executable=()=>null;
  require('../src/main/ollama').models=async()=>['qwen3.5:9b'];
  require('../src/main/native-windows').foregroundBounds=()=>null;
  require('../src/main/web-tools').WebTools.prototype.search=async()=>({type:'search',items:[{title:'Netflix',url:'https://www.netflix.com/'}]});
  require('../src/main/desktop-tools').DesktopTools.prototype.openUrl=async(url,browser)=>{
    requestEffects.push({url,browser});return {type:'website',title:url,browser,launchRequested:true,note:`Sent ${url} to ${browser}.`};
  };
  require('../src/main/ollama').chat=async(request,delta)=>{
    if(request.schema?.properties?.goals){
      const input=JSON.parse(request.messages.at(-1).content);
      if(/netflix/i.test(input.request))return JSON.stringify({intent:'act',message:'',goals:[{type:'open_website',target:'Netflix',browser:'Firefox'}],
        steps:[input.availableResults?{tool:'open_result',query:'',index:0}:{tool:'search_web',query:'Netflix official website',index:0}]});
      return JSON.stringify({intent:'chat',message:'',goals:[],steps:[]});
    }
    delta('Hello, choom.');return 'Hello, choom.';
  };
}
if (process.argv.includes('--conversation-only')) {
  require('../src/main/ollama-runtime').executable = () => null;
  require('../src/main/ollama').models = async () => ['qwen3.5:9b'];
  require('../src/main/native-windows').foregroundBounds = () => null;
}
if (process.argv.includes('--tts-only') || process.argv.includes('--fullscreen-only') || process.argv.includes('--memory-only') || process.argv.includes('--foreground-priority') || process.argv.includes('--memory-language-only') || process.argv.includes('--agent-only') || process.argv.includes('--settings-only') || process.argv.includes('--settings-pointer') || process.argv.includes('--tasks-only') || process.argv.includes('--playback-live') || process.argv.includes('--firefox-live') || process.argv.includes('--chrome-context-live')) {
  // Isolated profile, no server startup, model or real dialogs.
  require('../src/main/ollama-runtime').executable = () => null;
  require('../src/main/ollama').models = async () => [];
}
const taskEffects={apps:[],opened:[],played:[]};
const speechSessions=[];
let speechService;
if(process.argv.includes('--speech-whisper-live')) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture',path.resolve(__dirname,'../.caprigpt-local/speech-check/recorded-english.wav')+'%noloop');
  require('../src/main/ollama-runtime').executable=()=>null;
  require('../src/main/ollama').models=async()=>[];
  const module=require('../src/main/speech'),Original=module.SpeechInput;
  module.SpeechInput=class extends Original {constructor(options){super(options);speechService=this;}};
}
if(process.argv.includes('--speech-only')) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  require('../src/main/ollama-runtime').executable=()=>null;
  require('../src/main/ollama').models=async()=>[];
  const module=require('../src/main/speech'),Original=module.SpeechInput;
  const engine={device:'GPU',start:()=>new Promise(resolve=>speechSessions.push({ready:resolve,responses:[],stopped:false})),
    stop:()=>{if(speechSessions.length)speechSessions.at(-1).stopped=true;},
    transcribe:async()=>speechSessions.at(-1).responses.shift()||''};
  module.SpeechInput=class extends Original {constructor(options){super({...options,engine});speechService=this;}};
}
let fullscreenProbe = null;
if (process.argv.includes('--fullscreen-only') || process.argv.includes('--speech-only')) require('../src/main/native-windows').foregroundBounds = () => fullscreenProbe;
let priorityTestAgent;
if(process.argv.includes('--foreground-priority')) {
  const module=require('../src/main/agent'),Original=module.Agent;
  module.Agent=class extends Original {constructor(options){super(options);priorityTestAgent=this;}};
}
if(process.argv.includes('--tasks-only')) {
  const {WebTools}=require('../src/main/web-tools');
  WebTools.prototype.steam=async()=>({type:'steam',items:[{title:'Test Game',discount:75,price:5,currency:'USD',url:'https://store.steampowered.com/app/10/'}]});
  WebTools.prototype.search=async()=>({type:'news',items:[{title:'A current AI headline',published:'2026-10-28T00:00:00Z',url:'https://news.google.com/rss/articles/test'}]});
  WebTools.prototype.youtube=async()=>({type:'youtube',items:[{title:'A verified newest upload',channel:'Rubius Z',videoId:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk'}]});
  require('../src/main/desktop-tools').DesktopTools.prototype.open=async name=>{taskEffects.apps.push(name);return {type:'app',note:'File Explorer has a visible desktop window.'};};
  require('../src/main/agent-browser').createAgentBrowser=()=>({
    open:async url=>{taskEffects.opened.push(url);return {opened:true,url};},
    play:async item=>{taskEffects.played.push(item.videoId);return {...item,playing:true};},stop(){},
  });
}
require('../src/main/main');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 150000);
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
    const js = (source) => win.webContents.executeJavaScript(source);
    for (let i = 0; i < 120 && !await js("document.documentElement.dataset.caprigptReady === 'true'"); i++) await pause(500);
    assert.equal(await js("document.documentElement.dataset.caprigptReady"), 'true');
    if (process.argv.includes('--cognitive-only')) {
      require('../src/main/config').save({ gamingMode: false, proactiveEnabled: true, cognitiveEnabled: true,
        autonomyEnabled: true, wakeWordEnabled: false, ttsEnabled: false,
        privacy: { contextEvents: true, contextForeground: true } });
      cognitiveProbe.observeApp('Code'); cognitiveProbe.observeApp('Code');
      const question = cognitiveProbe.observeApp('Code'); assert.ok(question);
      powerMonitor.emit('lock-screen');
      assert.equal(reflectionProbe.canRun(), false, 'reflection stays paused while locked');
      assert.equal(await reflectionProbe.run(), false);
      powerMonitor.emit('unlock-screen');
      reflectionProbe.canRun = () => true;
      assert.equal(await reflectionProbe.run(), true);
      assert.equal(cognitiveSchemaSeen, true);
      const route = text => js(`host.personalRoute(${JSON.stringify(text)})`);
      assert.equal(JSON.parse((await route('/curiosity history ' + question.id)).text)[0].reflection.next_step, 'ask_later');
      await js("document.querySelector('#panel').click()"); await pause(500);
      proactiveProbe.canRun = () => true; proactiveProbe.state.nextAt = 0;
      assert.equal(await proactiveProbe.run(), true);
      assert.equal(interestsProbe.list()[0].focus, 'Map a weather-shaped city');
      for (let i = 0; i < 100 && !await js("document.querySelector('.panel__line').textContent.includes('What kind of game')"); i++) await pause(50);
      assert.match(await js("document.querySelector('.panel__line').textContent"), /What kind of game/);
      assert.equal(win.isFocusable(), true, 'Mouse activation remains available');
      assert.equal(win.isFocused(), false, 'A proactive remark must not take keyboard focus');
      await js("document.querySelector('[data-id=reply]').click()");
      for (let i = 0; i < 100 && !await js("document.querySelector('#panel').classList.contains('is-chat')"); i++) await pause(50);
      assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"), true);
      await js("document.querySelector('.panel__input').value='A platformer!';document.querySelector('.panel__chat').requestSubmit()");
      for (let i = 0; i < 100 && !await js("document.querySelector('.panel__line').textContent.includes('platformer sounds')"); i++) await pause(50);
      assert.match(await js("document.querySelector('.panel__line').textContent"), /platformer sounds/);
      require('../src/main/config').save({ privacy: { memoryEnabled: true, memoryRecall: true } });
      assert.match((await route('/goals add Finish Capri roadmap')).text, /Saved goal #1/);
      assert.match((await route('/goals next 1 Review test results')).text, /updated/);
      foregroundContext = null;
      await js("document.querySelector('.panel__input').value='Goal context probe';document.querySelector('.panel__chat').requestSubmit()");
      for (let i = 0; i < 100 && !foregroundContext; i++) await pause(50);
      assert.equal(foregroundContext.savedGoals[0].text, 'Finish Capri roadmap');
      assert.equal(foregroundContext.savedGoals[0].next_step, 'Review test results');
      assert.equal(foregroundContext.companionInterests[0].focus, 'Map a weather-shaped city');
      require('../src/main/config').save({ privacy: { memoryEnabled: true, memoryRecall: false } });
      await pause(100); foregroundContext = null;
      await js("document.querySelector('.panel__input').value='Goal context probe';document.querySelector('.panel__chat').requestSubmit()");
      for (let i = 0; i < 100 && !foregroundContext; i++) await pause(50);
      assert.deepEqual(foregroundContext.savedGoals, []);
      assert.match((await route('/goals delete 1')).text, /deleted/);
      require('../src/main/config').save({ privacy: { memoryEnabled: true, memoryRecall: true } });
      const alpha = path.join(process.env.CAPRIGPT_TEST_PROFILE, 'alpha'), beta = path.join(process.env.CAPRIGPT_TEST_PROFILE, 'beta');
      fs.mkdirSync(alpha); fs.mkdirSync(beta);
      await js('host.openMenu()');
      let controls;
      for (let i = 0; i < 100; i++) {
        controls = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings.html'));
        if (controls && !controls.webContents.isLoading() && await controls.webContents.executeJavaScript('document.documentElement.dataset.settingsReady === "true"')) break;
        await pause(50);
      }
      assert.ok(controls);
      let choose;
      require('electron').dialog.showOpenDialog = () => new Promise(resolve => { choose = resolve; });
      const selecting = controls.webContents.executeJavaScript('settingsHost.action("project-choose")');
      for (let i = 0; i < 100 && !choose; i++) await pause(10);
      assert.equal(typeof choose, 'function');
      const probe = id => js(`host.chatSend({id:${id},messages:[{role:'user',content:'Goal context probe'}]})`);
      assert.match((await probe(9001)).error, /Finish choosing/);
      assert.match((await route('/goals add Wrong scope during selection')).text, /Finish choosing/);
      choose({ canceled: false, filePaths: [alpha] });
      assert.match((await selecting).message, /Selected project/);
      await controls.webContents.executeJavaScript('document.querySelector("[data-page=connections]").click()');
      assert.match(await controls.webContents.executeJavaScript('document.querySelector("#content").textContent'), /Working with alpha/);
      controls.hide();
      await route('/goals add Keep the project scoped');
      await route('/project decision Preserve original animations');
      await route('/project outcome Synthetic manual observation');
      assert.equal((await probe(9002)).ok, true);
      assert.equal(foregroundWorkspace, fs.realpathSync(alpha));
      assert.equal(foregroundContext.currentProject.name, 'alpha');
      assert.equal(foregroundContext.currentProject.notes.some(row => row.kind === 'reported-outcome'), true);
      assert.equal(foregroundContext.savedGoals[0].text, 'Keep the project scoped');
      actionsProbe.context.record('Synthetic alpha task', 'completed');
      await route('/project open ' + beta);
      assert.equal((await probe(9003)).ok, true);
      assert.equal(foregroundWorkspace, fs.realpathSync(beta));
      assert.deepEqual(foregroundContext.currentProject.notes, []);
      assert.deepEqual(foregroundContext.savedGoals, []);
      assert.deepEqual(foregroundContext.recentTasks.recentTasks, []);
      const off = await controls.webContents.executeJavaScript('settingsHost.action("project-off")');
      assert.equal(off.state.project, null);
      await controls.webContents.executeJavaScript('settingsHost.action("interests-open")');
      for (let i=0;i<100 && !await js("document.querySelector('.panel__line').textContent.includes('Map a weather-shaped city')");i++) await pause(50);
      assert.match(await js("document.querySelector('.panel__line').textContent"), /Map a weather-shaped city/);
      await route('/interests dismiss 1');
      assert.deepEqual(interestsProbe.context(), []);
      await controls.webContents.executeJavaScript('settingsHost.patch({interestsEnabled:false})');
      assert.equal(interestsProbe.enabled(), false);
      await route('/companion off');
      assert.equal(JSON.parse((await route('/companion status')).text).enabled, false);
      assert.equal(await proactiveProbe.run(), false);
      console.log('PASS: tool-free interest generation, persistent foreground interest context, review/dismiss/disable controls, reflection lock gate, proactive replies, goals/recall, project picker races and scoped context. Isolated profile, inference mocked.');
      clearTimeout(limit); app.exit(0); return;
    }
    if (process.argv.includes('--tts-only')) {
      await js('host.setConfig({ttsEnabled:true,ttsEngine:"windows",muted:false,visible:true})');
      win.showInactive();
      const result = await js('host.ttsSpeak({text:"Hello. The local speech connection works."})');
      assert.equal(result.ok,true,result.error);
      assert.equal(Buffer.from(result.audio,'base64').toString('ascii',0,4),'RIFF');
      await js('host.setConfig({muted:true})');
      assert.equal((await js('host.ttsSpeak({text:"Muted speech"})')).ok,false);
      await js('host.setConfig({muted:false})');
      await js('window.ttsPending=host.ttsSpeak({text:"A very long reply. ".repeat(70)});setTimeout(()=>host.ttsCancel(),100)');
      assert.equal((await js('window.ttsPending')).ok,false);
      console.log('PASS: actual overlay preload → TTS IPC → Windows synthesis → WAV; mute and in-flight interruption. Isolated profile.');
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--requests-only')) {
      const until=async(check,label)=>{for(let i=0;i<100;i++){if(await check())return;await pause(30);}throw Error('Timed out: '+label);};
      await js('host.setConfig({lang:"en",privacy:{memoryEnabled:false,contextEvents:false}})');
      win.webContents.send('capri:command',{name:'chat'});
      await until(()=>js("document.querySelector('#panel').classList.contains('is-chat')"),'chat');
      const submit=text=>js(`document.querySelector('.panel__input').value=${JSON.stringify(text)};document.querySelector('.panel__chat').requestSubmit()`);
      await submit('can you open netflix in firefox?');
      await until(()=>js("document.querySelector('.panel__line').textContent.includes('Sent https://www.netflix.com/ to Firefox.')"),'website task receipt');
      assert.deepEqual(requestEffects,[{url:'https://www.netflix.com/',browser:'Firefox'}]);
      await submit('Hello');
      await until(()=>js("document.querySelector('.panel__line').textContent==='Hello, choom.'"),'ordinary conversation');
      assert.equal(requestEffects.length,1);
      console.log('PASS: actual chat form → main semantic interpreter → search observation → browser constraint propagation → website executor → receipt; ordinary chat still answers. Isolated profile, model/search/launch effects mocked.');
      clearTimeout(limit);app.exit(0);return;
    }
    if (process.argv.includes('--conversation-only')) {
      const requests = [];
      const originalFetch = global.fetch;
      const answer = 'Here is the function:\n\n```python\ndef my_func(user_name):\n    return "Hi " + user_name\n```\n\n' + 'A useful explanation with a separate step.\n'.repeat(16);
      global.fetch = async (url, options) => {
        if (url === `${require('../src/main/ollama').base()}/api/show`) return Response.json({ details: { parameter_size: '9B', context_length: 262144 } });
        if (url === `${require('../src/main/ollama').base()}/api/chat`) {
          const body=JSON.parse(options.body);
          if(body.format?.properties?.goals)return new Response(JSON.stringify({message:{content:JSON.stringify({intent:'chat',message:'',goals:[],steps:[]})},done:true})+'\n');
          requests.push(body);
          return new Response(JSON.stringify({ message: { content: answer }, done: true }) + '\n');
        }
        return originalFetch(url, options);
      };
      await js('host.setConfig({lang:"en",privacy:{memoryEnabled:false,contextEvents:false,contextTime:false,contextForeground:false,contextProcesses:false,contextPower:false,contextPerformance:false}})');
      win.webContents.send('capri:command', { name: 'chat' });
      for (let i = 0; i < 60 && !await js("document.querySelector('#panel').classList.contains('is-chat')"); i++) await pause(50);
      assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"), true);
      for (let i = 0; i < 18; i++) {
        const text = i === 0 ? 'For this conversation the project codename is Orchid.' : `Discuss design detail ${i} of the layout.`;
        await js(`document.querySelector('.panel__input').value=${JSON.stringify(text)}; document.querySelector('.panel__input').form.requestSubmit();`);
        for (let tick = 0; tick < 100; tick++) {
          if (requests.length === i + 1 && await js("!document.querySelector('.panel__input').disabled")) break;
          await pause(30);
        }
        assert.equal(requests.length, i + 1);
        assert.equal(await js("document.querySelector('.panel__line').textContent"), answer.trim());
      }
      assert.ok(requests.at(-1).messages.some(m => /project codename is Orchid/.test(m.content)));
      assert.match(requests.at(-1).messages[0].content, /Current self-capability registry/);
      assert.doesNotMatch(requests.at(-1).messages[0].content, /satellite/i);
      assert.equal(requests.at(-1).options.num_ctx, 32768);
      assert.equal(requests.at(-1).options.num_predict, 1536);
      const layout = await js(`(() => { const line=document.querySelector('.panel__line'); return {whiteSpace:getComputedStyle(line).whiteSpace,scrolls:line.scrollHeight>line.clientHeight,overflow:getComputedStyle(line).overflowY}; })()`);
      assert.equal(layout.whiteSpace, 'pre-wrap'); assert.equal(layout.scrolls, true); assert.equal(layout.overflow, 'auto');
      console.log('PASS: actual Electron chat → local task routing → permitted context → capability registry → Ollama request → streamed UI, 18 turns, retained Orchid detail, intact code/indentation and scrollable long answers. Inference mocked; isolated profile.');
      clearTimeout(limit); app.exit(0); return;
    }
    if(process.argv.includes('--speech-whisper-live')) {
      const until=async(check,label)=>{for(let i=0;i<700;i++){if(await check())return;await pause(50);}throw Error('Timed out: '+label);};
      win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      await js("host.setConfig({lang:'en'})");win.webContents.send('capri:command',{name:'memory'});
      await until(()=>js("document.querySelector('#panel').classList.contains('is-chat')"),'chat');
      await js("document.querySelector('.panel__input').value='';document.querySelector('.panel__mic').click()");
      await until(()=>js("/apostle.*middle classes/i.test(document.querySelector('.panel__input').value)"),'actual Whisper transcript through browser audio pipeline');
      await js("document.querySelector('.panel__mic').click()");
      await until(()=>js("!document.querySelector('.panel__input').readOnly"),'microphone stop and final decode');
      assert.equal(speechService.current,null);assert.equal(speechService.engine.child,null);
      const draft=await js("document.querySelector('.panel__input').value");assert.match(draft,/gospel/i);
      assert.match(draft,/gospel[.!]?\s*$/i,'End-of-recording silence must not add an invented phrase');
      assert.match(await js("document.querySelector('.panel__line').textContent"),/Use \/memory/,'Speech did not auto-send');
      console.log('PASS: real recorded English → Chromium default fake microphone → AudioWorklet PCM → speech segmentation → local GPU Whisper/Silero → draft, final flush and model release. User microphone not opened.');
      console.log('Public-fixture transcript:',draft);clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--speech-only')) {
      const until=async(check,label)=>{for(let i=0;i<200;i++){if(await check())return;await pause(20);}throw Error('Timed out: '+label);};
      win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      await js("host.setConfig({lang:'en'})");win.webContents.send('capri:command',{name:'memory'});
      await until(()=>js("document.querySelector('#panel').classList.contains('is-chat')"),'local chat');
      const click=()=>js("document.querySelector('.panel__mic').click()");
      const listening=()=>js("document.querySelector('.panel__dictation-status').textContent.includes('Listening')");
      await js("const input=document.querySelector('.panel__input');input.value='Please';input.setSelectionRange(6,6)");
      await click();await until(()=>speechSessions.length===1,'Whisper model startup');speechSessions[0].ready();
      await until(listening,'fake default microphone and AudioWorklet open');
      await until(()=>speechService.current?.total>0,'real PCM frames arrive through preload');
      assert.equal(await js("document.querySelector('.panel__input').readOnly && document.querySelector('.panel__send').disabled"),true);
      speechSessions[0].responses.push('tell me a story about robots');
      speechService.enqueue(speechService.current,Buffer.alloc(9600));
      await until(()=>js("document.querySelector('.panel__input').value === 'Please tell me a story about robots'"),'Whisper phrase in draft');
      const capture=path.resolve(__dirname,'..','captures','speech-listening.png');fs.mkdirSync(path.dirname(capture),{recursive:true});
      await pause(300);fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      await click();await until(()=>js("!document.querySelector('.panel__input').readOnly"),'stop and final audio flush');
      assert.equal(speechSessions[0].stopped,true);
      assert.equal(await js("document.querySelector('.panel__input').value"),'Please tell me a story about robots');
      assert.match(await js("document.querySelector('.panel__line').textContent"),/Use \/memory/,'Dictation never submits');
      await click();await until(()=>speechSessions.length===2,'second startup');await click();
      await until(()=>speechSessions[1].stopped,'cancel model startup');speechSessions[1].ready();
      await click();await until(()=>speechSessions.length===3,'fresh session');speechSessions[2].ready();await until(listening,'new capture');
      await js("document.querySelector('.panel__close').click()");await until(()=>speechSessions[2].stopped,'chat close');
      win.webContents.send('capri:command',{name:'memory'});
      await until(()=>js("document.querySelector('#panel').classList.contains('is-chat') && !document.querySelector('#panel').hidden"),'reopen chat');
      await click();await until(()=>speechSessions.length===4,'capture before Gaming mode');speechSessions[3].ready();await until(listening,'capture ready');
      await js('host.setConfig({gamingMode:true})');await until(()=>speechSessions[3].stopped,'Gaming mode stops capture');
      assert.equal((await js("host.speechStart({id:'blocked-session'})")).error,'speech-paused');
      await js('host.setConfig({gamingMode:false})');
      await click();await until(()=>speechSessions.length===5,'capture before fullscreen');speechSessions[4].ready();await until(listening,'capture ready');
      fullscreenProbe={...require('electron').screen.dipToScreenRect(null,require('electron').screen.getPrimaryDisplay().bounds),pid:0,caption:false};
      await until(()=>speechSessions[4].stopped,'fullscreen stops capture');
      fullscreenProbe=null;await until(()=>js("!document.body.classList.contains('fullscreen-presence')"),'fullscreen return');
      await click();await until(()=>speechSessions.length===6,'capture before Esc');speechSessions[5].ready();await until(listening,'capture ready');
      await js("document.querySelector('.panel__input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await until(()=>js("!document.querySelector('.panel__input').readOnly"),'Esc stops dictation');
      assert.equal(await js("!document.querySelector('#panel').hidden && document.querySelector('#panel').classList.contains('is-chat')"),true);
      console.log('PASS: real default-device capture using Chromium fake audio, AudioWorklet, PCM IPC, phrase results, draft preservation, no auto-send, stop flush, rapid model startup cancellation, chat close, Gaming mode and fullscreen. Whisper inference mocked; real microphone never opened.');
      console.log('CAPTURE:',capture);clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--fullscreen-only')) {
      win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      const {screen}=require('electron');
      const bounds=screen.dipToScreenRect(null,screen.getPrimaryDisplay().bounds);
      const fullscreen={...bounds,pid:0,caption:false};
      const until=async(check,label)=>{
        for(let i=0;i<100;i++){if(await check())return;await pause(20);}
        throw Error('Timed out: '+label);
      };
      const state=()=>js('host.fullscreenState()');
      const shown=()=>js("document.querySelector('#capri').dataset.fullscreen === 'visible'");
      const away=()=>js("document.querySelector('#capri').dataset.fullscreen === 'away'");
      let ignoresMouse=true;
      const applyIgnore=win.setIgnoreMouseEvents.bind(win);
      win.setIgnoreMouseEvents=(on,options)=>{ignoresMouse=on;return applyIgnore(on,options);};
      await js(`(async()=>{
        const {Capri}=await import('./js/capri.js');const draw=Capri.prototype.drawFrame;
        Capri.prototype.drawFrame=function(...args){window.fullscreenPet=this;return draw.apply(this,args);};
      })()`);
      await until(()=>js('Boolean(window.fullscreenPet)'),'pet input probe');
      await js(`window.fullscreenPet.wander=false;window.fullscreenPet.nextMove=window.fullscreenPet.nextGaze=Infinity;
        window.petClicks=0;const click=window.fullscreenPet.onClick;
        window.fullscreenPet.onClick=()=>{window.petClicks++;click();};true;`);
      const point=()=>js(`(()=>{const p=window.fullscreenPet,h=p.head();
        for(let dy=-20;dy<80;dy+=4)for(let dx=-30;dx<=30;dx+=4){const x=Math.round(h.x+dx),y=Math.round(h.y+dy);if(p.hit(x,y))return{x,y};}
        throw Error('No opaque pet hit target');})()`);
      const stationary=await point(),overlayBounds=win.getBounds();
      // A stationary pointer has no new mousemove after showInactive().
      screen.getCursorScreenPoint=()=>({x:overlayBounds.x+stationary.x,y:overlayBounds.y+stationary.y});
      win.webContents.sendInputEvent({type:'mouseMove',...stationary});
      fullscreenProbe={...fullscreen,caption:true};await pause(100);
      assert.equal((await state()).active,false,'Maximized captioned window is not fullscreen');
      const started=Date.now();fullscreenProbe=fullscreen;
      await until(async()=>(await state()).active,'native fullscreen probe');
      const detectionMs=Date.now()-started;
      await until(async()=>await away()&&!win.isVisible(),'teleport-out and OS overlay hide');
      const oldRevision=(await state()).revision;
      fullscreenProbe=null;
      await until(async()=>await shown()&&win.isVisible(),'teleport back');
      assert.equal(win.isFocusable(),true,'Returning from fullscreen must restore normal mouse activation without stealing focus');
      await until(()=>!ignoresMouse,'stationary-pointer hit target restored');
      // Simulate lost native activation/forwarding while renderer hit state is
      // cached true. Recovery must work with no new injected mousemove.
      win.setFocusable(false); win.setIgnoreMouseEvents(true,{forward:true});
      await until(()=>!ignoresMouse&&win.isFocusable(),'lost native input state recovers without forwarded mousemove');
      await js(`host.fullscreenRendered({revision:${oldRevision},hidden:true})`);await pause(300);
      assert.equal(win.isVisible(),true,'Late departure acknowledgment cannot re-hide the returned pet');
      for(let i=0;i<24;i++){fullscreenProbe=i%2?null:fullscreen;await pause(25);}
      fullscreenProbe=null;
      await until(async()=>!(await state()).active&&await shown()&&win.isVisible(),'rapid-toggle final visible state');
      await pause(350);assert.equal(win.isVisible(),true,'No delayed hide after rapid toggles');
      assert.equal(win.isFocusable(),true);
      const clickAt=async at=>{
        win.webContents.sendInputEvent({type:'mouseMove',...at});await pause(50);
        win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...at});
        win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...at});await pause(60);
      };
      await clickAt(await point());
      assert.equal(await js('window.petClicks'),1,'Left click must reach the returned character');
      // Keep the launcher open: hiding it as pickup starts must not blur and
      // immediately cancel pointer capture.
      assert.equal(await js("!document.querySelector('#talk-menu').hidden"),true);
      const dragAt=await point(),beforeDrag=await js('({...window.fullscreenPet.pos})');
      win.webContents.sendInputEvent({type:'mouseMove',...dragAt});await pause(30);
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...dragAt});
      win.webContents.sendInputEvent({type:'mouseMove',x:dragAt.x-35,y:dragAt.y-35,modifiers:['leftButtonDown']});await pause(50);
      assert.equal(await js('window.fullscreenPet.dragging'),true,'Drag can start after fullscreen');
      assert.ok(await js(`window.fullscreenPet.pos.x<${beforeDrag.x}-20`));
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:dragAt.x-35,y:dragAt.y-35});
      await until(()=>js('!window.fullscreenPet.dragging'),'drag release after fullscreen');
      await until(()=>js("!window.fullscreenPet.busy&&window.fullscreenPet.stance!=='fall'"),'drop settles before chat');
      require('../src/main/ollama').models=async()=>['qwen3.5:9b'];
      require('../src/main/ollama').chat=async(request,delta)=>{if(request.schema?.properties?.goals)return JSON.stringify({intent:'chat',message:'',goals:[],steps:[]});delta('Left click restored.');return 'Left click restored.';};
      win.webContents.send('capri:command',{name:'chat'});
      await until(()=>js("document.querySelector('#panel').classList.contains('is-chat')"),'chat after fullscreen');
      await pause(500);
      await js("document.querySelector('.panel__input').value='Hello Capri';document.querySelector('.panel__input').dispatchEvent(new Event('input'))");
      const buttonPoint=selector=>js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
      await clickAt(await buttonPoint('.panel__send'));
      try { await until(()=>js("document.querySelector('.panel__line').textContent==='Left click restored.'"),'Send button receives left click'); }
      catch(error){console.error('Returned chat:',await js("({line:document.querySelector('.panel__line').textContent,input:document.querySelector('.panel__input').value,busy:document.querySelector('.panel__input').disabled,chat:document.querySelector('#panel').className,petBusy:window.fullscreenPet.busy,stance:window.fullscreenPet.stance})"));throw error;}
      await clickAt(await buttonPoint('.panel__close'));
      await until(()=>js("!document.querySelector('#panel').classList.contains('is-chat')||document.querySelector('#panel').hidden"),'Close button receives left click');
      // Existing teleport effects may still be running when fullscreen reverses.
      win.webContents.send('capri:command',{name:'teleport'});
      fullscreenProbe=fullscreen;await pause(100);fullscreenProbe=null;
      await until(async()=>await shown()&&win.isVisible(),'fullscreen while normal teleport is in progress');
      await pause(800);
      const paint=await js(`(() => {
        const c=document.querySelector('#sprite');const gl=c.getContext('webgl');
        const program=gl.getParameter(gl.CURRENT_PROGRAM);
        return {hidden:document.querySelector('#capri').hidden,
          opaque:gl.getUniform(program,gl.getUniformLocation(program,'uAlpha'))>0.5
            && gl.getUniform(program,gl.getUniformLocation(program,'uCollapse'))===0};
      })()`);
      assert.equal(paint.hidden,false);assert.equal(paint.opaque,true,'Underlying teleport cannot leave her transparent');
      require('../src/main/ollama').unload=async()=>{};
      await js('host.openMenu()');
      let controls;
      await until(async()=>{
        controls=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('settings.html'));
        return controls&&!controls.webContents.isLoading()&&await controls.webContents.executeJavaScript('document.documentElement.dataset.settingsReady === "true"');
      },'control room');
      const gaming=on=>controls.webContents.executeJavaScript(`settingsHost.action('gaming',${on})`);
      fullscreenProbe=fullscreen;await until(away,'fullscreen before gaming');
      await gaming(true);assert.equal(win.isVisible(),false);
      await gaming(false);assert.equal(win.isVisible(),false,'Resuming Gaming mode must not reveal Capri over fullscreen');
      fullscreenProbe=null;
      await until(async()=>await shown()&&win.isVisible(),'gaming resumes while fullscreen ends');
      await gaming(true);
      fullscreenProbe=fullscreen;await until(async()=>(await state()).active,'fullscreen during Gaming mode');
      await gaming(false);assert.equal(win.isVisible(),false);
      fullscreenProbe=null;await until(async()=>await shown()&&win.isVisible(),'gaming then fullscreen return');
      await pause(400);
      assert.equal(await js(`(() => {const gl=document.querySelector('#sprite').getContext('webgl');const p=gl.getParameter(gl.CURRENT_PROGRAM);return gl.getUniform(p,gl.getUniformLocation(p,'uAlpha'))>0.5;})()`),true,'Combined gaming/fullscreen transitions leave her visible');
      fullscreenProbe=fullscreen;await until(away,'second departure');
      await js('host.setConfig({visible:false})');
      win.webContents.send('capri:command',{name:'stow',on:true});
      await until(()=>js("document.querySelector('#capri').hidden"),'manual stow while fullscreen');
      fullscreenProbe=null;
      await until(async()=>await shown()&&win.isVisible(),'fullscreen ends with manually stowed pet');
      assert.equal(await js("document.querySelector('#capri').hidden && !document.querySelector('#chip').hidden"),true,'Fullscreen does not undo manual stowing');
      assert.equal((await js('host.getConfig()')).visible,false);
      console.log(`PASS: fullscreen IPC/shader/OS visibility, restored native mouse activation, stationary-pointer routing, trusted left click/drag/Send/Close; detection ${detectionMs} ms, rapid reversals, stale acknowledgments, overlapping teleport, Gaming mode and manual stow. Native fullscreen geometry simulated; chat inference mocked.`);
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--foreground-priority')) {
      const ollama=require('../src/main/ollama');let entered,backgroundCalls=0,replyCalls=0,aborted=false;
      const started=new Promise(resolve=>{entered=resolve;});
      ollama.models=async()=>['qwen3.5:9b'];
      ollama.chat=async(request,delta,signal)=>{
        if(request.schema?.properties?.goals)return JSON.stringify({intent:'chat',message:'',goals:[],steps:[]});
        if(request.schema){backgroundCalls++;entered();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true}));}
        replyCalls++;assert.match(request.messages[0].content,/Gabriel/);
        assert.equal(await priorityTestAgent.run('','foreground-change'),'Foreground request has priority');
        return 'You are Gabriel, and you live in Nicaragua.';
      };
      await js('host.setConfig({privacy:{memoryEnabled:true,memoryConfirmChanges:true,contextEvents:false}})');
      const {MemoryStore}=require('../src/main/memory');
      const store=new MemoryStore(path.join(process.env.CAPRIGPT_TEST_PROFILE,'personal-memory.sqlite'));
      store.remember('Gabriel lives in Nicaragua.','explicit',{profile:true});store.close();
      win.webContents.send('capri:command',{name:'chat'});
      for(let i=0;i<80&&!await js("document.querySelector('#panel').classList.contains('is-chat')");i++)await pause(100);
      await priorityTestAgent.done;priorityTestAgent.lastEvent=-Infinity;
      const background=priorityTestAgent.run('','resume');
      await Promise.race([started,background.then(result=>{throw Error('Background fixture did not enter inference: '+result);})]);
      await js("document.querySelector('.panel__input').value='what do you know about me?';document.querySelector('.panel__chat').requestSubmit()");
      for(let i=0;i<100&&await js("document.querySelector('.panel__input').disabled");i++)await pause(100);
      const answer=await js("document.querySelector('.panel__line').textContent");
      assert.match(answer,/Gabriel/);assert.match(answer,/Nicaragua/);assert.doesNotMatch(answer,/One local reply|Lost the signal/);
      assert.equal(backgroundCalls,1);assert.equal(replyCalls,1);assert.equal(aborted,true);await background;
      const capture=path.resolve(__dirname,'..','captures','foreground-priority.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      console.log('PASS: real chat question interrupts a deliberately busy background decision, recalls the isolated saved profile, answers successfully and blocks a competing event. Model responses mocked.');
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--memory-language-only')) {
      const {dialog}=require('electron');let reviews=0,modelCalls=0,details='';
      dialog.showMessageBox=async()=>{reviews++;throw Error('Requested memory changes must not open a confirmation.');};
      const ollama=require('../src/main/ollama');ollama.models=async()=>['qwen3.5:9b'];
      ollama.chat=async request=>{
        modelCalls++;const data=JSON.parse(request.messages.at(-1).content);
        assert.equal(data.request,'forget about wow. remember i like games and cool coding stuff');
        const row=data.memories.find(row=>/WoW/.test(row.text));assert.ok(row);
        return JSON.stringify({intent:'change',message:'',selectedIds:[],changes:[
          {kind:'edit',id:row.id,text:'Uses English and Spanish. Plays Cyberpunk 2077.'},
          {kind:'add',id:0,text:'I like games and cool coding stuff.'},
        ]});
      };
      await js('host.setConfig({privacy:{memoryEnabled:true,memoryConfirmChanges:false,contextEvents:false}})');
      assert.match((await js('host.personalRoute("remember Uses English and Spanish. Plays Cyberpunk 2077 and WoW.")')).text,/Saved/);
      win.webContents.send('capri:command',{name:'chat'});
      for(let i=0;i<80&&!await js("document.querySelector('#panel').classList.contains('is-chat')");i++)await pause(100);
      await js("document.querySelector('.panel__input').value='forget about wow. remember i like games and cool coding stuff';document.querySelector('.panel__chat').requestSubmit()");
      for(let i=0;i<100&&await js("document.querySelector('.panel__input').disabled");i++)await pause(100);
      const answer=await js("document.querySelector('.panel__line').textContent");
      assert.match(answer,/Updated: Uses English and Spanish/);assert.match(answer,/Remembered: I like games/);assert.doesNotMatch(answer,/Local commands:/);
      assert.equal(reviews,0);assert.equal(modelCalls,1);
      const saved=await js('host.personalRoute("/memory list")');assert.doesNotMatch(saved.text,/WoW/);assert.match(saved.text,/Cyberpunk/);assert.match(saved.text,/cool coding stuff/);
      const capture=path.resolve(__dirname,'..','captures','memory-language.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      console.log('PASS: real chat → semantic memory interpreter → SQLite topic edit and preference save, with zero confirmation dialogs. Model responses mocked, real user profile untouched.');
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--firefox-live')||process.argv.includes('--chrome-context-live')) {
      const chrome=process.argv.includes('--chrome-context-live');
      const ollama=require('../src/main/ollama');let modelCalls=0;
      ollama.models=async()=>['qwen3.5:9b'];
      ollama.chat=async()=>{modelCalls++;throw Error('Known app requests must bypass model text.');};
      await js('host.setConfig({privacy:{contextEvents:false}})');
      win.webContents.send('capri:command',{name:'chat'});
      for(let i=0;i<80&&!await js("document.querySelector('#panel').classList.contains('is-chat')");i++)await pause(100);
      const submit=text=>js(`document.querySelector('.panel__input').value=${JSON.stringify(text)};document.querySelector('.panel__chat').requestSubmit()`);
      await submit('can you open my browser?');
      for(let i=0;i<60&&await js("document.querySelector('.panel__input').disabled");i++)await pause(100);
      assert.match(await js("document.querySelector('.panel__line').textContent"),/Which browser/);
      await submit(chrome?'open Chrome':'firefox');
      for(let i=0;i<100&&await js("document.querySelector('.panel__input').disabled");i++)await pause(100);
      assert.match(await js("document.querySelector('.panel__line').textContent"),chrome?/Google Chrome has a visible desktop window/:/Firefox has a visible desktop window/);
      assert.equal(modelCalls,0);
      const capture=path.resolve(__dirname,'..','captures',chrome?'chrome-launch.png':'firefox-launch.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      console.log(`PASS: real chat asks which browser, then launches installed ${chrome?'Chrome':'Firefox'}, verifies a visible window, with zero model calls.`);
      console.log('CAPTURE:',capture);
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--tasks-ui-live')) {
      await js('host.setConfig({privacy:{contextEvents:false}})');
      win.webContents.send('capri:command',{name:'chat'});
      for(let i=0;i<80&&!await js("document.querySelector('#panel').classList.contains('is-chat')");i++)await pause(100);
      assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"),true);
      await js("document.querySelector('.panel__input').value='capri look for the best discounts in steam';document.querySelector('.panel__chat').requestSubmit()");
      for(let i=0;i<180;i++) {
        if(!await js("document.querySelector('.panel__input').disabled")&&await js("document.querySelector('.panel__line').textContent.includes('Current featured Steam')"))break;
        await pause(500);
      }
      assert.match(await js("document.querySelector('.panel__line').textContent"),/Current featured Steam discounts/);
      assert.ok(await js("document.querySelectorAll('.panel__actions [data-id^=source-]').length > 0"));
      // A planner may already have opened a source. Remove only this isolated
      // test's browser windows so a broken source-button handler cannot pass.
      for(const page of BrowserWindow.getAllWindows().filter(w=>w!==win))page.destroy();
      await pause(100);
      const bounds=await js("(()=>{const r=document.querySelector('.panel__actions [data-id^=source-]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
      win.webContents.sendInputEvent({type:'mouseMove',...bounds});
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...bounds});
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...bounds});
      let source;
      for(let i=0;i<100;i++) {
        source=BrowserWindow.getAllWindows().find(w=>w!==win&&w.webContents.getURL().includes('store.steampowered.com'));
        if(source&&!source.webContents.isLoadingMainFrame())break;await pause(200);
      }
      assert.ok(source,'A source button must open the observed Steam page in the real browser');
      assert.equal(await source.webContents.executeJavaScript('typeof window.host'),'undefined');
      const capture=path.resolve(__dirname,'..','captures','task-steam-live.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      console.log('PASS: real chat UI → Qwen planner → live Steam data → source button via trusted mouse events → real Steam page, with no privileged preload in remote page');
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--tasks-only')) {
      const ollama=require('../src/main/ollama');
      ollama.models=async()=>['qwen3.5:9b'];
      ollama.chat=async({messages,schema},_delta,signal)=>{
        signal?.throwIfAborted();const data=JSON.parse(messages.at(-1).content);const goal=data.request||data.goal;
        const step=(tool,query='',index=0)=>({tool,query,index});
        const goals=[{type:/rubius/i.test(goal)?'play_video':'research',target:goal,browser:''}];
        if(schema?.properties?.goals&&!schema.properties.steps)return JSON.stringify({intent:'act',message:'',goals});
        const steps=/steam/i.test(goal)?[step('steam_deals')]:/news/i.test(goal)?[step('search_news','AI models')]:/rubius/i.test(goal)?[data.availableResults?.type==='youtube'?step('play_video'):step('youtube_latest','rubius')]:[];
        return JSON.stringify({intent:steps.length?'act':'unsupported',message:'unsupported',goals,steps});
      };
      const route=text=>js(`host.personalRoute(${JSON.stringify(text)},808)`);
      assert.match((await route('capri open file explorer')).text,/visible desktop window/);assert.deepEqual(taskEffects.apps,['File Explorer']);
      assert.match((await route('capri play the newest rubius video in youtube')).text,/^Playing/);assert.deepEqual(taskEffects.played,['abcdefghijk']);
      assert.match((await route('capri look for the latest news of ai models')).text,/Fresh headlines/);
      win.webContents.send('capri:command',{name:'memory'});await pause(400);
      await js("document.querySelector('.panel__input').value='capri look for the best discounts in steam'; document.querySelector('.panel__chat').requestSubmit()");
      for(let i=0;i<60 && !await js("document.querySelector('.panel__line').textContent.includes('Current featured Steam')");i++)await pause(100);
      assert.match(await js("document.querySelector('.panel__line').textContent"),/75% · 5.00 USD/);
      assert.equal(await js("document.querySelectorAll('.panel__actions [data-id^=source-]').length"),1);
      await js("document.querySelector('.panel__actions [data-id=source-0]').click()");await pause(100);
      assert.deepEqual(taskEffects.opened,['https://store.steampowered.com/app/10/']);
      assert.equal((await js('host.openTaskResult("ffffffffffffffff")')).ok,false);
      let ready;const started=new Promise(resolve=>{ready=resolve;});
      ollama.chat=async(_request,_delta,signal)=>{ready();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
      await js("window.pendingTask=host.personalRoute('search web for AI models',909);true");await started;
      await js('host.chatStop(909)');assert.match((await js('window.pendingTask')).text,/Task stopped/);
      const capture=path.resolve(__dirname,'..','captures','task-steam.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      console.log('PASS: natural-language task routing, validated planner, app launch, newest video/playback results, news, Steam prices, clickable source, cancellation and expired/unknown source rejection (effects mocked)');
      clearTimeout(limit);app.exit(0);return;
    }
    if(process.argv.includes('--playback-live')) {
      await js('host.setConfig({agentEnabled:false})');
      const native=require('../src/main/native-windows');const {shell}=require('electron');
      const before=new Set(native.desktopApps().filter(a=>a.name==='explorer').flatMap(a=>a.handles));
      const desktop=new(require('../src/main/desktop-tools').DesktopTools)({openPath:file=>shell.openPath(file),native});
      const opened=await desktop.open('File Explorer');assert.equal(opened.launchRequested,true);assert.equal(opened.windowObserved,true,opened.note);
      console.log('PASS: real File Explorer launch and native window verification');
      const {WebTools}=require('../src/main/web-tools');const found=await new WebTools().youtube('rubius');
      const browser=require('../src/main/agent-browser').createAgentBrowser();
      const result=await browser.play(found.items[0],AbortSignal.timeout(65000));
      assert.equal(result.opened,true);assert.equal(typeof result.playing,'boolean');
      const remote=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('youtube.com/watch'));
      assert.ok(remote);assert.equal(remote.webContents.getLastWebPreferences().nodeIntegration,false);
      const capture=path.resolve(__dirname,'..','captures','youtube-playback.png');fs.mkdirSync(path.dirname(capture),{recursive:true});fs.writeFileSync(capture,(await remote.webContents.capturePage()).toPNG());
      console.log(result.playing?'PASS: real latest Rubius upload playback verified by advancing video time':'OBSERVED: video page opened; playback blocked or not verified. '+result.note);
      browser.stop();
      const created=native.desktopApps().filter(a=>a.name==='explorer').flatMap(a=>a.handles).filter(handle=>!before.has(handle));native.requestClose(created);
      clearTimeout(limit);app.exit(0);return;
    }
    if (process.argv.includes('--settings-only') || process.argv.includes('--settings-pointer')) {
      // Settings checks must not unload models from the user's running Ollama server.
      require('../src/main/ollama').unload = async () => {};
      assert.equal(await js(`(() => {
        const canvas=document.querySelector('.panel__face canvas');
        return Boolean(canvas && canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some(value=>value>0));
      })()`),true,'Animated portrait loads and paints through the production app protocol');
      await js('host.openMenu()');
      let controls;
      for (let i=0;i<60;i++) {
        controls = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('settings.html'));
        if (controls && !controls.webContents.isLoading() && await controls.webContents.executeJavaScript('document.documentElement.dataset.settingsReady === "true"')) break;
        await pause(100);
      }
      assert.ok(controls);
      controls.show(); // Explicitly show after readiness, including hidden test-process launches.
      const run = source => controls.webContents.executeJavaScript(source);
      assert.equal(await run('document.documentElement.dataset.settingsReady'), 'true');
      assert.equal(await run('document.querySelector("main").dataset.page'),'home');
      if (process.argv.includes('--settings-pointer')) {
        await run('window.realClicks=0; document.addEventListener("pointerdown",event=>{if(event.isTrusted) window.realClicks++;})');
        console.log('READY: use real pointer input to select Appearance/Large and Sound/Mute.');
        for (let i=0;i<180;i++) {
          const cfg = await js('host.getConfig()');
          if (cfg.scale===0.8 && cfg.muted && await run('window.realClicks >= 4')) {
            console.log('PASS: real pointer clicks changed character size and mute with the content layout marker present.');
            clearTimeout(limit); app.exit(0); return;
          }
          await pause(500);
        }
        throw Error('Real pointer test did not complete.');
      }
      const mainErrors = [];
      controls.webContents.on('console-message', e => { if(e.level==='error') mainErrors.push(e.message); });
      assert.equal(controls.isMenuBarVisible(), false);
      assert.equal(await run('typeof window.host'), 'undefined', 'Settings window gets only its own narrow API');
      assert.equal(await js('typeof host.installHooks'), 'undefined');
      assert.equal(await js('typeof host.chatHandoff'), 'undefined');
      assert.equal((await js('host.getConfig()')).agentEnabled, true);
      assert.equal((await js('host.getConfig()')).desktopActions, true);
      const legacy = await fetch('http://127.0.0.1:47824/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hook_event_name:'Stop'})});
      assert.equal(legacy.status,404,'Legacy unauthenticated Claude events must no longer be accepted');
      await run("document.querySelector('[data-page=appearance]').click()");
      for (const key of ['idleAnimations','cursorInteractions','personality','dailyRoutine','surpriseAnimations']) {
        assert.equal(await run(`document.querySelector('[data-key=${key}]').checked`),true,`${key} defaults on`);
        await run(`document.querySelector('[data-key=${key}]').click()`);await pause(100);
        assert.equal((await js('host.getConfig()'))[key],false,`${key} saves through settings IPC`);
        await run(`document.querySelector('[data-key=${key}]').click()`);await pause(100);
        assert.equal((await js('host.getConfig()'))[key],true,`${key} restores`);
      }
      await run("document.querySelector('[data-scale=\"0.8\"]').click()"); await pause(200);
      assert.equal((await js('host.getConfig()')).scale,0.8);
      await run("document.querySelector('[data-page=sound]').click(); const el=document.querySelector('[data-key=volume]'); el.value='35'; el.dispatchEvent(new Event('change',{bubbles:true}))"); await pause(200);
      assert.equal((await js('host.getConfig()')).volume,0.35);
      await assert.rejects(run('settingsHost.patch({agentEnabled:false})'), /Unknown/);
      await assert.rejects(run('settingsHost.action("shell", "bad")'), /Unknown/);
      const captureDir = path.resolve(__dirname,'..','captures');fs.mkdirSync(captureDir,{recursive:true});
      for (const page of ['home','appearance','sound','memory','awareness','connections','updates']) {
        await run(`document.querySelector('[data-page=${page}]').click(); document.fonts.ready`);
        assert.equal(await run('document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth'),true, `Horizontal overflow on ${page}`);
        await pause(100);
        fs.writeFileSync(path.join(captureDir,`settings-${page}.png`),(await controls.webContents.capturePage()).toPNG());
      }
      assert.doesNotMatch(await run('document.body.innerText'), /Legacy Claude|Teleport|Play demo|Talk to her|Copy chat handoff|Allow app closing/);
      await run("document.querySelector('[data-page=home]').click()");
      let departures = 0;
      const departed = () => { departures++; };
      require('electron').ipcMain.on('gaming:animation-ready', departed);
      await run("document.querySelector('[data-action-switch=gaming]').click()");
      for (let i=0;i<30 && win.isVisible();i++) await pause(50);
      assert.equal((await js('host.getConfig()')).gamingMode,true); assert.equal(win.isVisible(),false);
      assert.equal(departures,1,'Renderer acknowledges the gaming departure before hiding');
      assert.equal(await js("document.querySelector('#capri').dataset.gamingTeleport"),'away');
      require('electron').ipcMain.removeListener('gaming:animation-ready', departed);
      assert.equal(controls.isVisible(),true,'Controls remain accessible while Capri is paused');
      await run("document.querySelector('[data-action-switch=gaming]').click()"); await pause(300);
      assert.equal((await js('host.getConfig()')).gamingMode,false); assert.equal(win.isVisible(),true);
      for(let i=0;i<30 && await js("document.querySelector('#capri').dataset.gamingTeleport !== 'returned'");i++) await pause(50);
      assert.equal(await js("document.querySelector('#capri').dataset.gamingTeleport"),'returned','Resume completes the teleport arrival');
      await run("document.querySelector('#close').click()"); await pause(100); assert.equal(controls.isVisible(),false);
      await js('host.openMenu()'); await pause(150); assert.equal(controls.isVisible(),true);
      win.webContents.send('capri:command',{name:'memory'});
      await pause(2300); // Let the opening listen pose finish.
      const gesture = async (text, expected) => {
        await js(`document.querySelector('.panel__input').value=${JSON.stringify(text)};document.querySelector('.panel__chat').requestSubmit()`);
        for (let i=0;i<80;i++) {
          if (await js(`document.querySelector('.panel__line').textContent.includes(${JSON.stringify(expected)})`)) return;
          await pause(50);
        }
        throw Error('Local companion command failed: '+text+' / '+await js("document.querySelector('.panel__line').textContent"));
      };
      await gesture('/actions','Try wave');
      await gesture('dance','ghost dance');
      await gesture('take a nap','quiet little nap');
      await gesture('wake up','I’m here');
      await gesture('how are you feeling','Feeling');
      assert.deepEqual(mainErrors,[]);
      console.log('PASS: custom control room, all seven sections, saved appearance/sound, narrow settings permissions, removed legacy controls, gaming pause/resume, close/reopen');
      console.log('CAPTURES:', captureDir);
      clearTimeout(limit); app.exit(0); return;
    }
    if (process.argv.includes('--agent-only')) {
      const route = text => js(`host.personalRoute(${JSON.stringify(text)})`);
      const ollama = require('../src/main/ollama');
      const { dialog } = require('electron');
      const apps = require('../src/main/apps');
      let accepted = false, closed = 0, inferred = 0;
      dialog.showMessageBox = async options => { assert.equal(options.defaultId, 0); return { response: accepted ? 1 : 0 }; };
      apps.list = async () => [{ process: 'notepad', name: 'notepad' }];
      apps.close = async () => { closed++; return { running: false }; };
      ollama.models = async () => ['qwen3.5:9b'];
      ollama.chat = async ({ messages, schema }) => {
        inferred++;
        assert.match(messages[0].content, /modifiable local Windows AI agent/);
        if (!schema) return 'I’m Capri, your local agent.';
        assert.match(messages[1].content, /observedAt/);
        return JSON.stringify({ kind: 'propose_close', app: 'notepad', message: 'Close Notepad?' });
      };
      assert.equal(JSON.parse((await route('/agent status')).text).model, 'qwen3.5:9b');
      await route('/agent think close notepad');
      let id = JSON.parse((await route('/agent status')).text).pending.id;
      assert.equal(closed, 0);
      assert.match((await route(`/agent approve ${id}`)).text, /Cancelled/);
      assert.equal(closed, 0);
      await route('/agent think close notepad');
      id = JSON.parse((await route('/agent status')).text).pending.id;
      accepted = true;
      assert.equal((await route(`/agent approve ${id}`)).text, 'App closed.');
      await route(`/agent approve ${id}`); assert.equal(closed, 1);
      assert.equal((await js('host.chatSend({id:707,messages:[{role:"system",content:"Capri"},{role:"user",content:"Who are you?"}]})')).ok, true);
      assert.equal(inferred, 3);
      ollama.chat = async (_request, _delta, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      await js("window.pendingAgentTest=host.personalRoute('/agent think suggest help'); true");
      for (let i=0;i<30 && !JSON.parse((await route('/agent status')).text).busy;i++) await pause(50);
      assert.equal(JSON.parse((await route('/agent status')).text).busy, true);
      await pause(100); // allow the bounded native snapshot to reach inference
      await js('host.chatStop(707)');
      await js('window.pendingAgentTest');
      assert.equal(JSON.parse((await route('/agent status')).text).busy, false);
      assert.equal(JSON.parse((await route('/agent status')).text).pending, null);
      // Observe the actual existing Capri instance through its shared prototype.
      await js(`(async () => {
        const { Capri } = await import('./js/capri.js');
        const original = Capri.prototype.setStance;
        Capri.prototype.setStance = function(...args) { const r=original.apply(this,args); window.sittingProbe={stance:this.stance,perch:this.perch}; return r; };
      })()`);
      await js('host.setConfig({windowTracking:true,agentEnabled:false,wander:false,possess:false})');
      const b = win.getBounds();
      const fixture = new BrowserWindow({ x: b.x+160, y:b.y+Math.round(b.height*0.55), width:720, height:300,
        show:false, title:'Capri perching regression fixture', backgroundColor:'#282239' });
      await fixture.loadURL('data:text/html,<body style="color:white;font:22px sans-serif">Capri window sitting test</body>');
      fixture.showInactive();
      await pause(700);
      const handle = fixture.getNativeWindowHandle().readBigUInt64LE(0);
      const rows = await js('host.windowsNow()');
      const row = rows.wins.find(w => w.id === Number(handle));
      assert.ok(row, 'Real native geometry watcher must find the test window');
      assert.equal(win.isAlwaysOnTop(), true);
      await js(`(async () => {const {Capri}=await import('./js/capri.js'); if(!Capri.prototype.canSit.call({scale:0.6,view:{h:innerHeight}},${JSON.stringify(row)})) throw Error('Test window not sittable');})()`);
      win.webContents.send('capri:command', { name:'act', act:'sit', pile:0 });
      await pause(2600);
      assert.equal((await js('window.sittingProbe')).stance, 'sit');
      const capture = path.resolve(__dirname,'..','captures','agent-window-sitting.png');
      fs.mkdirSync(path.dirname(capture),{recursive:true}); fs.writeFileSync(capture,(await win.webContents.capturePage()).toPNG());
      fixture.minimize(); await pause(1400);
      assert.notEqual((await js('window.sittingProbe')).stance, 'sit', 'Capri must leave a minimized window');
      fixture.destroy();
      console.log('PASS: main-process agent route, fresh registry/world state, native approval cancel/accept, replay rejection, actual overlay sitting and minimized-window departure');
      console.log('CAPTURE:',capture);
      clearTimeout(limit); app.exit(0); return;
    }
    if (process.argv.includes('--release-only')) {
      const native = require('../src/main/native-windows');
      const identity = await js('host.runtimeInfo()');
      assert.equal(identity.version, require('../package.json').version);
      assert.equal(identity.currentSource, true);
      assert.equal(identity.ollamaHost, require('../src/main/ollama').base());
      const seen = new Set(native.consoleWindows().map(row => row.hwnd));
      const appeared = [];
      const sample = () => {
        for (const row of native.consoleWindows()) {
          if (!seen.has(row.hwnd)) { seen.add(row.hwnd); appeared.push(row.className); }
        }
      };
      const timer = setInterval(sample, 40);
      try {
        win.webContents.send('capri:command', { name: 'chat' });
        for (let i = 0; i < 100 && !await js("document.querySelector('#panel').classList.contains('is-chat')"); i++) await pause(100);
        assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"), true);
        assert.match(await js("document.querySelector('.panel__tag').textContent"), /v0\.4\.0/);
        const submit = text => js(`document.querySelector('.panel__input').value=${JSON.stringify(text)}; document.querySelector('.panel__chat').requestSubmit();`);
        await submit('whats openned in my pc capri?');
        let answer;
        for (let i = 0; i < 100; i++) {
          await pause(100);
          answer = await js("({text:document.querySelector('.panel__line').textContent,busy:document.querySelector('.panel__input').disabled})");
          if (!answer.busy && /^(Open desktop apps|Running app processes|No matching apps)/.test(answer.text)) break;
        }
        assert.match(answer.text, /^(Open desktop apps|Running app processes|No matching apps)/);
        const capture = path.resolve(__dirname, '..', 'captures', 'verified-context.png');
        fs.mkdirSync(path.dirname(capture), { recursive: true });
        fs.writeFileSync(capture, (await win.webContents.capturePage()).toPNG());
        await submit('Say hello in one short sentence.');
        for (let i = 0; i < 120; i++) {
          await pause(500);
          answer = await js("({text:document.querySelector('.panel__line').textContent,busy:document.querySelector('.panel__input').disabled})");
          if (!answer.busy && answer.text) break;
        }
        assert.equal(answer.busy, false);
        assert.ok(answer.text.length > 0);
        assert.doesNotMatch(answer.text, /offline|failed|stopped|error/i);
        await pause(1000); sample();
        assert.deepEqual(appeared, [], 'A terminal window appeared during the real app reply');
        console.log(`PASS: release ${identity.version}, exact screenshot question in real chat UI, real local-model reply, zero visible terminal windows`);
        console.log('CAPTURE:', capture);
      } finally { clearInterval(timer); }
      clearTimeout(limit); app.exit(0); return;
    }
    if (process.argv.includes('--memory-only')) {
      const { dialog } = require('electron');
      let accept = false, confirmations = 0, modelCalls = 0;
      dialog.showMessageBox = async options => { confirmations++; assert.equal(options.defaultId, 0); return { response: accept ? 1 : 0 }; };
      const route = text => js(`host.personalRoute(${JSON.stringify(text)})`);
      const identity = await js('host.runtimeInfo()');
      assert.equal(identity.contextBackend, 'native-win32');
      assert.equal(identity.currentSource, true);
      assert.equal((await js('host.getConfig()')).privacy.allApps, true);
      const exactQuestion = await route('whats openned in my pc capri?');
      assert.equal(exactQuestion.handled, true);
      assert.match(exactQuestion.text, /^(Open desktop apps|Running app processes|No matching apps)/);
      await js('host.setConfig({privacy:{contextProcesses:false,contextEvents:false}})');
      assert.match((await route('capri which apps are open rn?')).text, /Running-app context is off/);
      assert.match((await route('remember I prefer coffee')).text, /off/);
      await js('host.setConfig({privacy:{memoryEnabled:true,memoryCandidates:true,memoryConfirmChanges:true}})');
      assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.CAPRIGPT_TEST_PROFILE, 'config.json'), 'utf8')).privacy.memoryEnabled, true);
      // Verify the native addon also loads inside Electron, with no shell fallback.
      if (process.platform === 'win32') {
        const native = require('../src/main/native-windows');
        const data = native.context({ contextProcesses: true, contextPower: true, processAllowlist: ['electron'] });
        assert.deepEqual(data.processes, ['electron']);
        assert.ok(data.power);
        assert.ok(Array.isArray(native.desktopApps()));
        assert.ok(Array.isArray(native.geometry(0).wins));
      }
      assert.match((await route('I prefer coffee')).text, /not saved/);
      accept = true;
      assert.match((await route('remember I prefer coffee')).text, /Saved memory #1/);
      assert.match((await route('edit memory 1: I prefer tea')).text, /Updated memory #1/);
      assert.match((await route('recall tea')).text, /I prefer tea/);
      assert.doesNotMatch((await route('recall coffee')).text, /I prefer coffee/);
      require('../src/main/ollama').chat = async ({ messages }) => {
        modelCalls++;
        assert.match(messages[0].content, /I prefer tea/);
        assert.doesNotMatch(messages[0].content, /I prefer coffee/);
        return 'Tea.';
      };
      assert.equal((await js('host.chatSend({id:900,messages:[{role:"system",content:"Persona"},{role:"user",content:"Which tea do I prefer?"}]})')).text, 'Tea.');
      assert.equal(modelCalls, 1);
      win.webContents.send('capri:command', { name: 'memory' });
      await pause(500);
      await js(`document.querySelector('.panel__input').value='/memory list'; document.querySelector('.panel__input').form.requestSubmit();`);
      await pause(300);
      assert.match(await js("document.querySelector('.panel__line').textContent"), /I prefer tea/);
      assert.equal(modelCalls, 1, 'Local command must bypass inference');
      const capture = path.resolve(__dirname, '..', 'captures', 'personal-memory.png');
      fs.mkdirSync(path.dirname(capture), { recursive: true });
      fs.writeFileSync(capture, (await win.webContents.capturePage()).toPNG());
      assert.match((await route('forget 1')).text, /Forgot/);
      assert.match((await route('recall tea')).text, /No matching/);
      assert.equal(confirmations, 4);
      console.log('PASS: Electron SQLite, confirmation gate, edit/recall/forget, prompt integration, offline UI and native Windows addon; no model inference');
      console.log('CAPTURE:', capture);
      clearTimeout(limit); app.exit(0); return;
    }
    if (process.argv.includes('--layout-only')) {
      const result = await js(`(async () => {
        const { Panel } = await import('./js/panel.js');
        const root = document.querySelector('#panel').cloneNode(true);
        const ticker = document.querySelector('#ticker').cloneNode(true);
        root.id = 'layout-test-panel'; ticker.id = 'layout-test-ticker';
        root.hidden = ticker.hidden = true;
        document.body.append(root, ticker);
        const panel = new Panel({panel: root, ticker, labels: {state: {work: 'CODEX', info: 'INFO'}}});
        panel.setAnchor({x: 100, y: 300, top: 180}, {w: innerWidth, h: innerHeight});
        const pause = ms => new Promise(r => setTimeout(r, ms));
        panel.tickerShownAt = performance.now();
        panel.setTicker({verb: 'CODEX', target: 'System32'});
        panel.say({kind: 'work', badge: 'CODEX', line: 'Codex is working.', hold: null});
        await pause(500);
        if (!ticker.hidden || root.hidden) throw Error('Delayed ticker overlaps the working message');
        panel.setTicker({verb: 'CODEX', target: 'Bash'});
        await pause(400);
        if (!ticker.hidden) throw Error('Tool update overlaps an open message');
        panel.hide();
        await pause(500);
        if (ticker.hidden || !root.hidden) throw Error('Ticker did not return after message dismissal');
        panel.setTicker(null);
        panel.tickerShownAt = performance.now();
        panel.setTicker({verb:'CODEX', target:'Queued update'});
        panel.suspend();
        await pause(500);
        panel.resume();
        await pause(500);
        if (ticker.hidden) throw Error('Ticker did not return after suspension');
        panel.say({kind:'work', badge:'CODEX', line:'Codex is working.', hold:null});
        await pause(500);
        if (!ticker.hidden) throw Error('Ticker overlaps the restored message');
        const r = root.getBoundingClientRect();
        return {x:Math.max(0,Math.floor(r.x)-14), y:Math.max(0,Math.floor(r.y)-14), width:Math.ceil(r.width)+28, height:Math.ceil(r.height)+28};
      })()`);
      const capture = path.resolve(__dirname, '..', 'captures', 'panel-layout-fixed.png');
      fs.mkdirSync(path.dirname(capture), { recursive: true });
      fs.writeFileSync(capture, (await win.webContents.capturePage(result)).toPNG());
      console.log('PASS: no message/ticker overlap during delayed updates, dismissal or suspension');
      console.log('CAPTURE:', capture);
      clearTimeout(limit); app.exit(0); return;
    }
    const hook = async (hook_event_name, extra = {}) => {
      const child = spawn('node', [path.resolve(__dirname, '../hooks/caprigpt-codex-hook.js'), '--test'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      const finished = once(child, 'exit');
      child.stdin.end(JSON.stringify({ hook_event_name, session_id: 'smoke-codex', turn_id: 'smoke-turn', cwd: 'C:/CapriGPT-test', ...extra }));
      assert.equal((await finished)[0], 0);
      assert.deepEqual(JSON.parse(stdout), {});
      await pause(200);
    };
    const waitForApproval = async () => {
      for (let i = 0; i < 50; i++) {
        const text = await js("document.querySelector('.panel__line').textContent");
        if (text.includes('Review it in Codex.') || text.includes('Revísala en Codex.')) return text;
        await pause(100);
      }
      throw new Error('Approval notification did not finish appearing');
    };
    await hook('UserPromptSubmit');
    await hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'NEVER_FORWARD_THIS' } });
    assert.notEqual(await js("document.querySelector('.panel__state').textContent"), 'CODEX · TEST', 'Routine work must not open a notification');
    if (process.argv.includes('--integration-only')) {
      await pause(700);
      const bounds = await js(`(() => {
        const r = document.querySelector('#sprite').getBoundingClientRect();
        const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
        return {x, y, width: Math.min(Math.ceil(r.width), innerWidth-x), height: Math.min(Math.ceil(r.height), innerHeight-y)};
      })()`);
      const capture = path.resolve(__dirname, '..', 'captures', 'quiet-focus.png');
      fs.mkdirSync(path.dirname(capture), { recursive: true });
      fs.writeFileSync(capture, (await win.webContents.capturePage(bounds)).toPNG());
    }
    // This is the same status handler used when clicking Capri.
    win.webContents.send('capri:command', { name: 'status' });
    await pause(900);
    assert.match(await js("document.querySelector('.panel__line').textContent"), /Codex is working|Codex está trabajando/);
    assert.equal(await js("document.querySelector('#panel').dataset.kind"), 'work');
    await hook('PermissionRequest', { tool_name: 'Bash' });
    const waiting = await js('host.integrationStatus()');
    assert.equal(waiting.sessions.at(-1).stage, 'waiting');
    assert.equal(waiting.lastSeen, null, 'Test events must not claim real Codex connection');
    assert.doesNotMatch(JSON.stringify(waiting), /NEVER_FORWARD_THIS/);
    assert.match(await waitForApproval(), /approval|aprobación/);
    assert.equal(await js("document.querySelector('.panel__actions').children.length"), 0, 'No approval button in Capri');
    const integrationCapture = path.resolve(__dirname, '..', 'captures', 'codex-notifications.png');
    fs.mkdirSync(path.dirname(integrationCapture), { recursive: true });
    fs.writeFileSync(integrationCapture, (await win.webContents.capturePage()).toPNG());
    await hook('PostToolUse', { tool_name: 'Bash', tool_response: { exit_code: 0 } });
    assert.equal(await js("document.querySelector('#panel').hidden"), true, 'Approval alert should clear once the tool resumes');
    await hook('Stop');
    if (process.argv.includes('--integration-only')) {
      console.log('PASS: quiet routine work, approval, resume and completion through the real hook bridge');
      clearTimeout(limit); app.exit(0); return;
    }
    const status = await js('host.chatStatus()');
    assert.equal(status.ok, true, JSON.stringify(status));
    await js("window.smokeDeltas = ''; host.onChatDelta(({text}) => { window.smokeDeltas += text; }); true");
    const disabled = await js('host.closeApp("test-nonexistent-app", false)');
    assert.match(disabled.error, /unavailable|protected/);
    // Open chat via the activity panel's Talk action, not a separate tray command.
    await pause(2800); // allow the earlier completion message's priority hold to expire
    await hook('UserPromptSubmit', { turn_id: 'chat-live' });
    win.webContents.send('capri:command', { name: 'status' });
    await pause(500);
    await js("document.querySelector('.panel__actions [data-id=\"talk\"]').click()");
    await pause(2000);
    assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"), true);
    assert.match(await js("document.querySelector('.panel__activity').textContent"), /Codex is working|Codex está trabajando/);
    await hook('Stop', { turn_id: 'chat-live' });
    assert.match(await js("document.querySelector('.panel__activity').textContent"), /no activity received|sin actividad recibida/, 'Test-only activity must not claim a real connection');
    assert.equal(await js("document.querySelector('#panel').classList.contains('is-chat')"), true, 'Completion must preserve the open chat');
    await js(`document.querySelector('.panel__input').value = 'Who are you working with now, and can you see their tasks yet?';
      document.querySelector('.panel__chat').requestSubmit();`);
    assert.equal(await js("document.querySelector('.panel__quote').textContent"), 'Who are you working with now, and can you see their tasks yet?');
    let reply = '';
    for (let i = 0; i < 120; i++) {
      await pause(500);
      const state = await js(`({reply: document.querySelector('.panel__line').innerText, busy: document.querySelector('.panel__input').disabled})`);
      if (state.reply && !state.busy) { reply = state.reply; break; }
    }
    assert.ok(reply.length > 0, 'No answer in the renderer');
    assert.ok((await js('window.smokeDeltas')).length > 0, 'No streamed model output received');
    assert.doesNotMatch(reply, /Claude/i, 'Unexpected legacy branding in her introduction');
    console.log('RENDERER_REPLY:', reply);
    const capture = path.resolve(__dirname, '..', 'captures', 'local-chat.png');
    fs.mkdirSync(path.dirname(capture), { recursive: true });
    fs.writeFileSync(capture, (await win.webContents.capturePage()).toPNG());
    // Exercise the production custom control room, including the gaming action.
    await js('host.openMenu()'); await pause(300);
    const controls = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings.html'));
    assert.ok(controls);
    const gaming = { click: item => controls.webContents.executeJavaScript(`settingsHost.action('gaming', ${item.checked})`) };
    await js(`window.smokePending = host.chatSend({id: 98, messages: [{role:'user', content:'Write a long story.'}]}); true`);
    await pause(250);
    await gaming.click({ checked: true });
    const cancelled = await js('window.smokePending');
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.error, 'stopped');
    assert.equal(win.isVisible(), false);
    assert.equal((await js('host.startOllama()')).ok, false, 'Gaming mode must block starting Ollama');
    const paused = await js('host.chatSend({id: 99, messages: [{role:"user",content:"hi"}]})');
    assert.match(paused.error, /Gaming mode/);
    const loaded = await (await fetch(`${require('../src/main/ollama').base()}/api/ps`)).json();
    assert.equal(loaded.models.some((m) => m.name === status.model), false, 'Model still loaded');
    await hook('PermissionRequest', { turn_id: 'paused-turn', tool_name: 'Bash' });
    assert.equal(win.isVisible(), false, 'Notification must not reveal Capri during gaming');
    await gaming.click({ checked: false });
    assert.equal(win.isVisible(), true);
    assert.match(await waitForApproval(), /approval|aprobación/, 'Outstanding approval should be visible after resume');
    await hook('Interrupt', { turn_id: 'paused-turn' });
    console.log('PASS: Codex hook-to-renderer notifications, no approvals, custom settings, local chat, gaming cancellation/unload/resume');
    console.log('CAPTURE:', capture);
    clearTimeout(limit);
    app.exit(0);
  } catch (error) { console.error(error); clearTimeout(limit); app.exit(1); }
});
