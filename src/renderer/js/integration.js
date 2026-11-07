// Read-only notifications. This controller has no action/approval tool or LLM calls.
export class IntegrationCompanion {
  visibleSessions() {
    return this.snapshot.lastSeen ? this.snapshot.sessions.filter((event) => !event.demo) : this.snapshot.sessions;
  }
  constructor({ capri, panel, voice, host, brain }) {
    Object.assign(this, { capri, panel, voice, host, brain });
    this.lastPulse = -Infinity;
    this.snapshot = { lastSeen: null, sessions: [] };
    host.onIntegrationState((snapshot) => {
      this.snapshot = snapshot;
      if (snapshot.resumed) {
        const waiting = this.visibleSessions().find((event) => event.stage === 'waiting');
        if (waiting) this.handle(waiting);
        else if (!this.visibleSessions().some((event) => ['working', 'tool_failed'].includes(event.stage))) {
          this.panel.clearKind('alert'); this.panel.setTicker(null); this.capri.setMode('idle');
        }
      }
    });
    host.onIntegrationEvent((event) => this.handle(event));
    host.integrationStatus().then((snapshot) => { this.snapshot = snapshot; }).catch(() => {});
    brain.integrationContext = () => this.context();
    brain.integrationStatusMessage = () => this.statusMessage();
    brain.integrationActivity = () => this.activityLine();
  }
  context() {
    if (!this.snapshot.lastSeen) return 'Codex notification hooks are available but no real Codex event has been received in this Capri run. Current Codex activity is unknown. Regular ChatGPT conversations are not connected.';
    const tasks = this.snapshot.sessions.filter((event) => !event.demo && event.stage !== 'ready').slice(-6);
    return `Codex lifecycle notifications have been received locally. These are observed events, not a continuous live view. Last observed states: ${tasks.map((event) => `${event.project}: ${event.stage}${event.tool ? ` (${event.tool})` : ''}`).join('; ') || 'session ready'}. Regular ChatGPT conversations are not connected. No prompts, answers, commands or files were received.`;
  }
  statusMessage() {
    // Use the same observed state as animation, with approval taking precedence
    // over another turn's work. A click is read-only and never approves anything.
    const sessions = this.visibleSessions();
    const event = ['waiting', 'tool_failed', 'working']
      .map((stage) => sessions.find((entry) => entry.stage === stage)).find(Boolean);
    if (!event) return null;
    return {
      kind: event.stage === 'waiting' ? 'alert' : event.stage === 'tool_failed' ? 'error' : 'work',
      badge: event.demo ? 'CODEX · TEST' : 'CODEX', tag: event.project,
      line: this.lines()[event.stage], hold: event.stage === 'waiting' ? null : 6000,
      ...(event.stage !== 'waiting' && this.brain.onTalk ? {
        actions: [{ id: 'talk', label: this.brain.t.chat.talk }], onAction: () => this.brain.onTalk(),
      } : {}),
    };
  }
  activityLine() {
    return this.statusMessage()?.line || (this.brain.lang === 'es'
      ? this.snapshot.lastSeen ? 'Codex: sin tarea activa.' : 'Codex: aún sin actividad recibida.'
      : this.snapshot.lastSeen ? 'Codex: no active task.' : 'Codex: no activity received yet.');
  }
  lines() {
    const es = this.brain.lang === 'es';
    return es ? {
      ready: 'La conexión de Codex está lista.', working: 'Codex está trabajando.', waiting: 'Codex necesita tu aprobación. Revísala en Codex.',
      tool_failed: 'Una herramienta de Codex informó un error.', completed: 'Codex terminó su turno.', interrupted: 'El turno de Codex fue interrumpido.', closed: 'La sesión de Codex terminó.',
    } : {
      ready: 'Codex notifications are connected.', working: 'Codex is working.', waiting: 'Codex needs your approval. Review it in Codex.',
      tool_failed: 'A Codex tool reported an error.', completed: 'Codex finished its turn.', interrupted: 'The Codex turn was interrupted.', closed: 'The Codex session ended.',
    };
  }
  handle(event) {
    this.panel.setTicker(null);
    const label = event.demo ? 'CODEX · TEST' : 'CODEX';
    const lines = this.lines();
    const active = this.visibleSessions().some((entry) => ['working', 'waiting', 'tool_failed'].includes(entry.stage));
    if (event.stage !== 'waiting' && this.visibleSessions().some((entry) => entry.stage === 'waiting')) {
      this.capri.setMode('alert');
      return; // another turn still needs its approval prompt
    }
    if (event.stage !== 'waiting' && this.panel.current?.badge?.startsWith('CODEX')) this.panel.clearKind('alert');
    if (event.stage === 'working') {
      // A burst of tool hooks should not turn into continuous glitch flashes.
      const now = performance.now();
      if (now - this.lastPulse >= 1800) {
        this.capri.pulse();
        this.lastPulse = now;
      }
      this.capri.setMode('work');
      this.capri.reactToTool?.(event.tool);
      return; // Routine work stays silent; quiet action poses sit over the focus cycle.
    } else if (event.stage === 'waiting') {
      this.capri.setMode('alert');
      this.voice.play('alert');
    } else {
      if (!active) { this.capri.setMode('idle'); this.panel.setTicker(null); }
      if (event.stage === 'completed' && !active) this.capri.perform('hop');
      if (event.stage === 'tool_failed') { this.capri.hurt(); this.voice.play('error'); }
    }
    // Connection, interruption and session-close events update her state silently.
    if (!['waiting', 'tool_failed', 'completed'].includes(event.stage)) return;
    const kind = event.stage === 'waiting' ? 'alert' : event.stage === 'tool_failed' ? 'error' : event.stage === 'completed' ? 'done' : event.stage === 'working' ? 'work' : 'info';
    if (this.brain.generatedDialogue && event.stage !== 'waiting') { this.host.companionEvent?.('external-task'); return; }
    this.panel.say({ kind, badge: label, tag: event.project, line: this.brain.generatedDialogue ? 'Approval required in Codex' : lines[event.stage], hold: event.stage === 'waiting' ? null : 6500 });
  }
}
