'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { probe, summarizeAccount, findExecutable } = require('../scripts/probe-codex-brain.cjs');

function server({ malformed = false, requestApproval = false, silent = false } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  const messages = [];
  proc.stdin = new Writable({ write(data, encoding, done) {
    const input = JSON.parse(data.toString()); messages.push(input);
    queueMicrotask(() => {
      if (!input.method || input.method === 'initialized' || silent) return;
      if (malformed) { proc.stdout.write('broken protocol\n'); return; }
      if (requestApproval && input.method === 'initialize') {
        proc.stdout.write(JSON.stringify({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: {} }) + '\n');
      }
      const result = input.method === 'initialize' ? { platformFamily: 'windows' }
        : input.method === 'account/read' ? { account: { type: 'chatgpt', planType: 'plus', email: 'private@example.invalid', token: 'do-not-echo' }, requiresOpenaiAuth: true }
        : { data: [{ id: 'model-é', model: 'model-é', isDefault: true }], nextCursor: null };
      const bytes = Buffer.from(JSON.stringify({ id: input.id, result }) + '\n');
      // Byte fragmentation also exercises multi-byte UTF-8 decoding.
      for (const byte of bytes) proc.stdout.write(Buffer.from([byte]));
    });
    done();
  } });
  proc.killed = false;
  proc.kill = () => { proc.killed = true; return true; };
  return { proc, messages, spawnProcess: (exe, args, options) => {
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    assert.deepEqual(args, ['app-server', '--listen', 'stdio://']); return proc;
  } };
}

test('Codex probe performs metadata handshake without starting inference or exposing account details', async () => {
  const mock = server();
  const result = await probe('codex.exe', mock);
  assert.equal(result.handshake, true);
  assert.equal(result.models[0].id, 'model-é');
  assert.deepEqual(mock.messages.map(row => row.method), ['initialize', 'initialized', 'account/read', 'model/list']);
  assert.equal(result.inferenceTested, false);
  assert.doesNotMatch(JSON.stringify(result), /private@|do-not-echo/);
  assert.equal(mock.proc.killed, true);
});

test('Codex research diagnostic never grants a server approval', async () => {
  const mock = server({ requestApproval: true });
  await probe('codex.exe', mock);
  const response = mock.messages.find(row => row.id === 'approval-1');
  assert.equal(response.error.code, -32601);
  assert.equal(response.result, undefined);
});

test('Codex probe fails on malformed output and times out silent processes', async () => {
  for (const options of [{ malformed: true }, { silent: true }]) {
    const mock = server(options);
    await assert.rejects(probe('codex.exe', { ...mock, timeoutMs: 30 }));
    assert.equal(mock.proc.killed, true);
  }
});

test('Codex discovery does not accept a shell wrapper or fabricate an installation', () => {
  assert.equal(findExecutable('C:\\not-installed\\codex.cmd', { PATH: '' }), null);
  assert.deepEqual(summarizeAccount({ account: null, requiresOpenaiAuth: true }), {
    signedIn: false, type: null, plan: null, requiresOpenaiAuth: true,
  });
});
