import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { runWriter, readClaim, queuePaths } from '../scripts/lib/queue.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'watch.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const TIMEOUT = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function seed(dir, events) {
  const t = nowIso();
  runWriter(dir, { now: t }, ({ emit }) => {
    for (const e of events) emit({ t, ...e });
  });
}

function claim(dir, session = 's1') {
  const r = spawnSync(process.execPath, [QUEUE, dir, 'claim', '--session', session, '--ttl', '3600'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

function runningProject(config = MINIMAL_CONFIG) {
  const dir = tempProject({ config });
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'first' },
    { type: 'task', task: 'T2', work: 'w-00000001', title: 'second', deps: ['T1'] },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
    { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree: 'wt/T1' },
    { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
    { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
    { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: nowIso() },
  ]);
  claim(dir);
  return dir;
}

/** Start watch with --interval 1. The child handle is the only thing the test stops. */
function watch(dir, args = [], env = {}, session = 's1') {
  const child = spawn(process.execPath, [SCRIPT, dir, '--session', session, '--interval', '1', ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const exited = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal, out })));
  return { child, exited, output: () => out };
}

test('prints nothing on a healthy flow for 3 reads', { timeout: TIMEOUT }, async () => {
  const w = watch(runningProject());
  await sleep(3500);
  assert.equal(w.child.exitCode, null, `exited early: ${w.output()}`);
  w.child.kill('SIGTERM');
  const r = await w.exited;
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('prints dispatch T2 when a task becomes ready', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const w = watch(dir);
  await sleep(1500);
  assert.equal(w.child.exitCode, null, `exited early: ${w.output()}`);
  const t = nowIso();
  runWriter(dir, { now: t }, ({ emit }) => {
    emit({ t, type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: t });
    emit({ t, type: 'state', task: 'T2', from: 'pending', to: 'ready', cause: 'deps-done' });
  });
  const r = await w.exited;
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), 'dispatch T2');
});

test('exits 3 on claim-lost', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const w = watch(dir, [], {}, 's2');
  const r = await w.exited;
  assert.equal(r.code, 3);
  assert.equal(r.out.trim(), 'claim-lost');
});

test('prints until', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const until = new Date(Date.now() + 1500).toISOString();
  const w = watch(dir, ['--until', until]);
  const r = await w.exited;
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), 'until');
});

test('a bad --until exits 1', { timeout: TIMEOUT }, async () => {
  const w = watch(runningProject(), ['--until', 'tomorrow']);
  const r = await w.exited;
  assert.equal(r.code, 1);
  assert.match(r.out, /^refused: bad --until/);
});

test('refreshes aliveAt', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const before = Date.parse(readClaim(dir).aliveAt);
  await sleep(50);
  const w = watch(dir);
  await sleep(2500);
  w.child.kill('SIGTERM');
  const r = await w.exited;
  assert.equal(r.code, 0);
  const after = readClaim(dir);
  assert.ok(Date.parse(after.aliveAt) > before + 1000, `${after.aliveAt} vs ${before}`);
  assert.equal(after.pid, w.child.pid);
});

test('reads usage at most once in 300 s', { timeout: TIMEOUT }, async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda fake cswap '));
  const count = path.join(bin, 'count');
  fs.writeFileSync(count, '');
  const fake = path.join(bin, 'cswap');
  fs.writeFileSync(fake, `#!/bin/sh\necho x >> '${count}'\necho '{"advice":"ok","fleet":{"capacityUnits":100,"remainingUnits":80},"resets":[]}'\n`, { mode: 0o755 });
  const dir = runningProject({ ...MINIMAL_CONFIG, usage: { source: 'cswap' } });
  const w = watch(dir, [], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  await sleep(3500);
  w.child.kill('SIGTERM');
  const r = await w.exited;
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.equal(fs.readFileSync(count, 'utf8').trim().split('\n').length, 1);
});

test('an expired claim of the same session gives claim-lost', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const file = queuePaths(dir).writer;
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  old.aliveAt = new Date(Date.now() - 2 * old.ttlSec * 1000).toISOString();
  fs.writeFileSync(file, JSON.stringify(old));
  const r = await watch(dir).exited;
  assert.equal(r.code, 3);
  assert.equal(r.out, 'claim-lost\n');
});

test('an I/O error gives exit 2 and an io-error line', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const folder = path.dirname(queuePaths(dir).writer);
  fs.chmodSync(folder, 0o555); // touchClaim cannot write its temp file in a read-only folder
  try {
    const r = await watch(dir).exited;
    assert.equal(r.code, 2);
    assert.match(r.out, /^io-error /);
  } finally {
    fs.chmodSync(folder, 0o755);
  }
});

test('the sleep stops at --until even with a long interval', { timeout: TIMEOUT }, async () => {
  const dir = runningProject();
  const until = Date.now() + 2000;
  const child = spawn(process.execPath, [SCRIPT, dir, '--session', 's1', '--interval', '30', '--until', new Date(until).toISOString()], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  const late = Date.now() - until;
  assert.equal(code, 0);
  assert.equal(out.trim(), 'until');
  assert.ok(late < 1000, `printed ${late} ms after --until`);
});
