import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG, runHook } from './helpers.mjs';
import { runWriter } from '../scripts/lib/queue.mjs';

const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const HOOK = 'scripts/hooks/stop.mjs';

/** A claimed project (session s1). 'ready': one ready task. 'running': one running task (step watch). */
function project(kind) {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const now = new Date().toISOString();
  runWriter(dir, { now }, ({ emit }) => {
    const events = [
      { type: 'plan', slots: 2, work: 'w-00000001' },
      { type: 'task', task: 'T1', work: 'w-00000001', title: 'first' },
      { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
    ];
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
  const noClaim = tempProject({ config: MINIMAL_CONFIG, git: true });
  assert.equal(runHook(HOOK, { session_id: 's1', cwd: noClaim }, noClaim).stdout, '');
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
