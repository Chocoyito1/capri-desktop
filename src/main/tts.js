'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function spokenText(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/\[\[[\s\S]*?\]\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
}

class SpeechOutput {
  constructor({ root, config, allowed, notify = () => {}, launch = spawn }) {
    Object.assign(this, { root, config, allowed, notify, launch });
    this.epoch = 0;
  }
  cancel(notify = true) {
    this.epoch++;
    this.job?.kill();
    this.job = null;
    if (notify) this.notify({ type: 'stopped' });
  }
  async speak(request) {
    this.cancel(false);
    const epoch = this.epoch, cfg = this.config();
    const text = typeof request?.text === 'string' ? spokenText(request.text) : '';
    if (!cfg.ttsEnabled || cfg.muted || !this.allowed() || !text) return { ok: false, error: 'speech-output-paused' };
    if (!['windows', 'chatterbox', 'f5'].includes(cfg.ttsEngine)) return { ok: false, error: 'Invalid voice engine.' };
    let dir, child;
    try {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capri-tts-'));
      const file = path.join(dir, 'request.json'), output = path.join(dir, 'speech.wav');
      await fs.writeFile(file, JSON.stringify({ ttsEngine: cfg.ttsEngine, ttsDevice: cfg.ttsDevice, ttsReference: cfg.ttsReference, ttsReferenceText: cfg.ttsReferenceText, text, output }), 'utf8');
      if (epoch !== this.epoch) return { ok: false, error: 'cancelled' };
      const windows = cfg.ttsEngine === 'windows';
      child = this.launch(windows ? 'powershell.exe' : cfg.ttsPython,
        windows ? ['-NoProfile', '-NonInteractive', '-File', path.join(this.root, 'scripts/tts-windows.ps1'), '-Request', file]
          : [path.join(this.root, 'scripts/tts-local.py'), file],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      this.job = child;
      await new Promise((resolve, reject) => {
        let detail = '';
        child.stderr.on('data', data => { detail = (detail + data.toString()).slice(-1500); });
        const timer = setTimeout(() => { child.kill(); reject(Error('Voice generation timed out.')); }, 120000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(detail || 'Voice generation stopped.')); });
      });
      if (epoch !== this.epoch || !this.allowed()) return { ok: false, error: 'cancelled' };
      if ((await fs.stat(output)).size > 16 * 1024 * 1024) throw Error('Voice output too large.');
      const audio = await fs.readFile(output);
      if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid voice audio.');
      if (epoch !== this.epoch || !this.allowed()) return { ok: false, error: 'cancelled' };
      return { ok: true, audio: audio.toString('base64') };
    } catch (error) {
      return { ok: false, error: epoch !== this.epoch ? 'cancelled' : error.message };
    } finally {
      if (this.job === child) this.job = null;
      if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
module.exports = { SpeechOutput, spokenText };
