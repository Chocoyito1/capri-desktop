'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A locally prepared voice is applied once, on launch, without touching a live
// process's cached preferences. Later user choices always take precedence.
function voiceSetup(root, saved) {
  if (process.env.CAPRIGPT_TEST_PROFILE) return saved;
  try {
    const file = path.join(root, '.caprigpt-local/voice-setup.json');
    if (fs.statSync(file).size > 16000) return saved;
    const setup = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof setup.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(setup.id) || saved.ttsSetupId === setup.id) return saved;
    for (const key of ['ttsPython', 'ttsModel', 'ttsReference']) {
      if (typeof setup[key] !== 'string' || !path.isAbsolute(setup[key]) || !fs.existsSync(setup[key])) return saved;
    }
    if (!fs.existsSync(path.join(setup.ttsModel, 'config.json')) || typeof setup.ttsReferenceText !== 'string'
        || !setup.ttsReferenceText.trim() || setup.ttsReferenceText.length > 2000) return saved;
    return { ...saved, ttsEnabled: true, ttsEngine: 'qwen', ttsDevice: 'cuda',
      ttsPython: setup.ttsPython, ttsModel: setup.ttsModel, ttsReference: setup.ttsReference,
      ttsReferenceText: setup.ttsReferenceText, ttsSetupId: setup.id };
  } catch { return saved; }
}
module.exports = { voiceSetup };
