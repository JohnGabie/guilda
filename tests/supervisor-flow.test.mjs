import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { writeSignal } from '../scripts/lib/queue.mjs';
import { appendMessage } from '../scripts/lib/bus.mjs';

const SESSION = 'sup-flow';
const WORKTREE = (id) => `.guilda/worktrees/${id}`;
const PLAN = path.join(REPO_ROOT, 'tests', 'fixtures', 'supervisor', 'two-tasks.md');

function project() {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, usage: { source: 'off' } }, git: true });
  fs.copyFileSync(PLAN, path.join(dir, 'plan.md'));
  return dir;
}

function node(script, args) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function ok(r, what) {
  assert.equal(r.code, 0, `${what}: exit ${r.code}\n${r.out}${r.err}`);
  return r;
}

const queue = (dir, ...a) => ok(node('queue.mjs', [dir, ...a, '--session', SESSION]), `queue ${a.join(' ')}`);
const signal = (dir, ...a) => ok(node('signal.mjs', [dir, ...a]), `signal ${a.join(' ')}`);
const tickRaw = (dir, ...a) => node('tick.mjs', [dir, '--session', SESSION, ...a]);
const tick = (dir) => JSON.parse(ok(tickRaw(dir, '--json'), 'tick --json').out);
const record = (dir, ...a) => ok(tickRaw(dir, '--record', ...a), `tick --record ${a.join(' ')}`);

function runTask(dir, id) {
  const step = tick(dir);
  assert.equal(step.step, 'dispatch');
  assert.equal(step.task, id);
  assert.equal(step.plan, 'plan.md');
  assert.equal(step.planTask, id);
  assert.equal(step.worktree, WORKTREE(id));
  queue(dir, 'dispatch', id, '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman', '--worktree', WORKTREE(id));
  signal(dir, 'started', id, '1');
  signal(dir, 'done', id, '1');
  queue(dir, 'sync');
  const check = tick(dir);
  assert.equal(check.step, 'dispatch-check');
  assert.equal(check.task, id);
  assert.equal(check.role, 'rev');
  const run = queue(dir, 'dispatch', id, '--check', '--role', 'rev', '--tool', 'claude', '--tier', 'journeyman', '--worktree', WORKTREE(id));
  const address = /address (\S+)/.exec(run.out)?.[1];
  assert.ok(address, run.out);
  // signal.mjs keys a done by task and attempt, which the task run already used. A check run signals by its agent ID.
  const agentId = `chk-${id}`;
  writeSignal(dir, { agentId }, 'dispatch.json', { address, task: id, attempt: 1, at: new Date().toISOString() });
  writeSignal(dir, { agentId }, 'done', { at: new Date().toISOString(), reason: 'finished', usage: null });
  queue(dir, 'sync');
  queue(dir, 'approve', id);
  // approve makes the task done; the next sync makes a dependent task ready.
  queue(dir, 'sync');
}

test('the supervisor flow runs a plan of 2 tasks to finish done', () => {
  const dir = project();
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');

  runTask(dir, 'T1');
  runTask(dir, 'T2');

  const end = tick(dir);
  assert.equal(end.step, 'finish');
  assert.equal(end.why, 'done');

  const sum = ok(tickRaw(dir, '--summary'), 'tick --summary');
  const file = path.join(dir, '.guilda', 'supervisor-summary.md');
  assert.ok(fs.existsSync(file), sum.out);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /T1/);
  assert.match(text, /T2/);

  queue(dir, 'unclaim');
});

test('slots 0 gives pause, a sleep record gives watch', () => {
  const dir = project();
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');
  queue(dir, 'slots', '0');
  const step = tick(dir);
  assert.equal(step.step, 'pause');
  assert.ok(!Number.isNaN(Date.parse(step.until)), `until: ${step.until}`);
  record(dir, 'sleep', '--until', step.until);
  assert.equal(tick(dir).step, 'watch');
});

test('a read-bus step clears after a read record', () => {
  const dir = project();
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');
  // bus.mjs send refuses the address supervisor (unknown address), so the test uses the bus library.
  const id = appendMessage(dir, { from: 'architect', to: 'supervisor', task: null, type: 'notice', text: 'hello', replyTo: null, hops: 0, record: null, interrupt: false }).id;
  const step = tick(dir);
  assert.equal(step.step, 'read-bus');
  assert.deepEqual(step.ids, [id]);
  record(dir, 'read', '--ids', id);
  assert.notEqual(tick(dir).step, 'read-bus');
});
