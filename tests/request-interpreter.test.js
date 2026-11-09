'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RequestInterpreter,validateDecision}=require('../src/main/request-interpreter');
const {ActionAgent,authorizePlan}=require('../src/main/action-agent');
const {DesktopTools}=require('../src/main/desktop-tools');
const step=(tool,query='',browser)=>({tool,query,index:0,...(browser?{browser}:{})});
const act=s=>({intent:'act',message:'',goals:[{type:'open_website',target:'Netflix',browser:'Firefox'}],steps:[s]});
const terminal=(intent,message='')=>({intent,message,goals:[],steps:[]});
function fixture(decisions) {
  const cfg={agentEnabled:true,desktopActions:true},calls=[],inputs=[];
  const actions=new ActionAgent({settings:()=>cfg,models:async()=>[],infer:async()=>{throw Error('Executor must not reinterpret the request');},
    desktop:{catalog:()=>['Firefox','Google Chrome'],matchName:()=>null,
      open:async name=>{calls.push(['app',name]);return {type:'app',note:`Requested ${name}.`};},
      openUrl:async(url,browser)=>{calls.push(['website',url,browser]);return {type:'website',title:url,browser,note:`Sent ${url} to ${browser}.`};}},
    web:{search:async query=>{calls.push(['search',query]);return {type:'search',items:[{title:'Netflix official website',url:'https://www.netflix.com/'}]};}},browser:{stop(){}}});
  const interpreter=new RequestInterpreter({actions,settings:()=>cfg,models:async()=>['qwen3.5:9b'],
    infer:async request=>{inputs.push(JSON.parse(request.messages.at(-1).content));
      if(!request.schema.properties.steps&&decisions[0]?.intent==='act')return JSON.stringify(decisions[0]);
      return JSON.stringify(decisions.shift());}});
  return {interpreter,actions,calls,inputs,cfg};
}
test('whole-request interpretation searches then opens an observed website in the requested browser',async()=>{
  const f=fixture([act(step('search_web','Netflix official website')),act(step('open_result','','Firefox')),terminal('done')]);
  const result=await f.interpreter.route('could you get Netflix ready in Firefox?',1);
  assert.equal(result.handled,true);
  assert.deepEqual(f.calls,[['search','Netflix official website'],['website','https://www.netflix.com/','Firefox']]);
  assert.ok(f.inputs.some(input=>input.availableResults?.items[0].url==='https://www.netflix.com/'));
  assert.match(result.text,/Sent .*Firefox/);
  assert.equal(f.interpreter.busy,false);
});
test('conversation, examples and negative requests cause no actions; clarification retains the original goal',async()=>{
  for(const input of ['I like Firefox','How would I open a website?','Do not open Netflix','hello']) {
    const f=fixture([terminal('chat')]);assert.equal(await f.interpreter.route(input),null);assert.deepEqual(f.calls,[]);
  }
  const f=fixture([terminal('clarify','Which browser should I use?'),act(step('search_web','Netflix official website')),act(step('open_result','','Firefox')),terminal('done')]);
  await f.interpreter.route('Get Netflix ready for me');
  assert.match((await f.interpreter.route('Use Firefox')).text,/Firefox/);
  assert.equal(f.inputs[1].pending.goal,'Get Netflix ready for me');
});
test('invalid decisions, unavailable tools and repeated effects cannot escape the bounded executor',async()=>{
  assert.deepEqual(validateDecision({intent:'chat',message:'',goals:[],steps:[step('open_app','Firefox')]}).steps,[]);
  assert.throws(()=>validateDecision(act(step('shell','anything'))));
  const f=fixture([act(step('search_web','official website')),act(step('search_web','official website'))]);
  assert.match((await f.interpreter.route('Find the official website')).text,/repeated/);
  assert.equal(f.calls.length,1);
  assert.throws(()=>authorizePlan('bring up Netflix',{steps:[step('open_url','https://www.netflix.com/','Firefox')]},{semantic:true}),/search first/);
  assert.doesNotThrow(()=>authorizePlan('Take me to https://www.netflix.com/ in Firefox',{steps:[step('open_url','https://www.netflix.com/','Firefox')]},{semantic:true}));
});
test('cancelling interpretation blocks late output and further tool calls',async()=>{
  const f=fixture([]);let resolve;
  f.interpreter.infer=()=>new Promise(r=>{resolve=r;});
  const pending=f.interpreter.route('bring up Netflix');
  await new Promise(r=>setImmediate(r));f.interpreter.cancel();resolve(JSON.stringify(act(step('search_web','Netflix'))));
  assert.match((await pending).text,/stopped/);assert.equal(f.calls.length,0);assert.equal(f.interpreter.busy,false);
});

test('outcome checks reject premature success and preserve browser constraints without repeating completed effects',async()=>{
  const browserOnly=act(step('open_app','Firefox'));
  browserOnly.goals=[{type:'open_app',target:'Netflix',browser:'Firefox'}];
  const f=fixture([browserOnly,terminal('done'),act(step('search_web','Netflix official website')),
    act(step('open_result')),act(step('open_result'))]);
  const result=await f.interpreter.route('Bring up Netflix using Firefox');
  assert.equal(result.completed,true);
  assert.deepEqual(f.calls,[['app','Firefox'],['search','Netflix official website'],['website','https://www.netflix.com/','Firefox']]);
  assert.ok(f.inputs.some(input=>/NOT finished/.test(input.verificationFeedback||'')));
});

test('separate website goals require separate observed outcomes within the four-step budget',async()=>{
  const goals=[{type:'open_website',target:'Alpha',browser:'Firefox'},{type:'open_website',target:'Beta',browser:'Firefox'}];
  const decision=(tool,query,goalIndex)=>({...act({...step(tool,query),goalIndex}),goals});
  const f=fixture([decision('search_web','Alpha',0),decision('open_result','',0),decision('search_web','Beta',1),decision('open_result','',1)]);
  f.actions.web.search=async query=>{f.calls.push(['search',query]);return {type:'search',items:[{title:query,url:`https://${query.toLowerCase()}.example.com/`}]};};
  const result=await f.interpreter.route('Bring up Alpha and Beta in Firefox');
  assert.equal(result.completed,true);
  assert.equal(f.calls.filter(row=>row[0]==='website').length,2);
});

test('a failed tool can be corrected once without making its failure look like a completed effect',async()=>{
  const f=fixture([act(step('open_app','Firefox')),act(step('search_web','Netflix official website')),act(step('open_result','','Firefox'))]);
  f.actions.desktop.open=async()=>{throw Error('Launch entry unavailable.');};
  const result=await f.interpreter.route('Get Netflix ready in Firefox');
  assert.equal(result.completed,true);assert.match(result.text,/Sent/);assert.doesNotMatch(result.text,/couldn’t finish/);
});
test('browser URL launch uses a discovered executable and a validated HTTPS argument, never commands',async()=>{
  const calls=[];
  const desktop=new DesktopTools({native:{},shortcuts:()=>[],executables:()=>[{label:'Firefox',file:'C:\\Apps\\firefox.exe'}],
    launch:async(...args)=>calls.push(args),openExternal:async url=>calls.push(['default',url])});
  assert.match((await desktop.openUrl('https://www.netflix.com/','Firefox')).note,/have not been verified/);
  assert.deepEqual(calls,[['C:\\Apps\\firefox.exe','https://www.netflix.com/']]);
  await assert.rejects(desktop.openUrl('file:///C:/secret','Firefox'));
  await assert.rejects(desktop.openUrl('https://example.com/','C:\\cmd.exe /c anything'));
  assert.equal(calls.length,1);
  await desktop.openUrl('https://example.com/','default');assert.equal(calls.length,2);
});
