'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  companionState: state => ipcRenderer.send('companion:state', state),
  companionEvent: reason => ipcRenderer.send('companion:event', reason),
  onBodyAction: on('companion:body'),
  bodyResult: result => ipcRenderer.send('companion:body-result', result),
  onIntegrationEvent: on('integration:event'),
  onIntegrationState: on('integration:state'),
  integrationStatus: () => ipcRenderer.invoke('integration:status'),
  onCommand: on('capri:command'),
  gamingAnimationReady: () => ipcRenderer.send('gaming:animation-ready'),
  onFullscreenState: on('fullscreen:state'),
  fullscreenState: () => ipcRenderer.invoke('fullscreen:state'),
  fullscreenRendered: state => ipcRenderer.send('fullscreen:rendered', state),
  ttsSpeak: request => ipcRenderer.invoke('tts:speak', request),
  ttsCancel: () => ipcRenderer.send('tts:cancel'),
  onTtsState: on('tts:state'),
  wakeSetEnabled: enabled => ipcRenderer.invoke('wake:enabled', enabled),
  wakeEndSession: () => ipcRenderer.send('wake:end-session'),
  speechStart: request => ipcRenderer.invoke('speech:start', request),
  speechAudio: request => ipcRenderer.send('speech:audio', request),
  speechConversation: request => ipcRenderer.invoke('speech:conversation', request),
  speechReset: request => ipcRenderer.send('speech:reset', request),
  speechStop: request => ipcRenderer.invoke('speech:stop', request),
  speechCancel: request => ipcRenderer.send('speech:cancel', request),
  onSpeechState: on('speech:state'),
  onConfig: on('capri:config'),
  onResize: on('overlay:resize'),
  onWindows: on('windows:update'),
  onAgentSuggestion: on('agent:suggestion'),
  onConversation: on('companion:conversation'),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', Boolean(on)),
  cursor: () => ipcRenderer.invoke('overlay:cursor'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  runtimeInfo: () => ipcRenderer.invoke('runtime:info'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  demoWindow: (open) => ipcRenderer.invoke('demo:window', Boolean(open)),
  openMenu: () => ipcRenderer.send('menu:open'),
  windowsNow: () => ipcRenderer.invoke('windows:get'),
  copyImage: (rect) => ipcRenderer.invoke('panel:copy', rect),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  personalRoute: (text, id, conversation, commandsOnly = false) => ipcRenderer.invoke('personal:route', text, id, conversation, commandsOnly),
  onTaskProgress: on('task:progress'),
  openTaskResult: ref => ipcRenderer.invoke('task:openResult', ref),
  chatStop: (id) => ipcRenderer.send('chat:stop', id),
  onChatDelta: on('chat:delta'),
  openApps: () => ipcRenderer.invoke('apps:list'),
  findApp: (wanted) => ipcRenderer.invoke('apps:find', wanted),
  closeApp: (name, force) => ipcRenderer.invoke('apps:close', { name, force: Boolean(force) }),
  focusOverlay: (on) => ipcRenderer.send('overlay:focus', Boolean(on)),
});
