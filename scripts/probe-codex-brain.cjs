'use strict';

// Research diagnostic, not Capri's runtime backend. It never starts a thread,
// generates a reply, invokes a tool, changes login or reads credential files.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

function findExecutable(explicit, env = process.env) {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = [explicit, env.CAPRIGPT_CODEX_EXE,
    env.CODEX_ELECTRON_RESOURCES_PATH && path.join(env.CODEX_ELECTRON_RESOURCES_PATH, name),
    ...(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name))];
  return candidates.find(file => typeof file === 'string' && path.isAbsolute(file)
    && path.basename(file).toLowerCase() === name && fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function summarizeAccount(result) {
  return { signedIn: !!result.account, type: result.account?.type || null,
    plan: result.account?.planType || null, requiresOpenaiAuth: result.requiresOpenaiAuth ?? null };
}

async function probe(executable, { spawnProcess = spawn, timeoutMs = 12000 } = {}) {
  if (!executable) throw Error('Codex executable not found. Pass --exe followed by the absolute CLI path.');
  const proc = spawnProcess(executable, ['app-server', '--listen', 'stdio://'], {
    windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 0, buffer = '', stderrBytes = 0, closed = false;
  const decoder = new StringDecoder('utf8');
  const categories = new Set();
  const pending = new Map();
  const fail = error => {
    closed = true;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  proc.on('error', fail);
  proc.on('exit', (code, signal) => fail(Error(`Codex app-server exited (${code ?? signal}); stderr ${stderrBytes} bytes; categories: ${[...categories].join(', ') || 'unclassified'}.`)));
  proc.stderr.on('data', data => {
    stderrBytes += data.length; // never echo auth/config logs or credentials
    const text = data.toString();
    for (const [name, pattern] of Object.entries({ permission: /access is denied|permission denied|os error 5|read-only/i,
      network: /dns|ENOTFOUND|connect error/i, configuration: /configuration|config\.toml/i,
      state: /sqlite|database|migration/i, unsupported: /unsupported|unrecognized|unknown variant/i })) {
      if (pattern.test(text)) categories.add(name);
    }
  });
  proc.stdin.on('error', fail);
  const send = value => {
    if (closed) throw Error('Codex app-server is closed.');
    proc.stdin.write(`${JSON.stringify(value)}\n`);
  };
  proc.stdout.on('data', data => {
    if (closed) return;
    buffer += decoder.write(data);
    if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) {
      fail(Error('Codex protocol output exceeded diagnostic limit.'));
      proc.kill();
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let value;
      try { value = JSON.parse(line); }
      catch { fail(Error('Invalid JSON on Codex protocol stdout.')); proc.kill(); return; }
      if (value.method) {
        // A diagnostic cannot grant approvals or provide tools/auth material.
        if (value.id !== undefined) send({ id: value.id,
          error: { code: -32601, message: 'Read-only diagnostic does not handle server requests.' } });
        continue;
      }
      const request = pending.get(value.id);
      if (!request) continue;
      pending.delete(value.id);
      if (value.error) request.reject(Error(`Codex RPC error ${value.error.code}; consult CLI diagnostics.`));
      else request.resolve(value.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    if (closed) return reject(Error('Codex app-server is closed.'));
    pending.set(id, { resolve, reject });
    try { send({ id, method, params }); }
    catch (error) { pending.delete(id); reject(error); }
  });
  const timer = setTimeout(() => { fail(Error('Codex diagnostic timed out.')); proc.kill(); }, timeoutMs);
  try {
    const initialized = await request('initialize', {
      clientInfo: { name: 'caprigpt_research', title: 'CapriGPT read-only research', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    send({ method: 'initialized', params: {} });
    const account = await request('account/read', { refreshToken: false });
    const models = await request('model/list', { limit: 30, includeHidden: false });
    return {
      handshake: true, platform: initialized.platformFamily || null,
      account: summarizeAccount(account),
      models: (models.data || []).map(model => ({ id: model.id, model: model.model,
        isDefault: !!model.isDefault, reasoning: model.supportedReasoningEfforts || [] })),
      moreModels: !!models.nextCursor, stderrBytes,
      inferenceTested: false, toolExecutionTested: false,
    };
  } finally {
    clearTimeout(timer);
    // Own child only: never connect to, stop or alter the user's active daemon.
    if (!closed) { proc.stdin.end(); proc.kill(); }
  }
}

module.exports = { findExecutable, summarizeAccount, probe };
if (require.main === module) {
  const index = process.argv.indexOf('--exe');
  const executable = findExecutable(index >= 0 ? process.argv[index + 1] : null);
  probe(executable).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
