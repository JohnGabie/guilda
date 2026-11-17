import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { ensureIgnored } from '../scripts/lib/violations.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';

const INIT_PROGRESS = path.join(REPO_ROOT, 'scripts', 'init-progress.mjs');
const FILE = (dir) => path.join(dir, '.guilda', '.init-progress.json');

const run = (args) => spawnSync(process.execPath, [INIT_PROGRESS, ...args], { encoding: 'utf8' });

/** A git project with a .guilda folder whose .gitignore already lists the hook state files (T3). */
function gitProject() {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  ensureIgnored(path.join(dir, '.guilda'));
  return dir;
}

test('guilda:init writes its progress file', () => {
  const dir = gitProject();
  const file = FILE(dir);

  const start = run([dir, 'start', 'Languages', 'Tiers', 'Project rules']);
  assert.equal(start.status, 0, start.stdout + start.stderr);
  let o = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(o).sort(), ['at', 'steps']);
  assert.ok(!Number.isNaN(Date.parse(o.at)), `at is a time: ${o.at}`);
  assert.deepEqual(o.steps, [
    { name: 'Languages', state: 'todo' },
    { name: 'Tiers', state: 'todo' },
    { name: 'Project rules', state: 'todo' },
  ]);

  const doing = run([dir, 'set', '3', 'doing']);
  assert.equal(doing.status, 0, doing.stdout + doing.stderr);
  o = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(o.steps.map((s) => s.state), ['todo', 'todo', 'doing']);

  const done = run([dir, 'set', '3', 'done']);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  o = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(o.steps[2].state, 'done');

  const before = fs.readFileSync(file, 'utf8');
  const badStep = run([dir, 'set', '4', 'done']);
  assert.equal(badStep.status, 1);
  assert.match(badStep.stdout + badStep.stderr, /invalid step/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a refused write changes nothing');

  const badState = run([dir, 'set', '2', 'finished']);
  assert.equal(badState.status, 1);
  assert.match(badState.stdout + badState.stderr, /invalid state/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a refused write changes nothing');

  const skip = run([dir, 'set', '2', 'skipped']);
  assert.equal(skip.status, 0, skip.stdout + skip.stderr);

  const leftovers = fs.readdirSync(path.join(dir, '.guilda')).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], 'each write renames its temp file');

  const status = spawnSync('git', ['status', '--short'], { cwd: dir, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  assert.ok(!status.stdout.includes('init-progress'), status.stdout);
  const ignored = spawnSync('git', ['check-ignore', '-q', path.join('.guilda', '.init-progress.json')], { cwd: dir });
  assert.equal(ignored.status, 0, 'the file is git-ignored');
});

test('no .guilda folder: refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda init '));
  const r = run([dir, 'start', 'Languages']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, `refused: guilda is not set up\n${SETUP_NOTICE}\n`);
  const s = run([dir, 'set', '1', 'done']);
  assert.equal(s.status, 1);
  assert.deepEqual(fs.readdirSync(dir), [], 'no file and no folder');
});
