'use strict';
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

// One owned stdio process; no connection to the desktop app's private daemon.
class CodexClient {
  constructor({ executable, cwd, nativeTools = false, spawnProcess = spawn, timeout = 15000 }) {
    Object.assign(this, { executable, cwd, nativeTools, spawnProcess, timeout });
    this.pending = new Map(); this.nextId = 0; this.closed = false;
    this.onNotification = () => {}; this.onRequest = () => {};
    this.onFailure = () => {};
  }
  async start() {
    if (!this.executable) throw Error('Codex CLI was not found. Choose codex.exe in Connections.');
    const args = ['app-server', '--listen', 'stdio://'];
    const disabled = this.nativeTools ? ['hooks', 'memories', 'multi_agent']
      : ['shell_tool', 'unified_exec', 'apps', 'hooks', 'memories', 'multi_agent', 'view_image', 'remote_plugin', 'skill_search', 'workspace_dependencies', 'code_mode_host'];
    for (const flag of disabled) {
      args.push('-c', `features.${flag}=false`);
    }
    args.push('-c', 'model_provider="openai"');
    if (this.nativeTools) args.push('-c', 'features.shell_tool=true', '-c', 'features.unified_exec=true', '-c', 'features.view_image=true', '-c', 'web_search="live"');
    else args.push('-c', 'features.code_mode.enabled=false', '-c', 'web_search="disabled"', '-c', 'sandbox_mode="read-only"');
    this.proc = this.spawnProcess(this.executable, args, { cwd: this.cwd, windowsHide: true,
      shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const decoder = new StringDecoder('utf8'); let buffer = '';
    this.stderrBytes = 0; this.permissionError = false;
    this.proc.stderr.on('data', bytes => {
      this.stderrBytes += bytes.length;
      if (/access is denied|permission denied|os error 5|read-only database/i.test(bytes.toString())) this.permissionError = true;
    });
    this.proc.on('error', error => this.fail(Error(`Cannot start Codex CLI (${error.code || 'process error'}).`)));
    this.proc.on('exit', () => this.fail(Error(this.permissionError
      ? 'Codex could not access its local state. Check CLI permissions in a normal Windows session.'
      : 'Codex CLI disconnected. Your request was stopped; completed actions were not undone.')));
    this.proc.stdin.on('error', () => this.fail(Error('Codex input connection closed.')));
    this.proc.stdout.on('data', bytes => {
      if (this.closed) return;
      buffer += decoder.write(bytes);
      if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) return this.fail(Error('Codex protocol message is too large.'));
      let end;
      while (!this.closed && (end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        try { this.receive(JSON.parse(line)); }
        catch { this.fail(Error('Invalid Codex protocol message.')); }
      }
    });
    try {
      await this.request('initialize', { clientInfo: { name: 'caprigpt', title: 'CapriGPT', version: '0.4.0' },
        capabilities: { experimentalApi: true } });
      this.send({ method: 'initialized', params: {} });
      return this;
    } catch (error) { this.close(); throw error; }
  }
  receive(message) {
    if (message.method) {
      if (message.id !== undefined) {
        Promise.resolve().then(() => this.onRequest(message)).catch(() => {
          this.respond(message.id, null, { code: -32603, message: 'Capri tool request failed.' });
        });
      } else this.onNotification(message.method, message.params || {});
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(Error(`Codex: ${String(message.error.message || 'request failed').slice(0, 500)}`));
    else pending.resolve(message.result);
  }
  send(message) {
    if (this.closed) throw Error('Codex connection is closed.');
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }
  respond(id, result, error) {
    if (!this.closed) this.send(error ? { id, error } : { id, result });
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(Error('Codex connection is closed.'));
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`Codex ${method} timed out.`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.proc?.kill(); this.onFailure(error);
  }
  close() { this.fail(Error('Codex request stopped.')); }
}
module.exports = { CodexClient };
