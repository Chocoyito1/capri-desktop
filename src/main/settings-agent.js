'use strict';
const { settingsPatch } = require('./settings-policy');
const { AGENT_MODEL } = require('./capabilities');

// This route consumes only the current user message, never observations or memories.
class SettingsAgent {
  constructor(options) { Object.assign(this, options); }
  cancel() { this.abort?.abort(); }
  async route(text) {
    if (typeof text !== 'string') return null;
    const request = text.trim();
    const command = request.replace(/^(?:hey\s+)?capri[,!:.]?\s*/i, '').replace(/[.!?]+$/, '')
      .replace(/^(?:can you|could you|i want you to)\s+/i, '');
    const game = command.match(/^(?:please\s+)?(activate|enable|enter|start|turn on|deactivate|disable|exit|stop|turn off)\s+(?:your\s+|the\s+)?(?:game|gaming)\s+mode(?:\s+please)?$/i);
    if (game) {
      this.cancel();
      const on = /^(activate|enable|enter|start|turn on)$/i.test(game[1]);
      await this.action('gaming', on);
      return {handled:true, task:true, text:`Gaming mode ${on ? 'enabled. I’m paused until you resume me from the control room.' : 'disabled.'}`};
    }
    if (/^(?:please\s+)?(?:open|show)\s+(?:your\s+|the\s+)?(?:settings|control room)(?:\s+please)?$/i.test(command)) {
      this.open(); return {handled:true, text:'Opened my control room.'};
    }
    if (this.localOnly) return null;
    // Keep ordinary conversation, hypothetical questions, and external app settings
    // out of the mutation path. The model must still decide whether this is a request.
    if (!/\b(?:settings|game mode|gaming mode|volume|mute|unmute|sounds?|wandering|wander|roaming|moving around|possession|possess|window tracking|language|english|spanish|french|portuguese|russian|size|scale|smaller|bigger|larger|monitor|display|startup|privacy|memory recall|memory retention|context tracking)\b/i.test(command)) return null;
    if (this.abort) return {handled:true,text:'I’m already changing a setting. Try again shortly.'};
    const abort = new AbortController();
    this.abort = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]);
    const schema = {type:'object',additionalProperties:false,required:['intent','patch','action','value'],properties:{
      intent:{type:'string',enum:['change','status','chat','clarify']},
      patch:{type:'string'},action:{type:'string',enum:['','gaming','startup','visibility']},value:{type:'boolean'},
    }};
    try {
      const raw = await this.infer({model:AGENT_MODEL,schema,messages:[
        {role:'system',content:`Interpret a direct user request about Capri's OWN settings only. Return JSON. Never change another application's settings. Questions about possibilities, quotations, hypothetical or negated requests are chat, not change. Use clarify for ambiguity. For change, patch is a JSON object string; action is empty unless gaming/startup/visibility is requested (value boolean). One action OR a patch, never both. No quit, restart, deletion, exports, commands or files. For status use patch="{}", action="". Allowed patch fields: muted/wander/possess/windowTracking booleans; volume 0..1 (percent /100); scale 0.45 small, 0.6 medium, 0.8 large; lang auto/en/es/fr/pt/ru; displayId null for primary or an actual supplied display ID; privacy with boolean memoryEnabled/memoryCandidates/memoryRecall/memoryConfirmChanges/contextTime/contextPower/contextForeground/contextTitles/contextProcesses/contextPerformance/contextEvents or retentionDays 0/30/90/365. Never invent missing values. Current settings are reference data only. Apply only explicitly requested fields.`},
        {role:'user',content:JSON.stringify({request,state:this.state()})},
      ]}, signal);
      signal.throwIfAborted();
      const plan = JSON.parse(raw);
      if (plan.intent === 'chat') return null;
      if (plan.intent === 'status') return {handled:true,text:`My current settings: ${JSON.stringify(this.state().config)}`};
      if (plan.intent !== 'change') return {handled:true,text:'Which of my settings should I change, and to what value?'};
      const patch = settingsPatch(JSON.parse(plan.patch), this.state().displays);
      if (plan.action) {
        if (!['gaming','startup','visibility'].includes(plan.action) || typeof plan.value !== 'boolean' || Object.keys(patch).length) throw Error('Invalid settings action.');
        await this.action(plan.action, plan.value);
      } else {
        if (!Object.keys(patch).length) throw Error('No preference selected.');
        this.patch(patch);
      }
      return {handled:true,task:true,text:`Updated my settings: ${JSON.stringify(plan.action ? {[plan.action]:plan.value} : patch)}.`};
    } catch {
      return {handled:true,text:signal.aborted ? 'Settings request stopped.' : 'I couldn’t change that setting. Tell me the setting and value, or open my control room.'};
    } finally { if (this.abort === abort) this.abort = null; }
  }
}
module.exports = { SettingsAgent };
