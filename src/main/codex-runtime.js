'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function executable(explicit = '', env = process.env) {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const valid = file => {
    try { return typeof file === 'string' && path.isAbsolute(file)
      && path.basename(file).toLowerCase() === name && fs.statSync(file).isFile(); } catch { return false; }
  };
  const candidates = [explicit, env.CAPRIGPT_CODEX_EXE,
    env.CODEX_ELECTRON_RESOURCES_PATH && path.join(env.CODEX_ELECTRON_RESOURCES_PATH, name),
    ...(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name))];
  const found = candidates.find(valid);
  if (found) return found;
  // Native binary from the official npm CLI package; don't spawn a .cmd shell.
  const npmRoot = env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', '@openai');
  if (npmRoot) for (const relative of ['codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe',
    'codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe']) {
    const file = path.join(npmRoot, relative); if (valid(file)) return file;
  }
  if (process.platform === 'win32') {
    try {
      const ps = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const install = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1).InstallLocation'],
      { windowsHide: true, timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const file = path.join(install, 'app', 'resources', name); if (valid(file)) return file;
    } catch { /* User can choose the native CLI in Connections. */ }
  }
  return null;
}
module.exports = { executable };
