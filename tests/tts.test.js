'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const { SpeechOutput, spokenText } = require('../src/main/tts');
const { wave } = require('../src/main/whisper-engine');

test('spoken text removes commands, code and link targets', () => {
  assert.equal(spokenText('**Hello** [[close: app]] ```js\nbad()``` [friend](https://example.com)'), 'Hello friend');
  assert.equal(spokenText('x'.repeat(2000)).length, 1500);
});

test('local synthesis returns WAV and cleans its private request directory', async () => {
  let requestFile;
  const out = new SpeechOutput({ root: process.cwd(), config: () => ({ttsEnabled:true,ttsEngine:'windows'}), allowed: () => true,
    launch: (_exe, args) => {
      requestFile = args.at(-1);
      const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => child.emit('close', 1);
      setImmediate(async () => {
        const request = JSON.parse(await fs.readFile(requestFile, 'utf8'));
        await fs.writeFile(request.output, wave(Buffer.alloc(32000)));
        child.emit('close', 0);
      });
      return child;
    } });
  const result = await out.speak({text:'Hi'});
  assert.equal(result.ok, true);
  assert.equal(Buffer.from(result.audio, 'base64').toString('ascii',0,4), 'RIFF');
  await assert.rejects(fs.access(requestFile));
});

test('interruption kills generation and suppresses stale audio', async () => {
  let ready, killed = false;
  const launched = new Promise(resolve => { ready = resolve; });
  const out = new SpeechOutput({ root: process.cwd(), config: () => ({ttsEnabled:true,ttsEngine:'windows'}), allowed: () => true,
    launch: () => {
      const child = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { killed = true; child.emit('close', 1); };
      ready(); return child;
    } });
  const job = out.speak({text:'A long reply'});
  await launched; out.cancel();
  assert.equal((await job).error, 'cancelled'); assert.equal(killed, true);
});

test('muting and pause prevent the engine from starting', async () => {
  const out = new SpeechOutput({root:process.cwd(),config:()=>({ttsEnabled:true,muted:true}),allowed:()=>true,
    launch:()=>assert.fail('muted engine must not start')});
  assert.equal((await out.speak({text:'Hi'})).ok,false);
});

test('renderer discards a completed synthesis after stop', async () => {
  const source = await fs.readFile(require.resolve('../src/renderer/js/speech-output.js'), 'utf8');
  const { SpeechPlayer } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const old = {window:global.window,document:global.document,cancelAnimationFrame:global.cancelAnimationFrame};
  global.window = global.document = {addEventListener(){}};
  global.cancelAnimationFrame = () => {};
  try {
    let complete, ensure = 0;
    const player = new SpeechPlayer({host:{ttsCancel(){},ttsSpeak:()=>new Promise(resolve=>{complete=resolve;})},
      voice:{ensure(){ensure++;}}});
    player.configure({ttsEnabled:true});
    const pending = player.speak('Old answer'); player.stop();
    complete({ok:true,audio:'unused'}); await pending;
    assert.equal(ensure,0);
  } finally { Object.assign(global,old); }
});
