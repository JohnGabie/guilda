import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

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
});

test('invalid config: exit 0 and silent', () => {
  const dir = tempProject({ config: '{ not json' });
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.deepEqual(journalFiles(dir), []);
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
