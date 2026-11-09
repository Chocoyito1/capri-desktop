import { MicrophoneCapture } from './microphone.js';

const WORDS = {
  en: {mic:'Dictate with your default microphone',stop:'Stop dictation',starting:'Getting ready...',
    listening:'Listening',finishing:'Finishing...',done:'Ready to send.',empty:'No words caught. Try again.',
    full:'The message is full. Review it before sending.',
    'microphone-unavailable':'Microphone unavailable. Check your default input device and Windows microphone privacy settings.',
    'speech-unavailable':'Whisper could not start. Try the microphone again.',
    'speech-download-failed':'Could not download the local speech model. Check your connection and try again.',
    'speech-too-fast':'Speech processing fell behind. Stop, review the draft, then try a shorter phrase.',
    processing:'Just a moment...',setup:'Setting up speech',opening:'Connecting microphone...',auto:'Auto-detect',
    'recognizer-failed':'Speech recognition stopped unexpectedly. Try again.',
    'speech-paused':'Resume Capri before using the microphone.', 'speech-busy':'Dictation is already running.'},
  es: {mic:'Dictar con tu micrófono predeterminado',stop:'Detener dictado',starting:'Preparando...',
    listening:'Escuchando',finishing:'Terminando...',done:'Listo para enviar.',empty:'No capté palabras. Inténtalo de nuevo.',
    full:'El mensaje está lleno. Revísalo antes de enviarlo.',
    'microphone-unavailable':'Micrófono no disponible. Revisa el dispositivo predeterminado y la privacidad del micrófono en Windows.',
    'speech-unavailable':'Whisper no pudo iniciarse. Intenta usar el micrófono de nuevo.',
    'speech-download-failed':'No se pudo descargar el modelo local. Revisa tu conexión e inténtalo de nuevo.',
    'speech-too-fast':'El dictado va más rápido que el reconocimiento. Revisa el texto e intenta una frase más corta.',
    processing:'Un momento...',setup:'Preparando la voz',opening:'Conectando el microfono...',auto:'Detección automática',
    'recognizer-failed':'El reconocimiento se detuvo. Inténtalo de nuevo.',
    'speech-paused':'Reanuda Capri antes de usar el micrófono.', 'speech-busy':'El dictado ya está activo.'},
};

export class Dictation {
  constructor({panel,host,language=()=> 'en',canListen=()=>true,beforeStart=async()=>{}}) {
    Object.assign(this,{panel,host,language,canListen,beforeStart});
    this.id=null;
    this.button=panel.el.querySelector('.panel__mic');
    this.status=panel.el.querySelector('.panel__dictation-status');
    this.input=panel.chatInput;
    this.capture=new MicrophoneCapture();
    this.button.addEventListener('click',()=>this.toggle());
    this.input.addEventListener('input',()=>{if(!this.id)this.show('');});
    this.input.addEventListener('keydown',event=>{
      if(this.id&&event.key==='Escape'){event.preventDefault();event.stopPropagation();this.stop();}
    },true);
    panel.onSpeechCancel=()=>this.cancel();
    panel.onTyping=()=>{this.fromWake=false;if(this.id)this.stop();this.show('');};
    panel.onChatBusy=busy=>{if(busy)this.cancel();this.render();};
    host.onSpeechState(event=>this.receive(event));
    window.addEventListener('blur',()=>{if(!this.fromWake)this.cancel();});
    window.addEventListener('beforeunload',()=>this.cancel());
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&!this.fromWake)this.cancel();});
    this.render();
  }
  get words(){return WORDS[this.language()]||WORDS.en;}
  show(text,error=false){this.status.textContent=text;this.status.hidden=!text;this.status.classList.toggle('is-error',error);}
  render(){
    const active=Boolean(this.id);
    this.button.disabled=this.phase==='stopping'||this.input.disabled;
    this.button.setAttribute('aria-pressed',String(active));
    this.button.setAttribute('aria-label',active?this.words.stop:this.words.mic);
    this.button.title=active?this.words.stop:this.words.mic;
    this.button.classList.toggle('is-listening',active);
    this.input.readOnly=active;
    this.panel.chatSend.disabled=active||this.input.disabled;
    if(!active)this.button.style.setProperty('--mic-level','0%');
  }
  async toggle(){
    if(this.id){this.stop();return;}
    if(this.input.disabled||!this.panel.current?.chat||!this.canListen())return;
    await this.beforeStart();
    if(this.id||this.input.disabled||!this.panel.current?.chat||!this.canListen())return;
    if(this.input.maxLength>0&&this.input.value.length>=this.input.maxLength
        &&this.input.selectionStart===this.input.selectionEnd){this.show(this.words.full);return;}
    const id=crypto.randomUUID();this.id=id;this.phase='starting';this.error=false;this.truncated=false;this.final='';this.partial='';
    const text=this.input.value;
    const start=this.input.selectionStart??text.length,end=this.input.selectionEnd??start;
    this.prefix=text.slice(0,start);this.suffix=text.slice(end);
    this.show(this.words.starting);this.render();
    try{
      const result=await this.host.speechStart({id,language:this.language()});
      if(this.id!==id){this.host.speechCancel({id});return;}
      if(!result.ok){this.error=true;this.show(this.words[result.error]||this.words['speech-unavailable'],true);this.finish();}
    }catch{
      if(this.id===id){this.error=true;this.show(this.words['speech-unavailable'],true);this.finish();}
    }
  }
  adoptWake({id,capture,text='',complete=true}){
    if(this.id||!this.panel.current?.chat)throw Error('Speech is already active.');
    this.panel.setConversationMode?.('voice');
    this.capture=capture;this.id=id;this.fromWake=true;this.phase='listening';this.error=false;this.truncated=false;
    this.final='';this.partial='';
    const draft=this.input.value,start=this.input.selectionStart??draft.length,end=this.input.selectionEnd??start;
    this.prefix=draft.slice(0,start);this.suffix=draft.slice(end);
    this.show(this.words.listening);this.render();
    this.limit=setTimeout(()=>this.stop(),90000);
    if(text)this.receive({id,type:'final',text,complete});
  }
  async stop(){
    if(!this.id||this.phase==='stopping')return;
    this.phase='stopping';this.show(this.words.finishing);this.render();
    const id=this.id;
    clearTimeout(this.limit);
    try{await this.capture.stop();if(this.id===id)await this.host.speechStop({id});}
    catch{if(this.id===id)this.cancel();}
  }
  cancel(){
    if(!this.id)return;
    const id=this.id;this.finish();this.host.speechCancel({id});
    this.show('');
  }
  finish(){
    clearTimeout(this.limit);this.capture.cancel();
    this.id=null;this.phase='idle';this.fromWake=false;this.render();
    if(this.panel.current?.chat&&!this.input.disabled)this.input.focus();
  }
  write(){
    const words=[this.final,this.partial].filter(Boolean).join(' ');
    const lead=this.prefix&&words&&!/\s$/.test(this.prefix)?' ':'';
    const tail=this.suffix&&words&&!/^\s|^[.,!?;:]/.test(this.suffix)?' ':'';
    const max=this.input.maxLength>0?this.input.maxLength:500;
    const room=Math.max(0,max-this.prefix.length-this.suffix.length-lead.length-tail.length);
    const dictated=words.slice(0,room);
    this.input.value=this.prefix+(dictated?lead+dictated+tail:'')+this.suffix;
    const caret=this.prefix.length+(dictated?lead.length+dictated.length:0);
    this.input.setSelectionRange(caret,caret);
    this.panel.resizeChatInput?.();
    this.panel.place?.();
    this.input.scrollTop=this.input.scrollHeight;
    if(words.length>room){this.truncated=true;this.stop();}
  }
  receive(event){
    if(!this.id||event.id!==this.id)return;
    if(event.type==='ready'){
      if(this.phase==='stopping')return;
      this.openCapture(event.id);
    }else if(event.type==='setup'){
      if(this.phase==='starting')this.show(`${this.words.setup} · ${Math.max(0,Math.min(100,event.percent||0))}%`);
    }else if(event.type==='processing'){
      this.show(this.words.processing);
    }else if(event.type==='partial'&&typeof event.text==='string'){
      this.partial=event.text;this.write();
    }else if(event.type==='final'&&typeof event.text==='string'){
      this.final=[this.final,event.text].filter(Boolean).join(' ');this.partial='';this.write();
      if(this.phase==='listening')this.show(this.words.listening);
      if(this.fromWake&&event.complete!==false&&this.phase==='listening')this.stop();
    }else if(event.type==='level'){
      this.button.style.setProperty('--mic-level',`${Math.max(0,Math.min(100,event.level||0))}%`);
    }else if(event.type==='stopping'){
      this.capture.cancel();this.phase='stopping';this.show(this.words.processing);this.render();
    }else if(event.type==='error'){
      this.error=true;this.show(this.words[event.text]||this.words['recognizer-failed'],true);
    }else if(event.type==='stopped'){
      const submit=this.fromWake&&!event.cancelled&&!this.error&&!this.truncated&&!this.prefix.trim()&&!this.suffix.trim()&&Boolean(this.final.trim());
      if(!this.error)this.show(this.truncated?this.words.full:this.final||this.partial?this.words.done:this.words.empty);
      this.finish();
      if(submit){
        if(/^(?:cancel|never mind|nevermind|cancelar|cancela)[.!?]*$/i.test(this.final.trim())){this.input.value=this.prefix+this.suffix;this.panel.hide();}
        else this.panel.chatForm.requestSubmit();
      }
    }
  }
  async openCapture(id){
    this.phase='opening';this.show(this.words.opening);this.render();
    try{
      await this.capture.start(samples=>{if(this.id===id)this.host.speechAudio({id,samples});});
      if(this.id!==id)return;
      if(this.phase==='stopping'){await this.capture.stop();return;}
      this.phase='listening';this.show(this.words.listening);this.render();
      this.limit=setTimeout(()=>this.stop(),90000);
    }catch{
      if(this.id!==id)return;
      this.error=true;this.show(this.words['microphone-unavailable'],true);this.host.speechCancel({id});this.finish();
    }
  }
}
