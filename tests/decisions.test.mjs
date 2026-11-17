import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'decisions.mjs');
const run = (dir, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const file = (dir) => path.join(dir, '.guilda', 'decisions-pending.md');
const ADD = (id, extra = []) => [
  'add', '--id', id, '--context', 'The new login page needs a color', '--option', 'Blue', '--option', 'Green',
  '--option', 'Gray', '--recommended', '2', '--blocks', 'the login page', ...extra,
];

test('add writes the block', () => {
  const dir = tempProject();
  const r = run(dir, ...ADD('D1', ['--now', '2026-11-17T10:00:00Z']));
  assert.equal(r.code, 0, r.stderr);
  const text = fs.readFileSync(file(dir), 'utf8');
  assert.match(text, /^## D1$/m);
  assert.match(text, /^asked: /m);
  assert.match(text, /^context: The new login page needs a color$/m);
  assert.match(text, /^blocks: the login page$/m);
  assert.equal((text.match(/^\d\. /gm) ?? []).length, 3);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda')), ['decisions-pending.md']);
});

test('the recommended option is first', () => {
  const dir = tempProject();
  assert.equal(run(dir, ...ADD('D1')).code, 0);
  const lines = fs.readFileSync(file(dir), 'utf8').split('\n').filter((l) => /^\d\. /.test(l));
  assert.deepEqual(lines, ['1. Green (recommended)', '2. Blue', '3. Gray']);
});

test('resolve removes the block and prints the answer', () => {
  const dir = tempProject();
  run(dir, ...ADD('D1'));
  run(dir, ...ADD('D2'));
  const r = run(dir, 'resolve', 'D1', '--answer', 'Green it is');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^## D1$/m);
  assert.match(r.stdout, /^answer: Green it is$/m);
  const text = fs.readFileSync(file(dir), 'utf8');
  assert.doesNotMatch(text, /^## D1$/m);
  assert.match(text, /^## D2$/m);
  assert.equal(run(dir, 'resolve', 'D1', '--answer', 'x').code, 1);
});

test('a second add of one ID exits 1', () => {
  const dir = tempProject();
  assert.equal(run(dir, ...ADD('D1')).code, 0);
  assert.equal(run(dir, ...ADD('D1')).code, 1);
  assert.equal(run(dir, ...ADD('bad id')).code, 1);
});

test('one option exits 1', () => {
  const dir = tempProject();
  const r = run(dir, 'add', '--id', 'D1', '--context', 'c', '--option', 'Only', '--recommended', '1', '--blocks', 'b');
  assert.equal(r.code, 1);
  assert.equal(fs.existsSync(file(dir)), false);
});

test('asked comes from --now', () => {
  const dir = tempProject();
  run(dir, ...ADD('D1', ['--now', '2026-11-17T10:00:00.000Z']));
  assert.match(fs.readFileSync(file(dir), 'utf8'), /^asked: 2026-11-17T10:00:00\.000Z$/m);
});
