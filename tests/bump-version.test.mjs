import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPT_SRC = path.join(REPO_ROOT, 'scripts', 'bump-version.mjs');
const MANIFESTS = [
  '.claude-plugin/plugin.json',
  'plugins/one/.claude-plugin/plugin.json',
  'plugins/two/.claude-plugin/plugin.json',
];
const EXCLUDE = ['docs', 'scripts/changelog.mjs', '.version-bump.json', 'scripts', 'node_modules', '.git'];

/** Build a temp repo: a copy of the script, a list, and manifests at 0.1.1. Never removed. */
function fixture(count = 3) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda bump '));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'bump-version.mjs'));
  const list = {
    files: MANIFESTS.map((p) => ({ path: p, field: 'version' })),
    audit: { exclude: EXCLUDE },
  };
  fs.writeFileSync(path.join(dir, '.version-bump.json'), JSON.stringify(list, null, 2) + '\n');
  for (const p of MANIFESTS.slice(0, count)) setManifest(dir, p, '0.1.1');
  return dir;
}

function setManifest(dir, p, version) {
  const file = path.join(dir, p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ name: 'x', version }, null, 2) + '\n');
}

function versionOf(dir, p) {
  return JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8')).version;
}

function run(dir, ...args) {
  return spawnSync(process.execPath, [path.join(dir, 'scripts', 'bump-version.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('a bump writes 0.2.0 in the three manifests', () => {
  const dir = fixture();
  const r = run(dir, '0.2.0');
  assert.equal(r.status, 0, r.stderr);
  for (const p of MANIFESTS) {
    assert.equal(versionOf(dir, p), '0.2.0');
    assert.ok(r.stdout.includes(`${p}: 0.1.1 -> 0.2.0`), r.stdout);
    const text = fs.readFileSync(path.join(dir, p), 'utf8');
    assert.equal(text, JSON.stringify({ name: 'x', version: '0.2.0' }, null, 2) + '\n');
  }
});

test('--check exits 0 when equal, 1 when one is 0.2.1', () => {
  const dir = fixture();
  assert.equal(run(dir, '0.2.0').status, 0);
  const ok = run(dir, '--check');
  assert.equal(ok.status, 0, ok.stderr);
  for (const p of MANIFESTS) assert.ok(ok.stdout.includes(`${p}: 0.2.0`), ok.stdout);
  setManifest(dir, MANIFESTS[1], '0.2.1');
  assert.equal(run(dir, '--check').status, 1);
});

test('abc, 0.2.0-beta and 0.2 exit 1 and change no manifest', () => {
  const dir = fixture();
  for (const v of ['abc', '0.2.0-beta', '0.2']) {
    const r = run(dir, v);
    assert.equal(r.status, 1, `${v}: ${r.stdout}`);
    for (const p of MANIFESTS) assert.equal(versionOf(dir, p), '0.1.1');
  }
});

test('a missing listed manifest: a bump to 0.3.0 exits 1, names the path and changes no other manifest; --check exits 1', () => {
  const dir = fixture(2);
  const r = run(dir, '0.3.0');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes(`missing: ${MANIFESTS[2]}`), r.stdout + r.stderr);
  for (const p of MANIFESTS.slice(0, 2)) assert.equal(versionOf(dir, p), '0.1.1');
  const c = run(dir, '--check');
  assert.equal(c.status, 1);
  assert.ok(c.stdout.includes(`missing: ${MANIFESTS[2]}`), c.stdout + c.stderr);
});

test('a listed manifest with no version field: --check and --audit exit 1 and name the path', () => {
  const dir = fixture();
  for (const p of MANIFESTS) fs.writeFileSync(path.join(dir, p), JSON.stringify({ name: 'x' }, null, 2) + '\n');
  for (const flag of ['--check', '--audit']) {
    const r = run(dir, flag);
    assert.equal(r.status, 1, `${flag}: ${r.stdout}`);
    for (const p of MANIFESTS) assert.ok(r.stdout.includes(`no version: ${p}`), r.stdout);
  }
});

test('--audit exits 0 with equal versions', () => {
  const dir = fixture();
  const r = run(dir, '--audit');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('--audit exits 1 and prints notes.txt', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'released as 0.1.1\n');
  const r = run(dir, '--audit');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.split('\n').includes('notes.txt'), r.stdout);
});

test('a file in a docs folder does not change the audit', () => {
  const dir = fixture();
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'old.md'), 'version 0.1.1\n');
  fs.mkdirSync(path.join(dir, 'plugins', 'one', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins', 'one', 'docs', 'old.md'), 'version 0.1.1\n');
  const r = run(dir, '--audit');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a file named in audit.exclude by its full relative path (scripts/changelog.mjs) does not change the audit', () => {
  const dir = fixture();
  // The script folder is not excluded by its segment in this fixture list, so use a list without 'scripts'.
  const listPath = path.join(dir, '.version-bump.json');
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  list.audit.exclude = list.audit.exclude.filter((e) => e !== 'scripts');
  fs.writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'scripts', 'changelog.mjs'), '// since 0.1.1\n');
  const r = run(dir, '--audit');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  fs.writeFileSync(path.join(dir, 'scripts', 'other.mjs'), '// since 0.1.1\n');
  const r2 = run(dir, '--audit');
  assert.equal(r2.status, 1);
  assert.ok(r2.stdout.split('\n').includes('scripts/other.mjs'), r2.stdout);
});

test('the repository list: --check exits 0 and --audit exits 0 in the repository', () => {
  const script = path.join(REPO_ROOT, 'scripts', 'bump-version.mjs');
  const check = spawnSync(process.execPath, [script, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const audit = spawnSync(process.execPath, [script, '--audit'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
});

test('bump-version lists four manifests (S33)', () => {
  const list = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.version-bump.json'), 'utf8'));
  const paths = list.files.map((f) => f.path);
  assert.equal(paths.length, 4, paths.join(', '));
  assert.deepEqual(paths, [
    '.claude-plugin/plugin.json',
    'plugins/guilda-skills/.claude-plugin/plugin.json',
    'plugins/ios-on-linux/.claude-plugin/plugin.json',
    'plugins/guilda-panel/.claude-plugin/plugin.json',
  ]);
});
