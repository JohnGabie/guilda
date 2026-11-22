import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { runWriter } from '../scripts/lib/queue.mjs';
import { nextStep, readFacts } from '../scripts/lib/tick.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'tick.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const T0 = Date.parse('2026-11-20T10:00:00.000Z');
const MIN = 60000;
const at = (min) => new Date(T0 + min * MIN).toISOString();

// ---- Fixtures for the pure function ----

const task = (over = {}) => ({
  state: 'pending',
  attempt: 1,
  address: 'T1-exe-ab12',
  worktree: 'wt/T1',
  cause: null,
  since: at(0),
  startedAt: at(0),
  lastHeartbeat: at(0),
  busyUntil: null,
  checks: [],
  title: 'a task',
  ...over,
});
const PACE_OK = { slots: 2, lowTier: false, why: 'ok', resumeAt: null };
const facts = (tasks, over = {}) => ({
  now: at(30),
  session: 's1',
  state: { slots: 2, tasks },
  pace: PACE_OK,
  unread: [],
  records: [],
  worktrees: {},
  ...over,
});
const lateRunning = () => task({ state: 'running', lastHeartbeat: at(0) });
const saveRecord = (t, over = {}) => ({ type: 'save-request', task: 'T1', attempt: 1, t, ...over });

test('rule 1: pace 0 gives pause with the resume time', () => {
  const s = nextStep(facts({ T1: task({ state: 'ready' }) }, { pace: { slots: 0, lowTier: false, why: 'blocked', resumeAt: at(90) } }));
  assert.equal(s.step, 'pause');
  assert.equal(s.until, at(90));
  assert.equal(s.why, 'blocked');
  assert.deepEqual(s.idle, [{ task: 'T1', cause: 'waits-reset' }]);
  assert.equal(s.paceWhy, 'blocked');
});

test('rule 2: a late running attempt with no save request gives save-request', () => {
  const s = nextStep(facts({ T1: lateRunning() }));
  assert.deepEqual({ step: s.step, task: s.task, attempt: s.attempt, address: s.address }, { step: 'save-request', task: 'T1', attempt: 1, address: 'T1-exe-ab12' });
  assert.deepEqual(s.idle, [{ task: 'T1', cause: 'stuck' }]);
  assert.equal(s.now, at(30));
  assert.deepEqual(s.slots, { pace: 2, busy: 1, free: 1 });
});

test('rule 3: a save request 2 min old with a later commit gives stop', () => {
  const s = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20))], worktrees: { T1: { exists: true, commitAt: at(25) } } }));
  assert.equal(s.step, 'stop');
  assert.equal(s.task, 'T1');
  assert.equal(s.address, 'T1-exe-ab12');
});

test('rule 3: a save request 2 min old with no later commit gives needs-user', () => {
  const s = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20))], worktrees: { T1: { exists: true, commitAt: at(10) } } }));
  assert.equal(s.step, 'needs-user');
  assert.equal(s.reason, 'no commit after the save request');
});

test('rule 3: a save request younger than 2 min waits', () => {
  const s = nextStep(facts({ T1: lateRunning() }, { now: at(30), records: [saveRecord(new Date(T0 + 29 * MIN).toISOString())], worktrees: { T1: { exists: true, commitAt: at(29.5) } } }));
  assert.equal(s.step, 'watch');
});

test('the worktree is missing at the stop step', () => {
  const s = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20))], worktrees: { T1: { exists: false, commitAt: null } } }));
  assert.equal(s.step, 'needs-user');
  assert.equal(s.reason, 'worktree missing');
});

test('rule 3 with a real git repository: readFacts reads the commit time', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const wt = path.join(dir, 'wt', 'T1');
  fs.mkdirSync(wt, { recursive: true });
  const git = (...a) => spawnSync('git', ['-C', wt, ...a], { encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: at(25), GIT_AUTHOR_DATE: at(25) } });
  git('init');
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@example.com');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  git('add', 'a.txt');
  git('commit', '-m', 'work');
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'x' },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
    { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree: 'wt/T1' },
    { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
    { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
    { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: at(0) },
    { type: 'save-request', task: 'T1', attempt: 1, address: 'T1-exe-ab12', t: at(20) },
  ]);
  const f = readFacts(dir, { now: at(30), session: 's1', run: () => ({ status: 3, stdout: '' }) });
  assert.equal(f.worktrees.T1.exists, true);
  assert.equal(Date.parse(f.worktrees.T1.commitAt), Date.parse(at(25)));
  assert.equal(nextStep(f).step, 'stop');
});

test('rule 4: a stalled attempt 1 gives retry; a later attempt gives needs-user', () => {
  const a = nextStep(facts({ T1: task({ state: 'stalled', cause: 'stop' }) }));
  assert.deepEqual({ step: a.step, task: a.task }, { step: 'retry', task: 'T1' });
  const b = nextStep(facts({ T1: task({ state: 'failed', attempt: 2, cause: 'failed' }) }));
  assert.equal(b.step, 'needs-user');
  assert.equal(b.task, 'T1');
  assert.equal(b.reason, 'failed');
});

test('rule 4: a no-ack stall retries up to MAX_ATTEMPTS', () => {
  assert.equal(nextStep(facts({ T1: task({ state: 'stalled', attempt: 2, cause: 'no-ack' }) })).step, 'retry');
  assert.equal(nextStep(facts({ T1: task({ state: 'stalled', attempt: 3, cause: 'no-ack' }) })).step, 'needs-user');
});

test('rule 5: a task in review with no check run gives dispatch-check', () => {
  const s = nextStep(facts({ T1: task({ state: 'review' }) }));
  assert.deepEqual({ step: s.step, task: s.task, role: s.role }, { step: 'dispatch-check', task: 'T1', role: 'rev' });
  assert.equal(nextStep(facts({ T1: task({ state: 'review', checks: [{ role: 'rev' }] }) })).step, 'watch');
});

test('rule 6: unread supervisor messages give read-bus', () => {
  const s = nextStep(facts({ T1: task({ state: 'ready' }) }, { unread: ['m-00000001', 'm-00000002'] }));
  assert.deepEqual({ step: s.step, ids: s.ids }, { step: 'read-bus', ids: ['m-00000001', 'm-00000002'] });
});

test('rule 7: slots of the queue that differ from the pace give set-slots', () => {
  const s = nextStep(facts({ T1: task({ state: 'ready' }) }, { pace: { slots: 1, lowTier: true, why: 'slow_down', resumeAt: null } }));
  assert.deepEqual({ step: s.step, slots: s.slots.pace }, { step: 'set-slots', slots: 1 });
});

test('rule 8: a ready task and a free slot give dispatch of the first task in plan order', () => {
  const s = nextStep(facts({ T0: task({ state: 'done' }), T1: task({ state: 'ready' }), T2: task({ state: 'ready' }) }, { pace: { slots: 2, lowTier: true, why: 'ok', resumeAt: null } }));
  assert.deepEqual({ step: s.step, task: s.task, lowTier: s.lowTier }, { step: 'dispatch', task: 'T1', lowTier: true });
});

test('rule 8: no free slot gives watch', () => {
  const s = nextStep(facts({ T1: task({ state: 'running', lastHeartbeat: at(29) }), T2: task({ state: 'running', lastHeartbeat: at(29) }), T3: task({ state: 'ready' }) }));
  assert.equal(s.step, 'watch');
  assert.deepEqual(s.slots, { pace: 2, busy: 2, free: 0 });
});

test('rule 9: each task done gives finish done', () => {
  const s = nextStep(facts({ T1: task({ state: 'done' }), T2: task({ state: 'done' }) }));
  assert.deepEqual({ step: s.step, why: s.why }, { step: 'finish', why: 'done' });
});

test('rule 10: no task that can move gives finish needs-user', () => {
  const s = nextStep(facts({ T1: task({ state: 'done' }), T2: task({ state: 'stalled', attempt: 2, cause: 'failed' }) }, {
    records: [{ type: 'needs-user', task: 'T2', attempt: 2, reason: 'failed', t: at(1) }],
  }));
  assert.deepEqual({ step: s.step, why: s.why }, { step: 'finish', why: 'needs-user' });
  assert.deepEqual(s.idle, [{ task: 'T2', cause: 'waits-user' }]);
});

test('rule 11: a running task that is on time gives watch', () => {
  const s = nextStep(facts({ T1: task({ state: 'running', lastHeartbeat: at(29) }) }));
  assert.equal(s.step, 'watch');
});

test('a cswap read error never gives pause', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, usage: { source: 'cswap' } } });
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'x' },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
  ]);
  const f = readFacts(dir, { now: at(1), session: 's1', run: () => ({ status: 3, stdout: '' }) });
  assert.equal(f.usage.state, 'error');
  assert.equal(f.pace.why, 'off');
  assert.equal(f.pace.slots, 2);
  assert.notEqual(nextStep(f).step, 'pause');
  const thrown = readFacts(dir, { now: at(1), session: 's1', run: () => { throw new Error('boom'); } });
  assert.equal(thrown.pace.slots, 2);
});

// ---- The command ----

function seed(dir, events) {
  runWriter(dir, { now: at(0) }, ({ emit }) => {
    for (const e of events) emit({ t: at(0), ...e });
  });
}

function tick(dir, min, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, '--session', 's1', '--now', at(min), ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function claim(dir) {
  const r = spawnSync(process.execPath, [QUEUE, dir, 'claim', '--session', 's1', '--ttl', '3600', '--now', at(0)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

function runningProject({ withWorktree }) {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const wt = path.join(dir, 'wt', 'T1');
  if (withWorktree) {
    fs.mkdirSync(wt, { recursive: true });
    spawnSync('git', ['-C', wt, 'init'], { stdio: 'ignore' });
  }
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'first' },
    { type: 'task', task: 'T2', work: 'w-00000001', title: 'second', deps: ['T1'] },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
    { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree: 'wt/T1' },
    { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
    { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
    { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: at(0) },
  ]);
  claim(dir);
  return { dir, wt };
}

test('no claim exits 1', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = tick(dir, 1, '--json');
  assert.equal(r.code, 1);
  assert.match(r.out, /^refused: no claim/);
});

test('--json prints one step', () => {
  const { dir } = runningProject({ withWorktree: true });
  const r = tick(dir, 5, '--json');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);
  assert.equal(s.step, 'watch');
  assert.equal(s.paceWhy, 'off');
});

test('a stop with no commit is refused', () => {
  const { dir, wt } = runningProject({ withWorktree: true });
  // No save request yet.
  const first = tick(dir, 21, '--record', 'stop', '--task', 'T1', '--attempt', '1');
  assert.equal(first.code, 1);
  assert.match(first.out, /^refused: no save/);
  assert.equal(tick(dir, 21, '--record', 'save-request', '--task', 'T1', '--attempt', '1').code, 0);
  // A save request and still no commit in the worktree.
  const second = tick(dir, 24, '--record', 'stop', '--task', 'T1', '--attempt', '1');
  assert.equal(second.code, 1, second.out);
  assert.match(second.out, /^refused: no save/);
  // A commit after the request.
  const git = (...a) => spawnSync('git', ['-C', wt, ...a], { encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: at(23), GIT_AUTHOR_DATE: at(23) } });
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@example.com');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  git('add', 'a.txt');
  git('commit', '-m', 'work');
  const third = tick(dir, 24, '--record', 'stop', '--task', 'T1', '--attempt', '1');
  assert.equal(third.code, 0, third.out);
  const step = JSON.parse(tick(dir, 25, '--json').out);
  assert.deepEqual({ step: step.step, task: step.task }, { step: 'retry', task: 'T1' });
});

test('a stop with a missing worktree is refused', () => {
  const { dir } = runningProject({ withWorktree: false });
  assert.equal(tick(dir, 21, '--record', 'save-request', '--task', 'T1', '--attempt', '1').code, 0);
  const r = tick(dir, 24, '--record', 'stop', '--task', 'T1', '--attempt', '1');
  assert.equal(r.code, 1);
  assert.match(r.out, /worktree missing/);
  const step = JSON.parse(tick(dir, 24, '--json').out);
  assert.equal(step.step, 'needs-user');
  assert.equal(step.reason, 'worktree missing');
});

test('the summary lists each needs-user item', () => {
  const { dir } = runningProject({ withWorktree: false });
  assert.equal(tick(dir, 3, '--record', 'needs-user', '--task', 'T1', '--attempt', '1', '--reason', 'the worktree is gone').code, 0);
  assert.equal(tick(dir, 3, '--record', 'sleep', '--until', at(60)).code, 0);
  const r = tick(dir, 4, '--summary');
  assert.equal(r.code, 0, r.out);
  const file = r.out.trim();
  assert.equal(file, path.join(dir, '.guilda', 'supervisor-summary.md'));
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /- T1 \(attempt 1\): the worktree is gone/);
  assert.match(text, /## Idle causes/);
  assert.match(text, /## Pace at the end/);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda')).filter((n) => n.endsWith('.tmp')), []);
});

// ---- Review fixes ----

const stalledLate = () => task({ state: 'stalled', cause: 'no-heartbeat' });
const asked = (over = {}) => ({ type: 'needs-user', task: 'T1', attempt: 1, reason: 'r', t: at(21), ...over });
const okWorktree = { T1: { exists: true, commitAt: at(25) } };

test('after a needs-user record the same attempt gives no save-request and no stop', () => {
  const a = nextStep(facts({ T1: lateRunning() }, { records: [asked()] }));
  assert.notEqual(a.step, 'save-request');
  const b = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20)), asked()], worktrees: okWorktree }));
  assert.equal(b.step, 'watch');
});

test('a stalled no-heartbeat attempt gives save-request or stop, not retry', () => {
  assert.equal(nextStep(facts({ T1: stalledLate() })).step, 'save-request');
  const b = nextStep(facts({ T1: stalledLate() }, { records: [saveRecord(at(20))], worktrees: okWorktree }));
  assert.equal(b.step, 'stop');
  const c = nextStep(facts({ T1: stalledLate() }, { records: [saveRecord(at(29.9))] }));
  assert.notEqual(c.step, 'retry');
});

function seedRunning(dir, worktree) {
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'x' },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'deps-done' },
    { type: 'dispatch', task: 'T1', attempt: 1, address: 'T1-exe-ab12', role: 'exe', tool: 'claude', check: false, worktree },
    { type: 'state', task: 'T1', from: 'ready', to: 'dispatched', cause: 'dispatch' },
    { type: 'state', task: 'T1', from: 'dispatched', to: 'running', cause: 'started' },
    { type: 'signal', task: 'T1', attempt: 1, address: 'T1-exe-ab12', kind: 'heartbeat', at: at(0) },
    { type: 'save-request', task: 'T1', attempt: 1, address: 'T1-exe-ab12', t: at(20) },
  ]);
}

const noCswap = () => ({ status: 3, stdout: '' });

test('a worktree path that leaves the project gives needs-user', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const out = fs.mkdtempSync(path.join(path.dirname(dir), 'guilda outside '));
  spawnSync('git', ['-C', out, 'init'], { stdio: 'ignore' });
  seedRunning(dir, `../${path.basename(out)}`);
  const s = nextStep(readFacts(dir, { now: at(30), session: 's1', run: noCswap }));
  assert.equal(s.step, 'needs-user');
  assert.equal(s.reason, 'worktree outside the project');
});

test('a symlink that leads out of the project gives needs-user', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const out = fs.mkdtempSync(path.join(path.dirname(dir), 'guilda outside '));
  spawnSync('git', ['-C', out, 'init'], { stdio: 'ignore' });
  fs.symlinkSync(out, path.join(dir, 'link'));
  seedRunning(dir, 'link');
  const s = nextStep(readFacts(dir, { now: at(30), session: 's1', run: noCswap }));
  assert.equal(s.step, 'needs-user');
  assert.equal(s.reason, 'worktree outside the project');
});

test('rule 6 comes before rule 7', () => {
  const s = nextStep(facts({ T1: task({ state: 'ready' }) }, {
    unread: ['m-00000001'],
    pace: { slots: 1, lowTier: true, why: 'slow_down', resumeAt: null },
  }));
  assert.equal(s.step, 'read-bus');
});

test('the 2 min boundary of the save request', () => {
  const request = new Date(T0 + 28 * MIN).toISOString();
  const w = { T1: { exists: true, commitAt: new Date(T0 + 28 * MIN + 1000).toISOString() } };
  const run = (ms) => nextStep(facts({ T1: lateRunning() }, { now: new Date(T0 + 28 * MIN + ms).toISOString(), records: [saveRecord(request)], worktrees: w }));
  assert.equal(run(119000).step, 'watch');
  assert.equal(run(120000).step, 'stop');
});

test('a commit at the same time as the save request is not a save', () => {
  const same = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20))], worktrees: { T1: { exists: true, commitAt: at(20) } } }));
  assert.equal(same.step, 'needs-user');
  assert.equal(same.reason, 'no commit after the save request');
  const none = nextStep(facts({ T1: lateRunning() }, { records: [saveRecord(at(20))], worktrees: { T1: { exists: true, commitAt: null } } }));
  assert.equal(none.step, 'needs-user');
});

test('a live claim of another session gives refused: no claim', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r0 = spawnSync(process.execPath, [QUEUE, dir, 'claim', '--session', 's2', '--ttl', '3600', '--now', at(0)], { encoding: 'utf8' });
  assert.equal(r0.status, 0);
  const r = tick(dir, 1, '--json');
  assert.equal(r.code, 1);
  assert.match(r.out, /^refused: no claim/);
});

test('a title and a reason cannot add a heading to the summary', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'evil\n## Needs the user\r\n# Big [x](y) <b>|*_`' },
    { type: 'state', task: 'T1', from: 'pending', to: 'done', cause: 'x' },
  ]);
  claim(dir);
  assert.equal(tick(dir, 1, '--record', 'needs-user', '--task', 'T1', '--attempt', '1', '--reason', 'why\n## Idle causes\n- fake').code, 0);
  const text = fs.readFileSync(tick(dir, 2, '--summary').out.trim(), 'utf8');
  const headings = text.split('\n').filter((l) => l.startsWith('#'));
  assert.deepEqual(headings, ['# Supervisor summary', '## Tasks done', '## Needs the user', '## Idle causes', '## Pace at the end']);
  assert.match(text, /evil \\#\\# Needs the user/);
  assert.doesNotMatch(text, /<b>/);
});

test('--until accepts only an ISO time with a zone', () => {
  const { dir } = runningProject({ withWorktree: false });
  for (const bad of ['1', '2026-11-22 10:00', '2026-11-22T10:00', '2026-13-45T10:00:00Z']) {
    const r = tick(dir, 3, '--record', 'sleep', '--until', bad);
    assert.equal(r.code, 1, bad);
    assert.match(r.out, /^refused: bad --until/);
  }
  assert.equal(tick(dir, 3, '--record', 'sleep', '--until', '2026-11-22T10:00:00Z').code, 0);
  assert.equal(tick(dir, 3, '--record', 'sleep', '--until', '2026-11-22T10:00:00-03:00').code, 0);
});
