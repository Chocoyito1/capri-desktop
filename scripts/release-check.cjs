'use strict';

// No network or publication. Called only on a clean, checked-out release tag.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function source(checkout = root, env = process.env, git = (...args) =>
  execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(checkout, 'package-lock.json')));
  const version = pkg.version;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version);
  assert.ok(match, 'Expected SemVer, optionally alpha.N, beta.N or rc.N');
  const tag = `v${version}`;
  if (env.GITHUB_REF) assert.equal(env.GITHUB_REF, `refs/tags/${tag}`);
  assert.equal(git('rev-parse', `${tag}^{commit}`), git('rev-parse', 'HEAD'), 'Tag must identify HEAD');
  git('merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main');
  assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '', 'Release checkout must be clean');
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  const notes = fs.readFileSync(path.join(checkout, 'releases', `${tag}.md`), 'utf8');
  const stability = match[4] || 'stable';
  assert.match(notes, new RegExp(`^Stability: ${stability}\\s*$`, 'm'));
  assert.match(notes, /^Platform: Windows x64\s*$/m);
  return { tag, version, commit: git('rev-parse', 'HEAD'), platform: 'windows',
    arch: 'x64', stability, verification: 'Structural checks only; manual installer/runtime review required' };
}

function inspectArchive(archive, version) {
  const asar = require('@electron/asar');
  const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/'));
  const forbidden = /(?:^|\/)(?:\.caprigpt-local|\.git|captures|tests|\.env(?:\.[^/]*)?|[^/]+\.(?:gguf|onnx|safetensors|mp3|wav|pem|key))(?:\/|$)/i;
  for (const name of entries) assert.ok(!forbidden.test(name), `Private/development payload: ${name}`);
  for (const name of ['/package.json', '/src/main/main.js', '/src/preload.js', '/src/renderer/index.html', '/LICENSE']) {
    assert.ok(entries.includes(name), `Missing packaged entry: ${name}`);
  }
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packaged.version, version);
  assert.ok(fs.existsSync(path.join(`${archive}.unpacked`, 'node_modules', 'koffi')), 'Native koffi must be unpacked');
  const native = path.join(`${archive}.unpacked`, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node');
  assert.ok(fs.existsSync(native) && fs.statSync(native).size > 0, 'Windows x64 koffi binary must be unpacked');
}

module.exports = { source, inspectArchive };

async function artifacts() {
  const manifest = source();
  const dist = path.join(root, 'dist');
  inspectArchive(path.join(dist, 'win-unpacked', 'resources', 'app.asar'), manifest.version);
  const installer = `CapriGPT-Setup-${manifest.version}.exe`;
  const data = fs.readFileSync(path.join(dist, installer));
  assert.equal(data.subarray(0, 2).toString(), 'MZ', 'Installer must be a Windows executable');
  manifest.artifacts = [{ file: installer, bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex') }];
  const manifestFile = 'release-manifest.json';
  const manifestData = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(dist, manifestFile), manifestData);
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'),
    `${manifest.artifacts[0].sha256}  ${installer}\n`
    + `${createHash('sha256').update(manifestData).digest('hex')}  ${manifestFile}\n`);
  console.log(`Inspected ${manifest.tag} (${manifest.commit}), Windows x64, ${manifest.stability}`);
}

if (require.main === module) {
  Promise.resolve().then(() => {
    if (process.argv[2] === 'source') console.log(JSON.stringify(source(), null, 2));
    else if (process.argv[2] === 'artifacts') return artifacts();
    else throw new Error('Usage: node scripts/release-check.cjs source|artifacts');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
