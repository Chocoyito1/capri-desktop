'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { voiceSetup } = require('../src/main/voice-setup');
test('prepared voice applies once on launch and preserves later voice and mute choices', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capri-voice-setup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.caprigpt-local'));
  await Promise.all(['python.exe', 'config.json', 'ref.wav'].map(name => fs.writeFile(path.join(root, name), 'fixture')));
  const setup = { id: 'selected-A', ttsPython: path.join(root, 'python.exe'), ttsModel: root,
    ttsReference: path.join(root, 'ref.wav'), ttsReferenceText: 'Hello.' };
  await fs.writeFile(path.join(root, '.caprigpt-local/voice-setup.json'), JSON.stringify(setup));
  const first = voiceSetup(root, { muted: true, scale: 0.6 });
  assert.equal(first.ttsEngine, 'qwen'); assert.equal(first.ttsEnabled, true); assert.equal(first.muted, true); assert.equal(first.scale, 0.6);
  const previousProfile = process.env.CAPRIGPT_TEST_PROFILE;
  try {
    process.env.CAPRIGPT_TEST_PROFILE = path.join(root, 'isolated-test');
    const isolated = {}; assert.equal(voiceSetup(root, isolated), isolated);
  } finally {
    if (previousProfile === undefined) delete process.env.CAPRIGPT_TEST_PROFILE;
    else process.env.CAPRIGPT_TEST_PROFILE = previousProfile;
  }
  const changed = { ...first, ttsEnabled: false, ttsEngine: 'windows' };
  assert.equal(voiceSetup(root, changed), changed);
  await fs.unlink(setup.ttsReference);
  const missing = { muted: false }; assert.equal(voiceSetup(root, missing), missing);
});
