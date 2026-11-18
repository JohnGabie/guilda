import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'eval-run.mjs');

/** A project with one case and a fake claude on PATH that counts calls. */
function setup({ exit = 0 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda eval '));
  const project = path.join(root, 'proj');
  for (const d of ['agents', 'skills', 'core', 'hooks', 'plugins', 'evals/s/c1/graders', 'evals/s/c2']) {
    fs.mkdirSync(path.join(project, d), { recursive: true });
  }
  fs.writeFileSync(path.join(project, 'agents', 'a.md'), 'agent');
  fs.writeFileSync(path.join(project, 'evals/s/c1/case.yaml'), 'x: 1');
  fs.writeFileSync(path.join(project, 'evals/s/c1/graders/g.sh'), 'g');
  fs.writeFileSync(path.join(project, 'evals/s/c2/case.yaml'), 'y: 1');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const counter = path.join(root, 'calls.txt');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$@" >> "${counter}"\necho "ran $@"\nexit ${exit}\n`, { mode: 0o755 });
  const run = (args = ['proj', 'evals/s', 'c1'], extra = {}) => spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...extra },
  });
  const calls = () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').trim().split('\n').length : 0);
  const entries = () => {
    const d = path.join(project, '.guilda', 'eval-cache');
    return fs.existsSync(d) ? fs.readdirSync(d) : [];
  };
  return { root, project, run, calls, entries };
}

test('a first run stores the entry', () => {
  const t = setup();
  const r = t.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran plugin eval/);
  assert.equal(t.calls(), 1);
  assert.equal(t.entries().length, 1);
  const e = JSON.parse(fs.readFileSync(path.join(t.project, '.guilda', 'eval-cache', t.entries()[0]), 'utf8'));
  assert.equal(e.case, 'c1');
  assert.equal(e.exitCode, 0);
  assert.match(e.output, /ran plugin eval/);
  assert.ok(!Number.isNaN(Date.parse(e.at)));
});

test('an unchanged case is not run again', () => {
  const t = setup();
  t.run();
  const r = t.run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^eval-run: cached c1\n/);
  assert.match(r.stdout, /ran plugin eval/);
  assert.equal(t.calls(), 1);
});

test('a changed case file runs again', () => {
  const t = setup();
  t.run();
  fs.writeFileSync(path.join(t.project, 'evals/s/c1/graders/g.sh'), 'g2');
  t.run();
  assert.equal(t.calls(), 2);
});

test('a change in another case or in tests/ does not run again', () => {
  const t = setup();
  t.run();
  fs.writeFileSync(path.join(t.project, 'evals/s/c2/case.yaml'), 'y: 2');
  fs.mkdirSync(path.join(t.project, 'tests'));
  fs.writeFileSync(path.join(t.project, 'tests/t.mjs'), 'z');
  t.run();
  assert.equal(t.calls(), 1);
});

test('a changed agent file runs again', () => {
  const t = setup();
  t.run();
  fs.writeFileSync(path.join(t.project, 'agents', 'a.md'), 'agent2');
  t.run();
  assert.equal(t.calls(), 2);
});

test('a changed argument runs again', () => {
  const t = setup();
  t.run();
  t.run(['proj', 'evals/s', 'c1', '--', '--json']);
  assert.equal(t.calls(), 2);
  assert.equal(t.entries().length, 2);
});

test('--force runs again and replaces the entry', () => {
  const t = setup();
  t.run();
  const before = t.entries();
  const r = t.run(['proj', 'evals/s', 'c1', '--force']);
  assert.equal(r.status, 0);
  assert.equal(t.calls(), 2);
  assert.deepEqual(t.entries(), before);
  assert.doesNotMatch(r.stdout, /cached/);
});

test('a failed run is not stored', () => {
  const t = setup({ exit: 3 });
  const r = t.run();
  assert.equal(r.status, 3);
  assert.equal(t.entries().length, 0);
  t.run();
  assert.equal(t.calls(), 2);
});

test('no case folder exits 1', () => {
  const t = setup();
  const r = t.run(['proj', 'evals/s', 'nope']);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /eval-run: no case nope/);
  assert.equal(t.calls(), 0);
});

test('the cache stays inside the project', () => {
  const t = setup();
  t.run();
  const outside = fs.readdirSync(t.root).sort();
  assert.deepEqual(outside, ['bin', 'calls.txt', 'proj']);
  assert.deepEqual(fs.readdirSync(path.join(t.project, '.guilda')), ['eval-cache']);
  assert.ok(t.entries().every((f) => f.endsWith('.json')));
});
