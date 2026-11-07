'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { source, inspectArchive } = require('../scripts/release-check.cjs');

function fixture(t, version = '0.4.0-alpha.1', stability = 'alpha') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Inject Git receipts; sandboxed sessions cannot write repository metadata.
  const state = { head: 'a'.repeat(40), tag: 'a'.repeat(40), onMain: true, dirty: '' };
  const git = (...args) => {
    if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? state.head : state.tag;
    if (args[0] === 'merge-base') {
      assert.deepEqual(args, ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']);
      if (!state.onMain) throw new Error('Not on main');
      return '';
    }
    if (args[0] === 'status') return state.dirty;
    throw new Error(`Unexpected git invocation: ${args}`);
  };
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
  fs.mkdirSync(path.join(root, 'releases'));
  fs.writeFileSync(path.join(root, 'releases', `v${version}.md`), `Stability: ${stability}\nPlatform: Windows x64\n`);
  return { root, state, check: (env = {}) => source(root, env, git) };
}

test('release gate identifies exact prerelease source and stable source', t => {
  const alpha = fixture(t);
  const info = alpha.check({ GITHUB_REF: 'refs/tags/v0.4.0-alpha.1' });
  assert.equal(info.stability, 'alpha');
  assert.equal(info.commit, alpha.state.head);
  assert.equal(info.arch, 'x64');
  assert.equal(fixture(t, '0.4.0', 'stable').check().stability, 'stable');
});

test('release gate rejects dirty work and an event for another tag', t => {
  const f = fixture(t);
  assert.throws(() => f.check({ GITHUB_REF: 'refs/tags/v9.0.0' }));
  f.state.dirty = '?? unfinished.txt';
  assert.throws(() => f.check(), /clean/);
});

test('release gate rejects wrong stability and lock mismatch', t => {
  const wrong = fixture(t, '0.4.0-beta.1', 'stable');
  assert.throws(() => wrong.check());
  const f = fixture(t);
  const { root } = f;
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  lock.packages[''].version = '0.3.1';
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => f.check());
});

test('release gate rejects a tagged commit outside main and a tag not at HEAD', t => {
  const f = fixture(t);
  f.state.onMain = false;
  assert.throws(() => f.check(), /Not on main/);
  f.state.onMain = true;
  f.state.head = 'b'.repeat(40);
  assert.throws(() => f.check(), /Tag must identify HEAD/);
});

async function archiveFixture(t, extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, 'payload');
  for (const file of ['package.json', 'src/main/main.js', 'src/preload.js', 'src/renderer/index.html', 'LICENSE', ...(extra ? [extra] : [])]) {
    const target = path.join(payload, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file === 'package.json' ? '{"version":"0.4.0"}' : 'fixture');
  }
  const archive = path.join(root, 'app.asar');
  await require('@electron/asar').createPackage(payload, archive);
  fs.mkdirSync(path.join(`${archive}.unpacked`, 'node_modules', 'koffi'), { recursive: true });
  const native = path.join(`${archive}.unpacked`, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node');
  fs.mkdirSync(path.dirname(native), { recursive: true });
  fs.writeFileSync(native, 'native fixture');
  return archive;
}

test('archive inspection accepts required payload and rejects mismatched version or missing native files', async t => {
  const archive = await archiveFixture(t);
  inspectArchive(archive, '0.4.0');
  assert.throws(() => inspectArchive(archive, '0.4.1'));
  fs.unlinkSync(path.join(`${archive}.unpacked`, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'));
  assert.throws(() => inspectArchive(archive, '0.4.0'), /Windows x64 koffi binary/);
  fs.rmdirSync(path.join(`${archive}.unpacked`, 'node_modules', 'koffi'));
  assert.throws(() => inspectArchive(archive, '0.4.0'), /Native koffi/);
});

test('archive inspection rejects local credentials and model payloads', async t => {
  for (const file of ['.caprigpt-local/token.json', 'assets/private.gguf']) {
    const archive = await archiveFixture(t, file);
    assert.throws(() => inspectArchive(archive, '0.4.0'), /Private\/development payload/);
  }
});
