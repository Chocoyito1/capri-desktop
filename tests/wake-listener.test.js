'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { SpeechInput } = require('../src/main/speech');
const { wakePhrase } = require('../src/main/wake-phrase');
const tick = () => new Promise(resolve => setImmediate(resolve));
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

test('wake address requires Hey Capri at the beginning and preserves the addressed request', () => {
  assert.deepEqual(wakePhrase('Hey, Capri! Open Firefox.'), { text: 'Open Firefox.' });
  assert.deepEqual(wakePhrase('HEY CAPRI'), { text: '' });
  assert.deepEqual(wakePhrase('Hey Capri?'), { text: '' });
  assert.equal(wakePhrase('Hey Capri '+ 'a'.repeat(600)).text.length, 501, 'Keep an overflow character so dictation can reject auto-send of a truncated request');
  assert.deepEqual(wakePhrase('Ey Capri, hola'), { text: 'hola' });
  for (const text of ['Capri open Firefox', 'they say hey Capri', 'Hey Capricorn', 'hey capricornio', 'Hey Siri', '', null]) assert.equal(wakePhrase(text), null);
});

function speechFixture() {
  const events = [], jobs = []; let enabled = true, stops = 0;
  const speech = new SpeechInput({ allowed: () => false, wakeAllowed: () => enabled, notify: event => events.push(event),
    engine: { start: async () => {}, stop() { stops++; }, transcribe: (pcm, signal) => new Promise(resolve => jobs.push({ resolve, signal })) } });
  return { speech, events, jobs, revoke() { enabled = false; }, stops: () => stops };
}

test('background listener ignores ambient transcripts, keeps running and hands off the same session in games', async () => {
  const f = speechFixture();
  try {
    assert.equal(f.speech.start({ id: 'wake-session-01', mode: 'wake' }).ok, true);
    await tick(); const slot = f.speech.current;
    assert.equal(slot.timeout, undefined, 'Background wake listening has no 90-second timeout');
    for (let i = 0; i < 100; i++) f.speech.audio({ id: slot.id, samples: Buffer.alloc(32000) });
    assert.equal(f.speech.current, slot, 'Ambient listening survives more than 90 seconds of microphone audio');
    assert.equal(slot.total, 0, 'Continuous background audio does not accumulate a recording');
    f.speech.enqueue(slot, Buffer.alloc(4000)); f.jobs[0].resolve('This is ordinary private conversation.'); await tick();
    assert.equal(f.events.some(event => event.type === 'final' || event.type === 'wake'), false);
    assert.equal(slot.mode, 'wake');
    f.speech.enqueue(slot, Buffer.alloc(4000)); f.jobs[1].resolve('Hey Capri, what time is it?'); await tick();
    assert.equal(f.speech.current, slot); assert.equal(slot.wakeActivated, true);
    assert.equal(f.events.find(event => event.type === 'wake').text, 'what time is it?');
    f.speech.enqueue(slot, Buffer.alloc(4000)); f.jobs[2].resolve('And what day is it?'); await tick();
    assert.equal(f.events.at(-1).text, 'And what day is it?');
    f.speech.stop(slot.id); assert.equal(f.speech.current, null);
    assert.equal(f.stops(), 0, 'Keep the already loaded local model warm for the next wake');
  } finally { f.speech.cancel(true); }
});

test('wake permission revocation and cancellation discard in-flight recognition; cold exit stops the model', async () => {
  const f = speechFixture();
  await f.speech.start({ id: 'wake-session-02', mode: 'wake' }); await tick();
  f.speech.enqueue(f.speech.current, Buffer.alloc(4000)); f.revoke();
  f.jobs[0].resolve('Hey Capri delete this'); await tick();
  assert.equal(f.events.some(event => event.type === 'wake'), false); assert.equal(f.speech.current, null);
  assert.ok(f.stops() > 0); f.speech.cancel(true);
});

test('renderer preserves the live microphone when waking and yields it for manual dictation', async () => {
  global.window = { addEventListener() {} };
  const code = fs.readFileSync(path.join(__dirname, '../src/renderer/js/wake-listener.js'), 'utf8')
    .replace("import { MicrophoneCapture } from './microphone.js';", 'class MicrophoneCapture {}');
  const { WakeListener } = await import(uri(code));
  const calls = [], captures = [], wakes = []; let receive;
  const indicator = { addEventListener() {}, setAttribute() {}, dataset: {} };
  const listener = new WakeListener({ indicator, blocked: () => false,
    host: { onSpeechState: fn => { receive = fn; }, speechStart: async request => { calls.push(request); return { ok: true }; },
      speechCancel: request => calls.push({ cancel: request.id }), speechAudio: request => calls.push({ audio: request.id }), wakeEndSession() {} },
    captureFactory: () => { const capture = { start: async onSamples => { capture.send = onSamples; }, cancel: () => { capture.cancelled = true; } }; captures.push(capture); return capture; },
    onWake: event => wakes.push(event) });
  try {
    listener.configure({ wakeWordEnabled: true }); await tick(); const id = listener.id;
    assert.equal(calls[0].mode, 'wake');
    await receive({ id, type: 'ready' }); captures[0].send(new ArrayBuffer(4));
    await receive({ id, type: 'wake', text: 'Hello', complete: true });
    assert.equal(wakes[0].capture, captures[0]); assert.equal(wakes[0].id, id);
    assert.equal(captures[0].cancelled, undefined, 'The addressed words keep flowing through the same stream');
    captures[0].send(new ArrayBuffer(4)); assert.equal(calls.at(-1).audio, id);
    listener.tick(); await tick(); listener.pause(); assert.equal(captures[1].cancelled, true);
    listener.configure({ wakeWordEnabled: false }); assert.equal(listener.id, null); assert.equal(listener.session, false);
  } finally { clearInterval(listener.timer); listener.pause(); }
});

test('wake setting is a displayed boolean preference, not arbitrary overlay config', () => {
  const { settingsPatch, overlayPatch } = require('../src/main/settings-policy');
  assert.deepEqual(settingsPatch({ wakeWordEnabled: false }), { wakeWordEnabled: false });
  assert.throws(() => settingsPatch({ wakeWordEnabled: 'yes' }));
  assert.throws(() => overlayPatch({ wakeWordEnabled: true }));
});
