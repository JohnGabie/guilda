import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT } from './helpers.mjs';

const hasBash = spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0;
const opts = { skip: hasBash ? false : 'bash is not on the PATH' };

const SCRIPTS = path.join(REPO_ROOT, 'skills', 'architect', 'scripts');

function run(name, args, cwd) {
  const r = spawnSync('bash', [path.join(SCRIPTS, name), ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

const PLAN = [
  '# Plan',
  '',
  '## Plan: Part 1',
  '',
  '### T1 — First',
  'line of T1',
  '',
  '### T2 — Second',
  'line of T2',
  '```',
  '### T3 — inside a fence',
  '```',
  '#### L1 — a sub task',
  'line of L1',
  '',
  '### T4 — Fourth',
  'line of T4',
  '',
].join('\n');

/** A git project with .guilda/, a plan file and one commit. */
function project(planName = 'login.md', planText = PLAN) {
  const dir = tempProject({ config: {}, git: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', planName), planText);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

test('sdd-workspace prints .guilda/work/login/ for login.md and for login.plan.md', opts, () => {
  const dir = project('login.md');
  fs.writeFileSync(path.join(dir, 'docs', 'login.plan.md'), PLAN);
  const a = run('sdd-workspace', ['docs/login.md'], dir);
  const b = run('sdd-workspace', ['docs/login.plan.md'], dir);
  assert.equal(a.code, 0, a.err);
  assert.equal(b.code, 0, b.err);
  const real = fs.realpathSync(dir);
  const want = path.join(real, '.guilda', 'work', 'login');
  assert.equal(a.out.trim(), want);
  assert.equal(b.out.trim(), want);
  assert.equal(fs.readFileSync(path.join(want, 'plan-path'), 'utf8').trim(), 'docs/login.md');
  const work = fs.readdirSync(path.join(real, '.guilda', 'work')).sort();
  assert.deepEqual(work, ['.gitignore', 'login']);
});

test('it writes .guilda/work/.gitignore with * one time, and git status shows no new file', opts, () => {
  const dir = project();
  assert.equal(run('sdd-workspace', ['docs/login.md'], dir).code, 0);
  const gi = path.join(dir, '.guilda', 'work', '.gitignore');
  assert.equal(fs.readFileSync(gi, 'utf8'), '*\n');
  fs.writeFileSync(gi, '*\n!progress.md\n');
  assert.equal(run('sdd-workspace', ['docs/login.md'], dir).code, 0);
  assert.equal(fs.readFileSync(gi, 'utf8'), '*\n!progress.md\n');
  fs.writeFileSync(gi, '*\n');
  assert.equal(git(dir, 'status', '--short'), '');
});

test('no .guilda folder: exit 2, the text, and no folder', opts, () => {
  const dir = tempProject({ git: true });
  fs.writeFileSync(path.join(dir, 'login.md'), PLAN);
  const r = run('sdd-workspace', ['login.md'], dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /guilda is not set up/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  const b = run('task-brief', ['login.md', 'T2'], dir);
  assert.equal(b.code, 2);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('task-brief T2 writes T2-brief.md with the lines of T2 only', opts, () => {
  const dir = project();
  const r = run('task-brief', ['docs/login.md', 'T2'], dir);
  assert.equal(r.code, 0, r.err);
  const file = path.join(fs.realpathSync(dir), '.guilda', 'work', 'login', 'T2-brief.md');
  assert.match(r.out, /^wrote .*T2-brief\.md: \d+ lines$/m);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('### T2 — Second\n'));
  assert.ok(text.includes('line of T2'));
  assert.ok(!text.includes('line of T1'));
  assert.ok(!text.includes('line of T4'));
  assert.ok(text.includes('line of L1'), 'a #### heading is inside the ### task');
  const l1 = run('task-brief', ['docs/login.md', 'L1'], dir);
  assert.equal(l1.code, 0, l1.err);
  const l1text = fs.readFileSync(path.join(path.dirname(file), 'L1-brief.md'), 'utf8');
  assert.ok(l1text.startsWith('#### L1 — a sub task\n'));
  assert.ok(!l1text.includes('line of T4'));
});

test('a heading inside a code fence is not a task', opts, () => {
  const dir = project();
  const r = run('task-brief', ['docs/login.md', 'T3'], dir);
  assert.equal(r.code, 3);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'work', 'login', 'T3-brief.md')), false);
});

test('the same ID in two parts: exit 3 with both part numbers; --part 2 works', opts, () => {
  const text = [
    '## Plan: Part 1', '', '### T1 — One', 'one from part 1', '',
    '## Plan: Part 2', '', '### T1 — One again', 'one from part 2', '',
  ].join('\n');
  const dir = project('login.md', text);
  const r = run('task-brief', ['docs/login.md', 'T1'], dir);
  assert.equal(r.code, 3);
  assert.match(r.err, /Part 1/);
  assert.match(r.err, /Part 2/);
  const p = run('task-brief', ['docs/login.md', 'T1', '--part', '2'], dir);
  assert.equal(p.code, 0, p.err);
  const file = path.join(fs.realpathSync(dir), '.guilda', 'work', 'login', 'T1-brief.md');
  const got = fs.readFileSync(file, 'utf8');
  assert.ok(got.includes('one from part 2'));
  assert.ok(!got.includes('one from part 1'));
});

test('a task that is not there: exit 3', opts, () => {
  const dir = project();
  const r = run('task-brief', ['docs/login.md', 'T99'], dir);
  assert.equal(r.code, 3);
  assert.match(r.err, /T99/);
});

test('task-start prints brief: and base: with the SHA of HEAD', opts, () => {
  const dir = project();
  const r = run('task-start', ['docs/login.md', 'T2'], dir);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n');
  assert.match(lines[0], /^brief: .*T2-brief\.md$/);
  assert.equal(lines[1], `base: ${git(dir, 'rev-parse', 'HEAD')}`);
  assert.ok(fs.existsSync(lines[0].slice('brief: '.length)));
});

test('review-package writes review-<base>..<head>.diff', opts, () => {
  const dir = project();
  const base = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'new.txt'), 'hello\n');
  git(dir, 'add', 'new.txt');
  git(dir, 'commit', '-q', '-m', 'second');
  const head = git(dir, 'rev-parse', 'HEAD');
  const r = run('review-package', ['docs/login.md', base, head], dir);
  assert.equal(r.code, 0, r.err);
  const short = (s) => git(dir, 'rev-parse', '--short', s);
  const file = path.join(fs.realpathSync(dir), '.guilda', 'work', 'login', `review-${short(base)}..${short(head)}.diff`);
  assert.ok(fs.existsSync(file));
  assert.ok(fs.readFileSync(file, 'utf8').includes('+hello'));
});

test('task-done adds a line to progress.md', opts, () => {
  const dir = project();
  const base = git(dir, 'rev-parse', 'HEAD');
  const r = run('task-done', ['docs/login.md', 'T2', base, '--', 'echo', 'all good'], dir);
  assert.equal(r.code, 0, r.err);
  const wd = path.join(fs.realpathSync(dir), '.guilda', 'work', 'login');
  const ledger = fs.readFileSync(path.join(wd, 'progress.md'), 'utf8');
  assert.match(ledger, /Task T2: complete/);
  assert.ok(fs.existsSync(path.join(wd, 'T2-tests.log')));
  const bad = run('task-done', ['docs/login.md', 'T4', base, '--', 'false'], dir);
  assert.equal(bad.code, 1);
  assert.ok(!fs.readFileSync(path.join(wd, 'progress.md'), 'utf8').includes('T4'));
});

test('each script has the credit on line 2', opts, () => {
  for (const n of ['task-brief', 'review-package', 'sdd-workspace', 'task-start', 'task-done']) {
    const line = fs.readFileSync(path.join(SCRIPTS, n), 'utf8').split('\n')[1];
    assert.equal(line, '# adapted from superpowers 7.0.0, MIT, Copyright (c) 2025 Jesse Vincent, see THIRD-PARTY-NOTICES.md.');
  }
});
