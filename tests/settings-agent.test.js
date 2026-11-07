'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SettingsAgent}=require('../src/main/settings-agent');

function fixture(plan) {
  const effects=[];
  const agent=new SettingsAgent({state:()=>({config:{gamingMode:false,volume:0.7},displays:[{id:7}]}),
    patch:value=>effects.push(['patch',value]),action:async(...args)=>effects.push(args),
    open:()=>effects.push(['open']),infer:async()=>JSON.stringify(plan)});
  return {agent,effects};
}
test('direct gaming commands use real pause control without inference, including when models are offline',async()=>{
  const f=fixture();f.agent.infer=()=>{throw Error('offline');};
  for(const text of ['activate game mode','Capri, enable gaming mode','can you turn on game mode?']) {
    assert.equal((await f.agent.route(text)).handled,true);
    assert.deepEqual(f.effects.pop(),['gaming',true]);
  }
  await f.agent.route('exit gaming mode');assert.deepEqual(f.effects.pop(),['gaming',false]);
  await f.agent.route('open your settings');assert.deepEqual(f.effects.pop(),['open']);
});
test('natural preferences pass the control room validator before mutation',async()=>{
  const f=fixture({intent:'change',patch:JSON.stringify({volume:0.3,privacy:{memoryRecall:false}}),action:'',value:false});
  assert.equal((await f.agent.route('lower your volume to 30% and disable memory recall')).handled,true);
  assert.deepEqual(f.effects,[['patch',{volume:0.3,privacy:{memoryRecall:false}}]]);
});
test('invalid, mixed and unavailable preferences never execute or claim success',async()=>{
  for(const plan of [
    {patch:'{"volume":100}',action:'',value:false},
    {patch:'{"desktopActions":false}',action:'',value:false},
    {patch:'{"displayId":99}',action:'',value:false},
    {patch:'{}',action:'quit',value:true},
    {patch:'{"muted":true}',action:'gaming',value:true},
    {patch:'{}',action:'gaming',value:'true'},
  ]) {
    const f=fixture({intent:'change',...plan});
    assert.match((await f.agent.route('change your settings')).text,/couldn’t/);
    assert.deepEqual(f.effects,[]);
  }
  const f=fixture({intent:'change',patch:'{}',action:'gaming',value:true});
  f.agent.action=async()=>{throw Error('failed');};
  await assert.rejects(f.agent.route('activate game mode'),/failed/);
});

test('game pause resets on a fresh config load while other preferences survive',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  let saved={gamingMode:true,volume:0.3,muted:true,scale:0.8,privacy:{memoryEnabled:false}};
  const boot=()=>{
    const module={exports:{}};
    const fakeFs={readFileSync:()=>JSON.stringify(saved),writeFileSync:(_file,text)=>{saved=JSON.parse(text);},mkdirSync(){}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/config.js'),'utf8'),{module,console,
      require:name=>name==='electron'?{app:{getPath:()=>'/profile'}}:name==='node:fs'?fakeFs:name==='node:path'?path:require('../src/main/settings-migration')});
    return module.exports;
  };
  const first=boot();
  assert.equal(first.load().gamingMode,false);assert.equal(saved.gamingMode,false);
  first.save({gamingMode:true});assert.equal(first.load().gamingMode,true);
  const next=boot().load();assert.equal(next.gamingMode,false);
  assert.equal(next.volume,0.3);assert.equal(next.muted,true);assert.equal(next.scale,0.8);assert.equal(next.privacy.memoryEnabled,false);
});
test('conversation and hypothetical or negated settings requests do not mutate',async()=>{
  const f=fixture({intent:'chat'});
  for(const text of ['Hello','What is the volume of a sphere?','Do not activate game mode','What if I activate game mode?','change Firefox settings']) {
    assert.equal(await f.agent.route(text),null);
  }
  assert.deepEqual(f.effects,[]);
});

test('closing chat while interpreting settings blocks a late change',async()=>{
  const f=fixture();let finish;
  f.agent.infer=()=>new Promise(resolve=>{finish=resolve;});
  const pending=f.agent.route('mute your sounds');
  f.agent.cancel();
  finish(JSON.stringify({intent:'change',patch:'{"muted":true}',action:'',value:false}));
  assert.match((await pending).text,/stopped/);assert.deepEqual(f.effects,[]);
});
