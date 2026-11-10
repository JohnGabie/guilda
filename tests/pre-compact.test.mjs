import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';
import { MARKER } from '../scripts/journal-skeleton.mjs';

const SCRIPT = 'scripts/hooks/pre-compact.mjs';
const run = (dir, trigger = 'manual') =>
  runHook(SCRIPT, { hook_event_name: 'PreCompact', trigger, cwd: dir }, dir);
const journalFiles = (dir) => {
  try {
    return fs.readdirSync(path.join(dir, '.journal'));
  } catch {
    return [];
  }
};
const violations = (dir) => {
  try {
    return fs
      .readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

test('no config: exit 0, no file created', () => {
  const dir = tempProject();
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.deepEqual(journalFiles(dir), []);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  assert.equal(fs.existsSync(path.join(dir, '.journal')), false);
});

test('broken project layer: manual compaction with an unfilled diary exits 2 and records R18 (S11)', () => {
  const invalidConfig = () => tempProject({ config: '{ not json' });
  const noConfig = () => {
    const dir = tempProject();
    fs.mkdirSync(path.join(dir, '.guilda'));
    return dir;
  };
  for (const make of [invalidConfig, noConfig]) {
    const dir = make();
    const name = '2026-01-01-000000-x.md';
    fs.mkdirSync(path.join(dir, '.journal'));
    fs.writeFileSync(path.join(dir, '.journal', name), `# Diary\n\n${MARKER}\n`);
    const r = run(dir, 'manual');
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes(name), r.stderr);
    const v = violations(dir);
    assert.equal(v.length, 1);
    assert.equal(v[0].rule, 'R18');
  }
});

test('manual + markers: exit 2 and one R18 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const r = run(dir, 'manual');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Context diary incomplete/);
  assert.match(r.stderr, /TODO-CONTEXT/);
  assert.equal(journalFiles(dir).length, 1);
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R18');
  assert.equal(v[0].level, 'law');
  assert.equal(v[0].source, 'pre-compact');
  assert.equal(v[0].action, 'manual compact with unfilled diary');
});

test('manual + filled diary: exit 0', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.journal'));
  fs.writeFileSync(path.join(dir, '.journal', '2026-01-01-000000-x.md'), '# Diary\n\nAll filled.\n');
  const r = run(dir, 'manual');
  assert.equal(r.code, 0);
  assert.equal(journalFiles(dir).length, 1);
  assert.deepEqual(violations(dir), []);
});

test('auto + markers: exit 0 and no violation', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const r = run(dir, 'auto');
  assert.equal(r.code, 0);
  assert.equal(journalFiles(dir).length, 1);
  assert.deepEqual(violations(dir), []);
});

test('missing or unknown trigger: exit 0 and no violation', () => {
  for (const input of [{ cwd: 'x' }, { trigger: 'other' }, { trigger: 5 }]) {
    const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
    const r = runHook(SCRIPT, { hook_event_name: 'PreCompact', ...input, cwd: dir }, dir);
    assert.equal(r.code, 0);
    assert.deepEqual(violations(dir), []);
  }
});

test('invalid stdin with a config: exit 0 and no violation', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: '{ not json',
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(r.status, 0);
  assert.deepEqual(violations(dir), []);
});

test('diary older than 30 minutes: a new skeleton is created', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.journal'));
  const old = path.join(dir, '.journal', '2026-01-01-000000-old.md');
  fs.writeFileSync(old, '# Old diary, filled\n');
  const past = new Date(Date.now() - 31 * 60 * 1000);
  fs.utimesSync(old, past, past);
  const r = run(dir, 'manual');
  assert.equal(r.code, 2);
  assert.equal(journalFiles(dir).length, 2);
});
