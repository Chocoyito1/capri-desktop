'use strict';
// Utterance boundaries only; neural Silero VAD filters non-speech in Whisper.
class SpeechSegmenter {
  constructor(onSegment,{maxSamples=20*16000}={}){this.onSegment=onSegment;this.maxSamples=maxSamples;this.pre=[];this.preSamples=0;this.reset();}
  reset(){this.chunks=[];this.samples=0;this.voiced=0;this.silence=0;}
  add(pcm){
    let sum=0;for(let i=0;i<pcm.length;i+=2){const value=pcm.readInt16LE(i)/32768;sum+=value*value;}
    const count=pcm.length/2,rms=Math.sqrt(sum/Math.max(1,count)),voice=rms>=0.0035;
    if(!this.chunks.length&&!voice){
      this.pre.push(pcm);this.preSamples+=count;
      while(this.preSamples>4800&&this.pre.length>1)this.preSamples-=this.pre.shift().length/2;
      return rms;
    }
    if(!this.chunks.length){this.chunks=this.pre;this.samples=this.preSamples;this.pre=[];this.preSamples=0;}
    this.chunks.push(pcm);this.samples+=count;
    if(voice){this.voiced+=count;this.silence=0;}else this.silence+=count;
    if(this.silence>=12800||this.samples>=this.maxSamples)this.flush(this.silence>=12800);return rms;
  }
  flush(complete=true){if(this.voiced>=2400&&this.chunks.length)this.onSegment(Buffer.concat(this.chunks),{complete});this.reset();this.pre=[];this.preSamples=0;}
}
module.exports={SpeechSegmenter};
