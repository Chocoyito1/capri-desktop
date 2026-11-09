'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {execFile}=require('node:child_process');

// Official whisper.cpp build, multilingual large-v3-turbo and Silero VAD.
const ASSETS=[
  {name:'whisper.zip',bytes:8928640,hash:'6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
    url:'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip'},
  {name:'ggml-large-v3-turbo-q5_0.bin',bytes:574041195,hash:'394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'},
  {name:'ggml-silero-v6.2.0.bin',bytes:885098,hash:'2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
    url:'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'},
];
const CUDA={name:'whisper-cuda.zip',bytes:684913404,hash:'afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a',
  url:'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cuda-12.4.0-x64.zip'};
const VERSION='whisper-b5454-large-v3-turbo-q5_0';
const installs=new Map();
function findServer(dir){
  if(!fs.existsSync(dir))return null;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isFile()&&entry.name==='whisper-server.exe')return file;
    if(entry.isDirectory()){const found=findServer(file);if(found)return found;}
  }
  return null;
}
function installed(root){
  const dir=path.join(root,VERSION),manifest=path.join(dir,'installed.json');
  try{
    const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
    if(data.version!==VERSION)return null;
    for(const asset of ASSETS.slice(1))if(fs.statSync(path.join(dir,asset.name)).size!==asset.bytes)return null;
    const cpuServer=findServer(path.join(dir,'bin')),gpuServer=findServer(path.join(dir,'bin-cuda'));
    return cpuServer?{server:gpuServer||cpuServer,cpuServer,gpu:Boolean(gpuServer),model:path.join(dir,ASSETS[1].name),vad:path.join(dir,ASSETS[2].name),version:VERSION}:null;
  }catch{return null;}
}
async function download(asset,dir,onProgress){
  const target=path.join(dir,asset.name),part=target+'.part';
  if(fs.existsSync(target)&&fs.statSync(target).size===asset.bytes){
    const hash=crypto.createHash('sha256');
    for await(const chunk of fs.createReadStream(target))hash.update(chunk);
    if(hash.digest('hex')===asset.hash)return;
  }
  const response=await fetch(asset.url,{signal:AbortSignal.timeout(10*60*1000)});
  if(!response.ok||!response.body)throw Error('speech-download-failed');
  const hash=crypto.createHash('sha256');let bytes=0,last=0;
  const check=new Transform({transform(chunk,encoding,done){
    bytes+=chunk.length;hash.update(chunk);
    if(bytes>asset.bytes){done(Error('speech-download-failed'));return;}
    if(Date.now()-last>500){last=Date.now();onProgress?.({asset:asset.name,percent:Math.floor(bytes/asset.bytes*100)});}
    done(null,chunk);
  }});
  try{
    await pipeline(Readable.fromWeb(response.body),check,fs.createWriteStream(part));
    if(bytes!==asset.bytes||hash.digest('hex')!==asset.hash)throw Error('speech-download-failed');
    await fs.promises.rename(part,target);
  }catch(error){await fs.promises.rm(part,{force:true});throw error;}
}
// Extract the hash-verified runtime in a separate process, keeping large CUDA
// archives out of the Electron main process's heap and event loop.
async function unpack(archive,bin,{run=execFile,systemRoot=process.env.SystemRoot||'C:\\Windows'}={}){
  await fs.promises.mkdir(bin,{recursive:true});
  const tar=path.join(systemRoot,'System32','tar.exe');
  await new Promise((resolve,reject)=>run(tar,['-xf',archive,'-C',bin],{windowsHide:true,timeout:15*60*1000},
    error=>error?reject(Error('speech-download-failed')):resolve()));
}
async function ensureRuntime(root,onProgress,{gpu=false}={}){
  const ready=installed(root);if(ready&&(!gpu||ready.gpu))return ready;
  if(installs.has(root)){await installs.get(root);return ensureRuntime(root,onProgress,{gpu});}
  const work=(async()=>{
    const dir=path.join(root,VERSION);await fs.promises.mkdir(dir,{recursive:true});
    if(!ready){for(const asset of ASSETS)await download(asset,dir,onProgress);await unpack(path.join(dir,'whisper.zip'),path.resolve(dir,'bin'));}
    if(gpu){await download(CUDA,dir,onProgress);await unpack(path.join(dir,CUDA.name),path.resolve(dir,'bin-cuda'));}
    await fs.promises.writeFile(path.join(dir,'installed.json'),JSON.stringify({version:VERSION,assets:ASSETS.map(({name,hash})=>({name,sha256:hash}))},null,2));
    const result=installed(root);if(!result)throw Error('speech-unavailable');return result;
  })();
  installs.set(root,work);
  try{return await work;}finally{installs.delete(root);}
}
module.exports={ensureRuntime,installed,unpack,ASSETS,CUDA,VERSION};
