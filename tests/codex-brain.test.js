'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const os = require('node:os');
const { CodexClient } = require('../src/main/codex-client');
const { CodexBrain } = require('../src/main/codex-brain');
const { CHARACTER_VOICE } = require('../src/main/personality');
const { CodexTools } = require('../src/main/codex-tools');

function processMock() {
  const p = new EventEmitter();
  p.stdin = new PassThrough(); p.stdout = new PassThrough(); p.stderr = new PassThrough();
  p.kill = () => { p.killed = true; };
  p.stdin.on('data', bytes => {
    const m = JSON.parse(bytes.toString());
    if (m.id) p.stdout.write(JSON.stringify({ id: m.id, result: m.method === 'initialize' ? {} : { echoed: m.params } }) + '\n');
  });
  return p;
}
test('owned stdio client initializes, disables built-ins and closes its child', async () => {
  let spawned;
  const proc = processMock();
  const c = new CodexClient({ executable: 'codex', cwd: os.tmpdir(), spawnProcess: (...args) => { spawned = args; return proc; } });
  await c.start();
  assert.equal(spawned[2].shell, false); assert.equal(spawned[2].windowsHide, true);
  assert.ok(spawned[1].includes('features.shell_tool=false'));
  assert.deepEqual(await c.request('test', { n: 2 }), { echoed: { n: 2 } });
  c.close(); assert.equal(proc.killed, true); assert.equal(c.pending.size, 0);
});
test('malformed protocol fails pending requests without leaking logs', async () => {
  const proc = processMock(); const c = new CodexClient({ executable: 'codex', spawnProcess: () => proc });
  await c.start(); proc.stdout.write('not-json\n');
  assert.equal(c.closed, true); await assert.rejects(c.request('x', {}), /closed/);
});
test('system-mode CLI enables command, file/image and web capability without forcing configured connections off', async () => {
  const proc = processMock(); let args;
  const c = new CodexClient({ executable: 'codex', nativeTools: true, spawnProcess: (_exe, supplied) => { args = supplied; return proc; } });
  await c.start();
  assert.ok(args.includes('features.shell_tool=true')); assert.ok(args.includes('features.unified_exec=true'));
  assert.ok(args.includes('features.view_image=true')); assert.ok(args.includes('web_search="live"'));
  assert.ok(!args.includes('features.apps=false')); assert.ok(args.includes('features.hooks=false'));
  c.close();
});
function fixture(mode = 'reply') {
  let client; const calls = []; const toolRuns = [];
  const tools = { specs: () => [], instructions: () => '', run: async (...args) => { toolRuns.push(args); return { completed: true }; }, cancel: () => {} };
  const factory = () => client = {
    start: async () => {}, close() { calls.push(['close']); this.closed = true; }, respond(...args) { calls.push(['respond', ...args]); },
    async request(method, params) {
      calls.push([method, params]);
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: [{ id: 'test', model: 'test', isDefault: true }] };
      if (method === 'config/read') return { config: { mcp_servers: { existing: {} } } };
      if (method === 'thread/start') return { thread: { id: 'thread' } };
      if (method === 'turn/start') {
        this.onNotification('turn/started', { threadId: 'thread', turn: { id: 'turn' } });
        if (mode === 'wait') return { turn: { id: 'turn' } };
        setImmediate(async () => {
          if (mode === 'verification') {
            const item = { id: 'test-command', type: 'commandExecution', command: 'npm test', cwd: path.join(os.tmpdir(), 'selected-project'), status: 'completed', exitCode: 0 };
            this.onNotification('item/completed', { threadId: 'old-thread', turnId: 'turn', item: { ...item, id: 'stale' } });
            this.onNotification('item/completed', { threadId: 'thread', turnId: 'turn', item });
            this.onNotification('item/completed', { threadId: 'thread', turnId: 'turn', item });
            this.onNotification('item/started', { threadId: 'thread', turnId: 'turn', item: { ...item, id: 'not-completed' } });
          }
          if (mode === 'approval' || mode === 'permission') {
            this.onNotification('item/started', { threadId: 'thread', turnId: 'turn', item: { id: 'command', type: 'commandExecution' } });
            await this.onRequest({ id: 90, method: mode === 'approval' ? 'item/commandExecution/requestApproval' : 'item/permissions/requestApproval',
              params: { threadId: 'thread', turnId: 'turn', itemId: 'command', command: 'echo safe', permissions: { fileSystem: { write: ['C:\\Requested'] } } } });
          }
          if (mode === 'screen') await this.onRequest({ id: 33, method: 'item/tool/call', params: { threadId: 'thread', turnId: 'turn', callId: 'screen', tool: 'capri_screen', arguments: { displayId: '' } } });
          if (mode === 'tool' || mode === 'launch') {
            const request = { id: 30, method: 'item/tool/call', params: { threadId: 'thread', turnId: 'turn', callId: 'one', tool: 'capri_context', arguments: {} } };
            if (mode === 'launch') Object.assign(request.params, { tool: 'capri_desktop_step', arguments: { tool: 'open_app', query: 'Firefox', index: 0, browser: 'default' } });
            await this.onRequest(request); await this.onRequest({ ...request, id: 31 });
            if (mode === 'tool') await this.onRequest({ ...request, id: 32, params: { ...request.params, turnId: 'old' } });
          }
          this.onNotification('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', delta: 'Hello' });
          this.onNotification('item/completed', { threadId: 'thread', turnId: 'turn', item: { type: 'agentMessage', text: 'Hello' } });
          this.onNotification('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } });
        });
        return { turn: { id: 'turn' } };
      }
    },
  };
  const brain = new CodexBrain({ settings: () => ({}), cwd: path.join(os.tmpdir(), 'capri-brain-unit'), tools, clientFactory: factory, locate: () => 'codex' });
  return { brain, calls, toolRuns, client: () => client };
}
test('brain streams, preserves history, isolates threads and disables inherited MCP servers', async () => {
  const f = fixture(); const deltas = [];
  assert.equal(await f.brain.chat('Hi', d => deltas.push(d)), 'Hello');
  assert.ok(f.calls.find(([method]) => method === 'thread/start')[1].baseInstructions.includes(CHARACTER_VOICE),
    'The shared character voice must reach the actual foreground Codex thread.');
  assert.deepEqual(deltas, ['Hello']); assert.equal(f.brain.history.length, 2);
  assert.equal(f.brain.lastStatus.verifiedInference, true); assert.equal(f.client().closed, true);
  const params = f.calls.find(c => c[0] === 'thread/start')[1];
  assert.equal(params.ephemeral, true); assert.equal(params.sandbox, 'read-only');
  assert.equal(params.config.mcp_servers.existing.enabled, false);
});

test('requested native work uses the selected workspace and journals deduplicated completed command receipts only', async () => {
  const f = fixture('verification'), receipts = [], selected = path.join(os.tmpdir(), 'selected-project');
  f.brain.systemTools = () => true;
  f.brain.workspace = () => selected;
  f.brain.onOutcome = value => receipts.push(value);
  await f.brain.chat('Run the tests');
  assert.equal(f.calls.find(row => row[0] === 'thread/start')[1].cwd, selected);
  assert.deepEqual(receipts, [{ workspace: selected, cwd: selected, command: 'npm test', exitCode: 0 }]);
  f.brain.onOutcome = async () => { throw Error('Journal unavailable'); };
  assert.equal(await f.brain.chat('Run the tests again'), 'Hello');
});

test('a missing selected workspace fails before starting a Codex client', async () => {
  const f = fixture(); f.brain.systemTools = () => true;
  f.brain.workspace = () => { throw Error('Project folder unavailable'); };
  await assert.rejects(f.brain.chat('Inspect this project'), /folder unavailable/);
  assert.equal(f.client(), undefined); assert.equal(f.brain.busy, false);
});

test('large companion context stays valid JSON and retains project/goal records instead of slicing them', async () => {
  const f = fixture();
  f.brain.context = () => ({ externalCodexEvents: { sessions: [{ title: '旅'.repeat(20000) }] },
    currentProject: { root: 'C:\\Selected', notes: [{ kind: 'decision', text: 'Keep the original animations' }] },
    savedGoals: [{ text: 'Finish the project' }], recentConversation: [{ content: 'x'.repeat(20000) }],
    capabilities: { available: true } });
  await f.brain.chat('What is next?');
  const input = f.calls.find(row => row[0] === 'turn/start')[1].input[0].text;
  const raw = input.slice(input.indexOf('\n') + 1, input.indexOf('\n\n'));
  const data = JSON.parse(raw);
  assert.equal(data.currentProject.root, 'C:\\Selected');
  assert.equal(data.savedGoals[0].text, 'Finish the project');
  assert.ok(data.omittedContextFields.includes('externalCodexEvents'));
  assert.ok(Buffer.byteLength(raw) <= 16000);
});
test('tool requests execute once and reject stale turn IDs', async () => {
  const f = fixture('tool'); await f.brain.chat('What is open?');
  assert.equal(f.toolRuns.length, 1);
  const responses = f.calls.filter(c => c[0] === 'respond');
  assert.equal(responses.length, 3); assert.equal(responses[2][2].success, false);
});
test('cancel stops an in-flight turn and releases busy state', async () => {
  const f = fixture('wait'); const pending = f.brain.chat('Hi');
  await new Promise(resolve => setImmediate(resolve));
  f.brain.cancel(); await assert.rejects(pending, /stopped/);
  assert.equal(f.brain.busy, false); assert.equal(f.brain.history.length, 0);
  assert.ok(f.calls.findIndex(row => row[0] === 'turn/interrupt') < f.calls.findIndex(row => row[0] === 'close'));
});
test('failed client creation never leaves the brain busy', async () => {
  const f = fixture(); f.brain.locate = () => { throw Error('not found'); };
  await assert.rejects(f.brain.chat('Hi'), /not found/); assert.equal(f.brain.busy, false);
  assert.equal((await f.brain.status()).ok, false);
});
test('tool bridge rejects unknown, negated and non-requested mutations', async () => {
  const t = new CodexTools({ settings: () => ({ privacy: { memoryEnabled: true } }), state: () => ({ displays: [] }) });
  const ctx = text => ({ text, check() {}, signal: new AbortController().signal });
  await assert.rejects(t.run('shell', {}, ctx('hello')), /Unknown/);
  await assert.rejects(t.run('capri_memory_change', { changes: [{ kind: 'add', id: 0, text: 'fake' }] }, ctx('hello')), /explicit/);
  await assert.rejects(t.run('capri_settings_change', { patch: '{"muted":true}' }, ctx("don't mute")), /direct/);
});

test('memory lookup binds edits to this turn; questions cannot mutate records', async () => {
  let edits = 0;
  const store = { search: () => [{ id: 3, text: 'My name is Gabe.' }], applyChanges: () => edits++ };
  const tools = new CodexTools({ settings: () => ({ privacy: { memoryEnabled: true, memoryRecall: true, memoryConfirmChanges: false } }), store: () => store });
  const context = { text: 'forget memory 3', check() {}, signal: new AbortController().signal };
  const change = { changes: [{ kind: 'forget', id: 3, text: '' }] };
  await assert.rejects(tools.run('capri_memory_change', change, context), /Invalid memory/);
  await tools.run('capri_memory_lookup', { query: 'name' }, context);
  await tools.run('capri_memory_change', change, context);
  assert.equal(edits, 1);
  await assert.rejects(tools.run('capri_memory_change', change, { ...context, text: 'what do you remember about me?' }), /explicit/);
  tools.endTurn();
  await assert.rejects(tools.run('capri_memory_change', change, context), /Invalid memory/);
});
test('settings tool applies requested values through the existing policy', async () => {
  let patch;
  const tools = new CodexTools({ settings: () => ({}), state: () => ({ displays: [] }), patch: value => patch = value });
  const context = { text: 'mute your sound', check() {}, signal: new AbortController().signal };
  await tools.run('capri_settings_change', { patch: '{"muted":true}' }, context);
  assert.deepEqual(patch, { muted: true });
  await assert.rejects(tools.run('capri_settings_change', { patch: '{"codexExecutable":"anything"}' }, context), /control room/);
});

test('Codex app launch reaches the real local executor with a schema-required default browser placeholder', async () => {
  const { ActionAgent } = require('../src/main/action-agent');
  const { DesktopTools } = require('../src/main/desktop-tools');
  const opened = [], settings = () => ({ agentEnabled: true, desktopActions: true });
  const actions = new ActionAgent({ settings, idle: () => false,
    desktop: new DesktopTools({ shortcuts: () => [{ label: 'Firefox', file: 'C:\\Apps\\Firefox.lnk' }], executables: () => [],
      openPath: async file => { opened.push(file); return ''; }, native: { desktopApps: () => [{ name: 'firefox' }] } }),
    browser: { stop() {} }, web: {}, models: async () => assert.fail('Must not invoke the old planner'),
    infer: () => assert.fail('Must not invoke Qwen') });
  const f = fixture('launch'); f.brain.tools = new CodexTools({ settings, actions });
  await f.brain.chat('open firefox');
  assert.deepEqual(opened, ['C:\\Apps\\Firefox.lnk']);
  const response = f.calls.find(row => row[0] === 'respond')[2];
  assert.equal(response.success, true);
  assert.equal(JSON.parse(response.contentItems[0].text).observations[0].windowObserved, true);
});

test('failed dynamic tool calls show the actual local error and preserve argument-free diagnostics', async () => {
  const f = fixture('launch');
  f.brain.tools.run = async () => { throw Error('App discovery is unavailable.'); };
  const result = await f.brain.chat('open firefox');
  assert.match(result, /Local tool error: App discovery is unavailable/);
  assert.equal(f.brain.lastDiagnostics.completed, 0);
  assert.equal(f.brain.lastDiagnostics.errors[0].tool, 'capri_desktop_step');
  assert.doesNotMatch(JSON.stringify(f.brain.lastDiagnostics), /arguments|query/);
});

test('foreground system mode preserves native tools and handles scoped approvals, while restricted sessions reject them', async () => {
  for (const accept of [true, false]) {
    const f = fixture('approval'); f.brain.systemTools = () => true; f.brain.workspace = 'C:\\Users\\Gabriel';
    let reviewed = false; f.brain.approve = async (message, ctx) => { reviewed = true; assert.equal(ctx.item.type, 'commandExecution'); return accept; };
    await f.brain.chat('Work on the requested file');
    assert.equal(reviewed, true);
    const thread = f.calls.find(row => row[0] === 'thread/start')[1];
    assert.equal(thread.sandbox, 'workspace-write'); assert.equal(thread.cwd, 'C:\\Users\\Gabriel'); assert.equal(thread.config.mcp_servers, undefined);
    assert.equal(f.calls.find(row => row[0] === 'respond')[2].decision, accept ? 'accept' : 'decline');
  }
  const denied = fixture('approval'); await assert.rejects(denied.brain.chat('hello'), /tool outside/);
});
test('expanded filesystem permissions are reviewed and granted only for the current turn', async () => {
  const f = fixture('permission'); f.brain.systemTools = () => true; f.brain.approve = async () => true;
  await f.brain.chat('Update my requested file outside the workspace');
  const response = f.calls.find(row => row[0] === 'respond')[2];
  assert.deepEqual(response.permissions, { fileSystem: { write: ['C:\\Requested'] } });
  assert.equal(response.scope, 'turn'); assert.equal(response.strictAutoReview, true);
});
test('screen tools transmit actual image content and live personality data, not a text-only screenshot claim', async () => {
  const f = fixture('screen'); f.brain.context = () => ({ presentation: { mood: 'playful' } });
  f.brain.tools.run = async () => ({ image: 'data:image/jpeg;base64,YQ==', snapshotId: 'fresh-frame', width: 100, height: 50 });
  await f.brain.chat('What is on my screen?');
  const response = f.calls.find(row => row[0] === 'respond')[2];
  assert.deepEqual(response.contentItems[1], { type: 'inputImage', imageUrl: 'data:image/jpeg;base64,YQ==' });
  assert.doesNotMatch(response.contentItems[0].text, /base64/);
  assert.match(f.calls.find(row => row[0] === 'turn/start')[1].input[0].text, /playful/);
});
