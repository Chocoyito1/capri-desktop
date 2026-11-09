export class MicrophoneCapture {
  async start(onSamples,onEnded=()=>{}){
    const epoch=(this.epoch||0)+1;this.epoch=epoch;
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(this.epoch!==epoch){stream.getTracks().forEach(track=>track.stop());return;}
    this.stream=stream;
    stream.getAudioTracks?.().forEach(track=>track.addEventListener('ended',()=>{if(this.epoch===epoch)onEnded();}));
    try{
      const context=new AudioContext({sampleRate:16000});this.context=context;
      if(context.sampleRate!==16000)throw Error('microphone-unavailable');
      await context.audioWorklet.addModule(new URL('./microphone-worklet.js',import.meta.url));
      if(this.epoch!==epoch){stream.getTracks().forEach(track=>track.stop());await context.close();return;}
      const node=new AudioWorkletNode(context,'capri-microphone');this.node=node;
      node.port.onmessage=event=>{if(this.epoch!==epoch)return;
        if(event.data.type==='audio')onSamples(event.data.samples);if(event.data.type==='flushed')this.flushed?.();};
      this.source=context.createMediaStreamSource(stream);this.source.connect(node);node.connect(context.destination);
      await context.resume();
    }catch(error){
      if(this.epoch===epoch)await this.cancel();else{stream.getTracks().forEach(track=>track.stop());}
      throw error;
    }
  }
  async stop(){
    const epoch=this.epoch,node=this.node,context=this.context;
    this.stream?.getTracks().forEach(track=>track.stop());this.source?.disconnect();
    if(node)await new Promise(resolve=>{const timer=setTimeout(resolve,150);this.flushed=()=>{clearTimeout(timer);resolve();};node.port.postMessage('stop');});
    if(this.epoch===epoch)await this.cancel();else{try{node?.disconnect();await context?.close();}catch{}}
  }
  async cancel(){
    this.epoch=(this.epoch||0)+1;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    try{this.source?.disconnect();this.node?.disconnect();}catch{}
    this.source=null;this.node=null;this.flushed=null;
    const context=this.context;this.context=null;try{await context?.close();}catch{}
  }
}
