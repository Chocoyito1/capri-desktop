'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { QwenVoice } = require('../src/main/qwen-voice');

async function fixture(t, { slowReady = false, idleMs = 60000 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capri-qwen-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await Promise.all(['python.exe', 'config.json', 'ref.wav'].map(name => fs.writeFile(path.join(dir, name), 'fixture')));
  const config = { ttsPython: path.join(dir, 'python.exe'), ttsModel: dir,
    ttsReference: path.join(dir, 'ref.wav'), ttsReferenceText: 'Hello.' };
  const children = [], events = [];
  const voice = new QwenVoice({ root: dir, idleMs, notify: event => events.push(event), launch: (_exe, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.messages = [];
    child.args = args;
    child.emitMessage = event => child.stdout.write(JSON.stringify(event) + '\n');
    child.stdin = new Writable({ write(data, _encoding, done) {
      const event = JSON.parse(data); child.messages.push(event); done();
      if (event.type === 'init' && !slowReady) setImmediate(() => child.emitMessage({ type: 'ready' }));
      if (event.type === 'speak') setImmediate(() => {
        child.emitMessage({ type: 'chunk', id: event.id, audio: 'AAA=', sampleRate: 24000 });
        child.emitMessage({ type: 'done', id: event.id, firstAudioSeconds: 0.1 });
      });
    } });
    child.kill = () => { child.killed = true; child.emit('close', 0); };
    children.push(child); return child;
  } });
  t.after(() => voice.close());
  return { voice, config, children, events };
}

test('Qwen reuses its warm process, streams matching request IDs and unloads after idle', async t => {
  const { voice, config, children, events } = await fixture(t, { idleMs: 20 });
  assert.equal((await voice.speak(config, { id: 'first', text: 'Hello.' }, () => true)).streamed, true);
  assert.equal((await voice.speak(config, { id: 'second', text: 'Again.' }, () => true)).ok, true);
  assert.equal(children.length, 1);
  assert.deepEqual(events.map(event => event.id), ['first', 'second']);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(voice.child, null); assert.equal(children[0].killed, true);
});

test('cancel during warmup never sends the cancelled utterance after ready', async t => {
  const { voice, config, children, events } = await fixture(t, { slowReady: true });
  const pending = voice.speak(config, { id: 'cancelled', text: 'Do not speak.' }, () => true);
  voice.cancel(); children[0].emitMessage({ type: 'ready' });
  assert.equal((await pending).error, 'cancelled');
  assert.equal(children[0].messages.filter(event => event.type === 'speak').length, 0);
  assert.equal(events.length, 0);
});

test('packaged Qwen launches its unpacked Python script outside app.asar', async t => {
  const { voice, config, children } = await fixture(t);
  voice.root = path.join(config.ttsModel, 'app.asar');
  await voice.ensure(config);
  assert.equal(children[0].args[1], path.join(voice.root + '.unpacked', 'scripts/tts-qwen-worker.py'));
});

test('permission loss suppresses PCM and keeps the worker cancellable', async t => {
  const { voice, config, events } = await fixture(t);
  let checks = 0;
  const result = await voice.speak(config, { id: 'paused', text: 'Hello.' }, () => ++checks === 1);
  assert.equal(result.error, 'cancelled'); assert.equal(events.length, 0);
});

test('worker exit rejects an active request rather than hanging', async t => {
  const { voice, config, children } = await fixture(t);
  await voice.ensure(config);
  const pending = voice.speak(config, { id: 'failure', text: 'Hello.' }, () => true);
  await Promise.resolve(); children[0].emit('close', 1);
  assert.equal((await pending).ok, false);
});

test('a broken worker input pipe rejects the request without an unhandled stream error', async t => {
  const { voice, config, children } = await fixture(t);
  await voice.ensure(config);
  const pending = voice.speak(config, { id: 'broken-pipe', text: 'Hello.' }, () => true);
  await Promise.resolve(); children[0].stdin.emit('error', Error('EPIPE'));
  assert.equal((await pending).ok, false);
});

test('streamed text queues complete phrases once and Escape suppresses the rest of the reply', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/renderer/js/speech-output.js'), 'utf8');
  const { SpeechPlayer, speechText } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const saved = { window: global.window, document: global.document, cancelAnimationFrame: global.cancelAnimationFrame };
  global.window = global.document = { addEventListener() {} }; global.cancelAnimationFrame = () => {};
  try {
    const spoken = [];
    const player = new SpeechPlayer({ host: { ttsCancel() {} }, voice: {} });
    player.configure({ ttsEnabled: true, ttsEngine: 'qwen' });
    player.play = async text => { spoken.push(text); };
    const first = 'Easy, sweetheart. We can take this one step at a time. ';
    player.beginResponse(); player.updateResponse(first + 'Let');
    await new Promise(resolve => setImmediate(resolve));
    player.updateResponse(first + "Let's save your work.", true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(spoken.join(' '), first.trim() + " Let's save your work.");
    spoken.length = 0; player.beginResponse(); player.stop();
    player.updateResponse('This must stay silent.', true);
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(spoken, []);
    assert.equal(speechText('Hello ```js\nsecret()``` [[close:app]] [friend](https://example.com)'), 'Hello friend');
  } finally { Object.assign(global, saved); }
});
