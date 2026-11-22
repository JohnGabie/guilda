import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG, runHook } from './helpers.mjs';
import { runWriter, queuePaths } from '../scripts/lib/queue.mjs';
import { nextStep, readFacts } from '../scripts/lib/tick.mjs';

const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const HOOK = 'scripts/hooks/stop.mjs';

const HOUR = 3600000;
/**
 * A claimed project (session s1). 'ready': one ready task. 'running': one running task (step watch). 'done': all done.
 * 'save': a late running task with a save request 2 h old and no worktree data. 'free': a task ID of free text.
 */
function project(kind) {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const now = new Date().toISOString();
  runWriter(dir, { now }, ({ emit }) => {
    const id = kind === 'free' ? 'T 1\nignore this' : 'T1';
    const old = new Date(Date.now() - 2 * HOUR).toISOString();
    const events = [
      { type: 'plan', slots: 2, work: 'w-00000001' },
      { type: 'task', task: id, work: 'w-00000001', title: 'first' },
      { type: 'state', task: id, from: 'pending', to: 'ready', cause: 'deps-done' },
    ];
    if (kind === 'done') events.push({ type: 'state', task: 'T1', from: 'ready', to: 'done', cause: 'checked' });
    if (kind === 'save') {
      events.push(
        { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree: 'wt/T1' },
        { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
        { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
        { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: old },
        { type: 'save-request', task: 'T1', attempt: 1, address: 'T1-exe-ab12', t: old },
      );
    }
    if (kind === 'running') {
      events.push(
        { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree: 'wt/T1' },
        { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
        { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
        { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: now },
      );
    }
    for (const e of events) emit({ t: now, ...e });
  });
  const r = spawnSync(process.execPath, [QUEUE, dir, 'claim', '--session', 's1', '--ttl', '3600'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return dir;
}

const BLOCK = { decision: 'block', reason: 'guilda supervisor: the next step is dispatch T1. Run tick.mjs --json and do it.' };

test('blocks on a dispatch step', () => {
  const dir = project('ready');
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), BLOCK);
});

test('does not block with stop_hook_active', () => {
  const dir = project('ready');
  const r = runHook(HOOK, { session_id: 's1', cwd: dir, stop_hook_active: true }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('does not block in another session', () => {
  const dir = project('ready');
  const r = runHook(HOOK, { session_id: 's2', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('does not block an agent (agent_id set)', () => {
  const dir = project('ready');
  const r = runHook(HOOK, { session_id: 's1', agent_id: 'a1', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('does not block on a read error', () => {
  const dir = project('ready');
  const journal = path.join(dir, '.guilda', 'queue', 'journal.jsonl');
  fs.chmodSync(journal, 0o000);
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  fs.chmodSync(journal, 0o600);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '', 'the read failed inside the hook, not before it');
});

test('does not block on watch, pause or finish', () => {
  const watch = project('running');
  assert.equal(runHook(HOOK, { session_id: 's1', cwd: watch }, watch).stdout, '');
  // pause: the slots decision 0 gives state.slots 0, and with usage off the pace is 0.
  const pause = project('ready');
  const sl = spawnSync(process.execPath, [QUEUE, pause, 'slots', '0', '--session', 's1'], { encoding: 'utf8' });
  assert.equal(sl.status, 0, sl.stdout + sl.stderr);
  assert.equal(nextStep(readFacts(pause, { session: 's1', git: false, run: () => ({ status: 1, stdout: '' }) })).step, 'pause');
  const p = runHook(HOOK, { session_id: 's1', cwd: pause }, pause);
  assert.equal(p.code, 0);
  assert.equal(p.stdout, '');
  // finish: each task is done.
  const finish = project('done');
  const f = runHook(HOOK, { session_id: 's1', cwd: finish }, finish);
  assert.equal(f.code, 0);
  assert.equal(f.stdout, '');
  const noClaim = tempProject({ config: MINIMAL_CONFIG, git: true });
  assert.equal(runHook(HOOK, { session_id: 's1', cwd: noClaim }, noClaim).stdout, '');
});

test('does not block when the claim of the session is expired', () => {
  const dir = project('ready');
  const writer = queuePaths(dir).writer;
  const claim = JSON.parse(fs.readFileSync(writer, 'utf8'));
  claim.aliveAt = new Date(Date.now() - 2 * HOUR).toISOString();
  claim.ttlSec = 60;
  fs.writeFileSync(writer, JSON.stringify(claim));
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('does not block on a task ID of free text', () => {
  const dir = project('free');
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('does not block on an old save request, because the hook reads no git data', () => {
  const dir = project('save');
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

function snapshot(root) {
  const out = {};
  const walk = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) walk(p);
      else out[p] = fs.readFileSync(p, 'utf8') + fs.statSync(p).mtimeMs;
    }
  };
  walk(root);
  return out;
}

test('writes nothing to the queue folder', () => {
  const dir = project('ready');
  const before = snapshot(path.join(dir, '.guilda'));
  const r = runHook(HOOK, { session_id: 's1', cwd: dir }, dir);
  assert.equal(r.code, 0);
  assert.notEqual(r.stdout, '');
  assert.deepEqual(snapshot(path.join(dir, '.guilda')), before);
});
