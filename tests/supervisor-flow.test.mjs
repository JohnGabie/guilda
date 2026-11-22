import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { writeSignal } from '../scripts/lib/queue.mjs';

const SESSION = 'sup-flow';
const WORKTREE = (id) => `.guilda/worktrees/${id}`;
const PLAN = path.join(REPO_ROOT, 'tests', 'fixtures', 'supervisor', 'two-tasks.md');

function project(usage = { source: 'off' }) {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, usage }, git: true });
  fs.copyFileSync(PLAN, path.join(dir, 'plan.md'));
  return dir;
}

function node(script, args, env = process.env) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { encoding: 'utf8', env });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function ok(r, what) {
  assert.equal(r.code, 0, `${what}: exit ${r.code}\n${r.out}${r.err}`);
  return r;
}

const queue = (dir, ...a) => ok(node('queue.mjs', [dir, ...a, '--session', SESSION]), `queue ${a.join(' ')}`);
const signal = (dir, ...a) => ok(node('signal.mjs', [dir, ...a]), `signal ${a.join(' ')}`);
const tickRaw = (dir, ...a) => node('tick.mjs', [dir, '--session', SESSION, ...a]);
const tick = (dir, ...extra) => JSON.parse(ok(tickRaw(dir, ...extra, '--json'), 'tick --json').out);
const record = (dir, ...a) => ok(tickRaw(dir, '--record', ...a), `tick --record ${a.join(' ')}`);
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

function runTask(dir, id) {
  const step = tick(dir);
  assert.deepEqual(pick(step, ['step', 'task', 'plan', 'planTask', 'worktree', 'role', 'tool', 'tier', 'lowTier']), {
    step: 'dispatch', task: id, plan: 'plan.md', planTask: id, worktree: WORKTREE(id), role: 'exe', tool: 'claude', tier: null, lowTier: false,
  });
  const first = queue(dir, 'dispatch', id, '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman', '--worktree', WORKTREE(id));
  assert.match(first.out, new RegExp(`^dispatched ${id} attempt 1 address ${id}-exe-[0-9a-f]{4}\\n`));
  signal(dir, 'started', id, '1');
  signal(dir, 'done', id, '1');
  queue(dir, 'sync');
  const check = tick(dir);
  assert.deepEqual(pick(check, ['step', 'task', 'role']), { step: 'dispatch-check', task: id, role: 'rev' });
  const run = queue(dir, 'dispatch', id, '--check', '--role', 'rev', '--tool', 'claude', '--tier', 'journeyman', '--worktree', WORKTREE(id));
  const found = new RegExp(`^dispatched ${id} attempt 1 address (${id}-rev-[0-9a-f]{4})\\n`).exec(run.out);
  assert.ok(found, run.out);
  const address = found[1];
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
  assert.deepEqual(pick(end, ['step', 'why']), { step: 'finish', why: 'done' });

  const sum = ok(tickRaw(dir, '--summary'), 'tick --summary');
  const file = path.join(dir, '.guilda', 'supervisor-summary.md');
  assert.equal(sum.out.trim(), file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  assert.match(lines[2], /^Written at \d{4}-\d{2}-\d{2}T/);
  lines[2] = 'Written at NOW.';
  assert.deepEqual(lines, [
    '# Supervisor summary', '', 'Written at NOW.', '', '## Tasks done', '',
    '- T1 — A', '- T2 — B', '',
    '## Needs the user', '', '- none', '',
    '## Idle causes', '', '- none', '',
    '## Pace at the end', '', '- slots: 1', '- why: off', '- resume at: none', '',
  ]);

  queue(dir, 'unclaim');
});

test('slots 0 gives pause, a sleep record gives watch', () => {
  const dir = project();
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');
  queue(dir, 'slots', '0');
  const NOW = '2026-11-20T10:00:00.000Z';
  const step = tick(dir, '--now', NOW);
  assert.deepEqual(pick(step, ['step', 'until', 'why']), { step: 'pause', until: '2026-11-20T10:30:00.000Z', why: 'off' });
  ok(tickRaw(dir, '--now', NOW, '--record', 'sleep', '--until', step.until), 'tick --record sleep');
  assert.deepEqual(pick(tick(dir, '--now', NOW), ['step']), { step: 'watch' });
});

test('the floor fixture gives pause with why floor', () => {
  const dir = project({ source: 'cswap' });
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda fake cswap '));
  const floor = path.join(REPO_ROOT, 'tests', 'fixtures', 'budget', 'floor.json');
  fs.writeFileSync(path.join(bin, 'cswap'), `#!/bin/sh\ncat '${floor}'\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');
  const step = JSON.parse(ok(node('tick.mjs', [dir, '--session', SESSION, '--json'], env), 'tick --json').out);
  assert.deepEqual(pick(step, ['step', 'why', 'until']), { step: 'pause', why: 'floor', until: '2026-11-23T08:00:00Z' });
});

test('a read-bus step clears after a read record', () => {
  const dir = project();
  queue(dir, 'init', 'plan.md', '--slots', '1');
  queue(dir, 'claim');
  // A send to supervisor passes while a claim is live. The test runs bus.mjs with node, so no hook runs.
  const sent = ok(node('bus.mjs', [dir, 'send', '--from', 'main', '--to', 'supervisor', '--type', 'request', '--text', 'hello']), 'bus send');
  const id = /m-[0-9a-f]{8}/.exec(sent.out)?.[0];
  assert.ok(id, sent.out);
  assert.deepEqual(pick(tick(dir), ['step', 'ids']), { step: 'read-bus', ids: [id] });
  record(dir, 'read', '--ids', id);
  assert.deepEqual(pick(tick(dir), ['step']), { step: 'dispatch' });
});
