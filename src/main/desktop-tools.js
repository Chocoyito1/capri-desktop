'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {publicUrl}=require('./web-tools');
async function launchBrowser(file,url) {
  await new Promise((resolve,reject)=>{
    const child=spawn(file,[url],{shell:false,windowsHide:true,detached:true,stdio:'ignore'});
    child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
  });
}
const normalize=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const BUILTINS={
  explorer:{label:'File Explorer',file:'explorer.exe',process:'explorer',aliases:['fileexplorer','explorer','exploradordearchivos']},
  notepad:{label:'Notepad',file:'System32/notepad.exe',process:'notepad',aliases:['notepad','blocdenotas']},
  calculator:{label:'Calculator',file:'System32/calc.exe',process:'calculatorapp',aliases:['calculator','calculadora','calc']},
  paint:{label:'Paint',file:'System32/mspaint.exe',process:'mspaint',aliases:['paint','mspaint']},
};
const APP_ALIASES=[['firefox','mozillafirefox'],['chrome','googlechrome'],['edge','microsoftedge'],['vscode','visualstudiocode']];
function distance(a,b) {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return row[b.length];
}
function standardExecutables() {
  const apps=[['Google Chrome','Google/Chrome/Application/chrome.exe'],['Firefox','Mozilla Firefox/firefox.exe'],
    ['Microsoft Edge','Microsoft/Edge/Application/msedge.exe'],['Brave','BraveSoftware/Brave-Browser/Application/brave.exe']];
  return [process.env.LOCALAPPDATA,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)
    .flatMap(root=>apps.map(([label,relative])=>({label,file:path.resolve(root,relative),source:'verified standard installation'})))
    .filter(app=>fs.existsSync(app.file));
}
function installedShortcuts() {
  const roots=[process.env.APPDATA&&path.join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs'),
    process.env.ProgramData&&path.join(process.env.ProgramData,'Microsoft/Windows/Start Menu/Programs')].filter(Boolean);
  const rows=[];
  function walk(folder,root,depth=0) {
    if(depth>6||rows.length>=1000)return;
    let entries;try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return;}
    for(const entry of entries) {
      if(entry.isSymbolicLink())continue;
      const file=path.join(folder,entry.name);
      if(entry.isDirectory()){walk(file,root,depth+1);continue;}
      if(!entry.isFile()||path.extname(entry.name).toLowerCase()!=='.lnk')continue;
      const label=path.basename(entry.name,'.lnk');
      if(/uninstall|desinstal|powershell|command prompt|terminal|registry|regedit|reset|restore|cleanup|update|installer|setup|capri/i.test(label))continue;
      let real;try{real=fs.realpathSync(file);}catch{continue;}
      if(!real.toLowerCase().startsWith(root.toLowerCase()+path.sep))continue;
      rows.push({label:label.slice(0,100),file:real,id:crypto.createHash('sha256').update(real).digest('hex').slice(0,12)});
    }
  }
  for(const root of roots){
    let real;try{real=fs.existsSync(root)?fs.realpathSync(root):root;}catch{continue;}
    walk(root,real);
  }
  // Windows may install a per-user and a machine-wide shortcut with the same
  // name. Prefer the per-user one, matching Start menu precedence.
  return [...rows.reduce((map,row)=>{if(!map.has(normalize(row.label)))map.set(normalize(row.label),row);return map;},new Map()).values()];
}
class DesktopTools {
  constructor({openPath, openExternal, launch=launchBrowser, native, shortcuts=installedShortcuts, executables=standardExecutables, systemRoot=process.env.SystemRoot||'C:\\Windows',now=Date.now,cacheMs=30000}) { Object.assign(this,{openPath,openExternal,launch,native,shortcuts,executables,systemRoot,now,cacheMs}); }
  entries({fresh=false}={}) {
    const at=this.now();
    if(!fresh&&this.cached&&at-this.cached.at<this.cacheMs)return this.cached.rows;
    this.cached=null;
    const rows=[...this.shortcuts().map(app=>({...app,source:'Windows Start menu shortcut'})),...this.executables()];
    const result=[...rows.reduce((map,row)=>{const key=(APP_ALIASES.find(group=>group.includes(normalize(row.label)))||[normalize(row.label)])[0];if(!map.has(key))map.set(key,row);return map;},new Map()).values()];
    this.cached={at,rows:result};
    return result;
  }
  catalog(){return [...new Set([...Object.values(BUILTINS).map(app=>app.label),...this.entries().map(app=>app.label)])].slice(0,80);}
  evidence() {
    try{return {available:true,checkedAt:new Date(this.now()).toISOString(),apps:this.catalog(),exhaustive:false,
      sources:['Windows built-ins','Start menu shortcuts','verified standard browser installations'],
      latestLookup:this.lastLookup||null,note:'Positive launch entries only. Missing names are not proof of an uninstalled app.'};}
    catch{return {available:false,note:'App discovery is unavailable; do not claim apps are absent.'};}
  }
  resolve(query,{record=false}={}) {
    if(typeof query!=='string'||query.length>120||/[\\/:]|--|[\r\n]/.test(query))return {status:'invalid',candidates:[]};
    const clean=query.trim().replace(/(?:\s+(?:please|pls|plz|por favor))?[.!?]*$/i,'').replace(/^["“']|["”']$/g,'');
    const key=normalize(clean);if(!key)return {status:'invalid',candidates:[]};
    const builtin=Object.values(BUILTINS).find(app=>app.aliases.includes(key));
    let result;
    if(builtin)result={status:'found',target:{...builtin,file:path.resolve(this.systemRoot,builtin.file),source:'Windows built-in'}};
    else {
      const names=new Set(APP_ALIASES.find(group=>group.includes(key))||[key]);
      try {
        const rows=this.entries({fresh:record});const exact=rows.filter(app=>names.has(normalize(app.label)));
        const suggested=record&&key.length>=4?rows.filter(app=>{
          const label=normalize(app.label),aliases=APP_ALIASES.find(group=>group.includes(label))||[label];
          return aliases.some(name=>name.includes(key)||distance(name,key)<=2);
        }):[];
        result=exact.length===1?{status:'found',target:exact[0]}:{status:exact.length?'ambiguous':'not-found',candidates:(exact.length?exact:suggested).map(app=>app.label).slice(0,8)};
      }catch{result={status:'unavailable',candidates:[]};}
    }
    if(record)this.lastLookup={query:clean.slice(0,100),status:result.status,candidates:result.target?[result.target.label]:result.candidates,checkedAt:new Date(this.now()).toISOString()};
    return result;
  }
  matchName(query) {
    const result=this.resolve(query);return result.status==='found'?result.target.label:null;
  }
  async openUrl(value,browser='default',signal) {
    const url=publicUrl(value);signal?.throwIfAborted();
    let label='your default browser';
    if(!browser||browser==='default') {
      if(!this.openExternal)throw Error('The default browser launcher is unavailable.');
      await this.openExternal(url);
    } else {
      const key=normalize(browser);
      const group=APP_ALIASES.find(names=>names.includes(key))||[key];
      const executable=this.executables().find(row=>group.includes(normalize(row.label))
        &&/^(?:firefox|chrome|msedge|brave|opera|vivaldi)\.exe$/i.test(path.basename(row.file)));
      if(!executable)throw Error(`I couldn’t find a verified browser executable for “${browser}”. Give me another installed browser or choose the default browser.`);
      label=executable.label;
      signal?.throwIfAborted();await this.launch(executable.file,url);
    }
    signal?.throwIfAborted();
    return {type:'website',title:url,browser:label,launchRequested:true,
      note:`Sent ${url} to ${label}. Page loading, sign-in and playback have not been verified.`};
  }
  async open(query,signal) {
    if(typeof query!=='string'||/[\\/:]|--|[\r\n]/.test(query))throw Error('Use an app name, without commands or file paths.');
    signal?.throwIfAborted();const lookup=this.resolve(query,{record:true});
    if(lookup.status!=='found') {
      const message=lookup.status==='unavailable'?'App discovery is unavailable right now. I can’t determine whether that app is installed.':lookup.status==='ambiguous'?'More than one launch entry matched. Which one did you mean?':`I couldn’t find a launch entry for “${query}” in the places I checked. That does not prove it isn’t installed.`;
      const error=Error(message);error.code='APP_LOOKUP_'+lookup.status.toUpperCase();error.candidates=lookup.candidates;throw error;
    }
    const target=lookup.target,builtin=Object.values(BUILTINS).find(app=>app.label===target.label);
    signal?.throwIfAborted();const error=await this.openPath(target.file);
    signal?.throwIfAborted();if(error)throw Error(error);
    // Observe visible windows for both builtins and installed shortcuts. This
    // confirms the app is visible, not that a new window or tab was created.
    let observed=false;
    const expected=new Set([normalize(target.label),...(APP_ALIASES.find(group=>group.includes(normalize(target.label)))||[]),...(builtin?[builtin.process]:[])]);
    try {
      for(let i=0;i<6;i++) {
        signal?.throwIfAborted();
        const rows=this.native.desktopApps();
        observed=rows.some(row=>expected.has(normalize(row.name))||row.label&&expected.has(normalize(row.label))||builtin?.process==='calculatorapp'&&row.name==='calculator');
        if(observed)break;await new Promise(resolve=>setTimeout(resolve,250));
      }
    }catch(error){signal?.throwIfAborted();/* Launch was accepted; observation can be unavailable. */}
    return {type:'app',title:target.label,launchRequested:true,windowObserved:observed,
      note:observed?`${target.label} has a visible desktop window.`:`Windows accepted the request to launch ${target.label}; its window has not been verified.`};
  }
}
module.exports={DesktopTools,installedShortcuts,standardExecutables,BUILTINS};
