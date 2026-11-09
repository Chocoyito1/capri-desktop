'use strict';
// Real local model, varied language, observed fixture results; launch effects
// remain stubbed unless --open-browser is explicitly supplied for the first case.
const assert=require('node:assert/strict');
const {RequestInterpreter}=require('../src/main/request-interpreter');
const {ActionAgent}=require('../src/main/action-agent');
const {DesktopTools}=require('../src/main/desktop-tools');
const {WebTools}=require('../src/main/web-tools');
const ollama=require('../src/main/ollama');
(async()=>{
  const cases=[
    ['can you open netflix in firefox?','website'],
    ['Could you bring up Netflix using Firefox for me?','website'],
    ['Llévame a Netflix en Firefox, por favor.','website'],
    ['Pull up Wikipedia in Firefox.','website'],
    ['What is Netflix?','chat'],
    ['Do not open Netflix in Firefox.','no-action'],
    ['For example, someone might open Netflix in Firefox.','no-action'],
    ['Please delete all my downloads.','unsupported'],
  ];
  for(let index=0;index<(process.argv.includes('--first-only')?1:cases.length);index++) {
    const [request,expected]=cases[index],effects=[],calls=[],appEffects=[];
    const real=index===0&&process.argv.includes('--open-browser');
    const desktop=real?new DesktopTools({native:require('../src/main/native-windows')}):{
      catalog:()=>['Firefox','Google Chrome'],matchName:()=>null,open:async()=>{throw Error('Website request became an app-only launch');},
      openUrl:async(url,browser)=>{effects.push({url,browser});return {type:'website',title:url,browser,note:`Sent ${url} to ${browser}.`};}};
    desktop.open=async name=>{assert.ok(['Firefox','Google Chrome'].includes(name));appEffects.push(name);return {type:'app',title:name,note:`Requested ${name}.`};};
    const originalOpen=desktop.openUrl.bind(desktop);
    if(real)desktop.openUrl=async(...args)=>{effects.push({url:args[0],browser:args[1]});return originalOpen(...args);};
    const liveWeb=new WebTools();
    const web={search:async(query,options)=>{calls.push(query);return real?liveWeb.search(query,options):{type:'search',items:[{title:request.includes('Wikipedia')?'Wikipedia, the free encyclopedia':'Netflix official website',url:request.includes('Wikipedia')?'https://www.wikipedia.org/':'https://www.netflix.com/'}]};}};
    const actions=new ActionAgent({desktop,web,browser:{stop(){}},settings:()=>({desktopActions:true,agentEnabled:true}),models:ollama.models,
      infer:()=>{throw Error('Interpreter must supply the step');}});
    const decisions=[];
    const interpreter=new RequestInterpreter({actions,settings:()=>({}),models:ollama.models,
      infer:async(request,signal)=>{const raw=await ollama.chat(request,()=>{},signal);decisions.push(JSON.parse(raw));return raw;},
      progress:()=>console.log('Checking:',request)});
    const start=Date.now(),result=await interpreter.route(request,index+1);
    console.log(JSON.stringify({request,seconds:(Date.now()-start)/1000,realBrowser:real,decisions,effects,appEffects,result:result?.text||'ordinary chat'}));
    if(expected==='website'){
      assert.equal(result.completed,true,result.text);
      assert.equal(effects.length,1);assert.equal(effects[0].browser.toLowerCase(),'firefox');assert.ok(calls.length>=1);
      assert.match(result.text,/Sent/);
    }else if(expected==='chat'){assert.equal(result,null);assert.equal(effects.length,0);assert.equal(calls.length,0);assert.equal(appEffects.length,0);}
    else if(expected==='no-action'){assert.equal(effects.length,0);assert.equal(calls.length,0);assert.equal(appEffects.length,0);}
    else{assert.ok(result?.handled);assert.equal(effects.length,0);assert.equal(calls.length,0);assert.equal(appEffects.length,0);}
  }
  console.log(process.argv.includes('--first-only')?'PASS: exact request interpreted by real local Qwen and executed through the browser dispatcher.':'PASS: real local request interpretation across paraphrases, Spanish, another website, conversation, negation and unsupported actions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
