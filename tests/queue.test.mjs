import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import {
  makeAddress,
  readJournal,
  readState,
  fold,
  writeSignal,
  validId,
  queuePaths,
  takeLock,
  ACK_TIMEOUT_MS,
  MAX_ATTEMPTS,
} from '../scripts/lib/queue.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'queue');
const T0 = Date.parse('2026-11-17T10:00:00.000Z');
const MIN = 60000;
const at = (min) => new Date(T0 + min * MIN).toISOString();
const ADDRESS_OF = /address (\S+)$/;

/** A temp project with a .guilda folder, and the fixture plans copied in. */
function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const f of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
  return dir;
}

/** Run queue.mjs with a fake clock (minutes after T0). */
function q(dir, min, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args, '--now', at(min)], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const qdir = (dir) => path.join(dir, '.guilda', 'queue');
const journalText = (dir) => fs.readFileSync(path.join(qdir(dir), 'journal.jsonl'), 'utf8');
const events = (dir) => readJournal(dir).events;
const stateFile = (dir) => JSON.parse(fs.readFileSync(path.join(qdir(dir), 'state.json'), 'utf8'));
const task = (dir, id) => stateFile(dir).tasks[id];
const stateEvents = (dir, id) => events(dir).filter((e) => e.type === 'state' && e.task === id);
const lastState = (dir, id) => stateEvents(dir, id).at(-1);

function ok(r) {
  assert.equal(r.code, 0, r.out);
  return r.out;
}

function dispatch(dir, min, id, ...extra) {
  const r = q(dir, min, 'dispatch', id, '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman', ...extra);
  const out = ok(r);
  return out.trim().split('\n')[0].match(ADDRESS_OF)[1];
}

/** Bind a Claude subagent to an address, as the identity hook does. */
function bind(dir, agentId, address, id, attempt) {
  writeSignal(dir, { agentId }, 'dispatch.json', { address, task: id, attempt, at: at(0) });
}

test('pending to done', () => {
  const dir = project();
  assert.match(ok(q(dir, 0, 'init', 'simple.plan.md', '--slots', '2')), /^queue: 2 tasks, work w-[0-9a-f]{8}\n/);
  ok(q(dir, 0, 'sync'));
  assert.equal(task(dir, 'T1').state, 'ready');
  assert.equal(task(dir, 'T2').state, 'pending');

  const r = q(dir, 0, 'dispatch', 'T1', '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman');
  assert.match(ok(r), /^dispatched T1 attempt 1 address T1-exe-[0-9a-f]{4}\n/);
  const address = r.out.split('\n')[0].match(ADDRESS_OF)[1];
  assert.equal(task(dir, 'T1').state, 'dispatched');

  bind(dir, 'a1', address, 'T1', 1);
  writeSignal(dir, { agentId: 'a1' }, 'started', { at: at(0.5) });
  ok(q(dir, 1, 'sync'));
  assert.equal(task(dir, 'T1').state, 'running');
  assert.equal(task(dir, 'T1').agentId, 'a1');
  assert.equal(task(dir, 'T1').address, address);

  writeSignal(dir, { agentId: 'a1' }, 'done', { at: at(2), reason: 'finished', usage: null });
  ok(q(dir, 3, 'sync'));
  assert.equal(task(dir, 'T1').state, 'review');
  assert.match(ok(q(dir, 4, 'approve', 'T1')), /^T1: review → done\n/);
  assert.equal(task(dir, 'T1').state, 'done');
  assert.equal(task(dir, 'T2').state, 'pending');
  ok(q(dir, 5, 'sync'));
  assert.equal(task(dir, 'T2').state, 'ready');

  // A fold of the journal from the first line gives the tasks of state.json.
  const s = stateFile(dir);
  assert.deepEqual(JSON.parse(JSON.stringify(fold(events(dir), { now: at(5) }).tasks)), s.tasks);
  assert.equal(s.journalSeq, events(dir).at(-1).seq);
  assert.match(s.generator, /^guilda \d+\.\d+\.\d+/);
  // Each event has seq, t and a type of the 0.3.0 vocabulary, and no field named time.
  const types = ['plan', 'task', 'dispatch', 'agent', 'signal', 'state', 'decision', 'takeover'];
  events(dir).forEach((e, i) => {
    assert.equal(e.seq, i + 1);
    assert.ok(types.includes(e.type), e.type);
    assert.equal(typeof e.t, 'string');
    assert.equal('time' in e, false);
  });
  const agent = events(dir).find((e) => e.type === 'agent');
  assert.deepEqual(
    { address: agent.address, task: agent.task, attempt: agent.attempt, agentId: agent.agentId },
    { address, task: 'T1', attempt: 1, agentId: 'a1' },
  );
  // The lock is gone after each run.
  assert.equal(fs.existsSync(path.join(qdir(dir), 'lock')), false);
});

test('timeouts, retry and dead', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(dir, 0, 'sync'));
  dispatch(dir, 0, 'T1');

  ok(q(dir, 1, 'sync'));
  assert.equal(task(dir, 'T1').state, 'dispatched');
  ok(q(dir, ACK_TIMEOUT_MS / MIN + 1, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  assert.equal(lastState(dir, 'T1').cause, 'no-ack');

  writeSignal(dir, { task: 'T1', attempt: 1 }, 'heartbeat', { at: at(4), busyUntil: null, tokens: 10 });
  ok(q(dir, 4, 'sync'));
  assert.equal(task(dir, 'T1').state, 'running');
  assert.equal(lastState(dir, 'T1').cause, 'heartbeat');
  assert.equal(task(dir, 'T1').lastHeartbeat, at(4));

  ok(q(dir, 18, 'sync'));
  assert.equal(task(dir, 'T1').state, 'running');
  ok(q(dir, 24, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  assert.equal(lastState(dir, 'T1').cause, 'no-heartbeat');
  ok(q(dir, 40, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');

  assert.match(ok(q(dir, 41, 'retry', 'T1')), /^T1: stalled → ready\n/);
  assert.equal(task(dir, 'T1').attempt, 2);
  dispatch(dir, 42, 'T1');
  ok(q(dir, 45, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  ok(q(dir, 46, 'retry', 'T1'));
  assert.equal(task(dir, 'T1').state, 'ready');
  assert.equal(task(dir, 'T1').attempt, MAX_ATTEMPTS);
  dispatch(dir, 47, 'T1');
  ok(q(dir, 50, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  assert.match(ok(q(dir, 51, 'retry', 'T1')), /^T1: stalled → dead\n/);
  assert.equal(task(dir, 'T1').state, 'dead');
  assert.equal(lastState(dir, 'T1').cause, 'attempts-used');

  // No sync moves a stalled task to dispatched.
  const back = stateEvents(dir, 'T1').filter((e) => e.from === 'stalled' && e.to === 'dispatched');
  assert.equal(back.length, 0);
  assert.equal(q(dir, 52, 'retry', 'T1').code, 1);
});

test('late done and old attempt', () => {
  // Case 1: a late done of the same attempt.
  const a = project();
  ok(q(a, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(a, 0, 'sync'));
  dispatch(a, 0, 'T1');
  writeSignal(a, { task: 'T1', attempt: 1 }, 'started', { at: at(0.5) });
  ok(q(a, 1, 'sync'));
  assert.equal(task(a, 'T1').state, 'running');
  ok(q(a, 30, 'sync'));
  assert.equal(task(a, 'T1').state, 'stalled');
  writeSignal(a, { task: 'T1', attempt: 1 }, 'done', { at: at(31), reason: 'finished', usage: null });
  ok(q(a, 32, 'sync'));
  assert.equal(task(a, 'T1').state, 'review');
  assert.equal(lastState(a, 'T1').cause, 'late-done');

  // Case 2: a done of an older attempt changes no state.
  const b = project();
  ok(q(b, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(b, 0, 'sync'));
  dispatch(b, 0, 'T1');
  ok(q(b, 3, 'sync'));
  ok(q(b, 4, 'retry', 'T1'));
  dispatch(b, 5, 'T1');
  writeSignal(b, { task: 'T1', attempt: 2 }, 'started', { at: at(5.5) });
  ok(q(b, 6, 'sync'));
  assert.equal(task(b, 'T1').state, 'running');
  const before = stateEvents(b, 'T1').length;
  writeSignal(b, { task: 'T1', attempt: 1 }, 'done', { at: at(7), reason: 'finished', usage: null });
  ok(q(b, 8, 'sync'));
  const sig = events(b).filter((e) => e.type === 'signal' && e.kind === 'done');
  assert.equal(sig.length, 1);
  assert.equal(sig[0].attempt, 1);
  assert.equal(sig[0].task, 'T1');
  assert.ok('head' in sig[0]);
  assert.equal(task(b, 'T1').state, 'running');
  assert.equal(task(b, 'T1').attempt, 2);
  assert.equal(stateEvents(b, 'T1').length, before);
  // The signal is recorded one time: a second sync adds no event.
  assert.match(ok(q(b, 9, 'sync')), /^queue: 0 events\n/);
});

test('partial and bad lines', () => {
  // A last partial line: the state of the first 8 events and no error.
  const a = project();
  ok(q(a, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(a, 0, 'sync'));
  dispatch(a, 0, 'T1');
  ok(q(a, 0, 'add', 'T2', '--title', 'b', '--deps', 'T1'));
  ok(q(a, 0, 'add', 'T3', '--title', 'c', '--deps', 'T1'));
  ok(q(a, 0, 'add', 'T4', '--title', 'd', '--deps', 'T1'));
  assert.equal(events(a).length, 8);
  const first8 = fold(events(a), { now: at(1) });
  fs.appendFileSync(path.join(qdir(a), 'journal.jsonl'), '{"seq":9,"t":"…","type":"st');
  const j = readJournal(a);
  assert.equal(j.partial, true);
  assert.deepEqual(j.skipped, []);
  assert.equal(j.events.length, 8);
  const r = ok(q(a, 1, 'sync'));
  assert.doesNotMatch(r, /skipped/);
  assert.deepEqual(stateFile(a).tasks, JSON.parse(JSON.stringify(first8.tasks)));
  assert.equal(stateFile(a).journalSeq, 8);

  // A bad line: skipped and reported with its number.
  const b = project();
  ok(q(b, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(b, 0, 'sync'));
  fs.appendFileSync(path.join(qdir(b), 'journal.jsonl'), 'not json\n');
  ok(q(b, 0, 'add', 'T2', '--title', 'b'));
  assert.deepEqual(readJournal(b).skipped, [4]);
  const out = ok(q(b, 1, 'sync'));
  assert.match(out, /^queue: \d+ events\n/);
  assert.match(out, /queue: skipped bad line 4/);
  assert.equal(task(b, 'T2').state, 'ready');
});

test('an append after a partial last line keeps the next event', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  fs.appendFileSync(path.join(qdir(dir), 'journal.jsonl'), '{"seq":3,"t":"x","type":"decision","tas');
  ok(q(dir, 0, 'add', 'T9', '--title', 'nine'));
  const text = journalText(dir);
  assert.ok(text.endsWith('\n'));
  const j = readJournal(dir);
  assert.deepEqual(j.skipped, []);
  assert.equal(j.partial, false);
  const added = j.events.find((e) => e.type === 'task' && e.task === 'T9');
  assert.ok(added, text);
  assert.deepEqual(j.events.map((e) => e.seq), [1, 2, 3, 4]);
  assert.equal(task(dir, 'T9').title, 'nine');
});

test('two takeovers of one stale lock: exactly one wins', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  const rootReal = fs.realpathSync(dir);
  const P = queuePaths(rootReal);
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const stale = JSON.stringify({ pid: Number(gone.stdout), session: 'old', at: at(0) });
  fs.writeFileSync(P.lock, stale);
  const wins = [];
  const refused = [];
  const attempt = (session, hook) => {
    try {
      wins.push({ session, takeover: takeLock(P, rootReal, session, at(1), hook) });
    } catch (err) {
      refused.push({ session, code: err.exitCode, message: err.message });
    }
  };
  // The second run does its whole takeover while the first is between its check and its replace.
  attempt('first', { beforeReplace: () => attempt('second') });
  assert.equal(wins.length, 1, JSON.stringify({ wins, refused }));
  assert.equal(refused.length, 1, JSON.stringify({ wins, refused }));
  assert.equal(refused[0].code, 3);
  assert.equal(wins[0].takeover.oldSession, 'old');
  assert.equal(JSON.parse(fs.readFileSync(P.lock, 'utf8')).session, wins[0].session);
  // No temp file and no takeover guard is left; only the lock of the winner.
  assert.deepEqual(fs.readdirSync(P.dir).sort(), ['journal.jsonl', 'lock', 'state.json']);
});

test('lock and takeover', () => {
  // A live pid: exit 3, no new journal line, the lock of the other run stays, no file of this run is left.
  const a = project();
  ok(q(a, 0, 'init', 'one.plan.md', '--slots', '1'));
  const lock = path.join(qdir(a), 'lock');
  const live = JSON.stringify({ pid: process.pid, session: 's9', at: at(0) });
  fs.writeFileSync(lock, live);
  const before = journalText(a);
  const filesBefore = fs.readdirSync(qdir(a)).sort();
  const r = q(a, 1, 'sync');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, new RegExp(`^queue locked by pid ${process.pid}\\n`));
  assert.equal(journalText(a), before);
  assert.equal(fs.readFileSync(lock, 'utf8'), live);
  assert.deepEqual(fs.readdirSync(qdir(a)).sort(), filesBefore);

  // A dead pid: a takeover event, the command goes on, and no lock is left.
  const b = project();
  ok(q(b, 0, 'init', 'one.plan.md', '--slots', '1'));
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const deadPid = Number(gone.stdout);
  fs.writeFileSync(path.join(qdir(b), 'lock'), JSON.stringify({ pid: deadPid, session: 'old', at: at(0) }));
  ok(q(b, 1, 'sync', '--session', 's1'));
  const take = events(b).find((e) => e.type === 'takeover');
  assert.ok(take);
  assert.equal(take.oldPid, deadPid);
  assert.equal(take.oldSession, 'old');
  assert.equal(task(b, 'T1').state, 'ready');
  assert.deepEqual(fs.readdirSync(qdir(b)).sort(), ['journal.jsonl', 'state.json']);
});

test('the lock is never empty', async () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  const lock = path.join(qdir(dir), 'lock');
  const bad = [];
  let seen = 0;
  const codes = [];
  for (let round = 0; round < 5; round++) {
    const kids = [];
    for (let k = 0; k < 4; k++) {
      kids.push(
        new Promise((resolve) => {
          const c = spawn(process.execPath, [SCRIPT, dir, 'sync', '--now', at(1)], { stdio: 'ignore' });
          c.on('exit', (code) => resolve(code));
        }),
      );
    }
    const end = Date.now() + 1000;
    while (Date.now() < end) {
      let text;
      try {
        text = fs.readFileSync(lock, 'utf8');
      } catch {
        continue;
      }
      seen++;
      try {
        const v = JSON.parse(text);
        if (!Number.isInteger(v.pid) || typeof v.at !== 'string' || !('session' in v)) bad.push(text);
      } catch {
        bad.push(text);
      }
    }
    codes.push(...(await Promise.all(kids)));
  }
  assert.deepEqual(bad, []);
  assert.ok(codes.every((c) => c === 0 || c === 3), String(codes));
  assert.ok(codes.includes(0));
  assert.equal(fs.existsSync(lock), false);
  assert.deepEqual(readJournal(dir).skipped, []);
  // The poll must have found a lock at least once, or the test proves nothing.
  assert.ok(seen > 0, 'no lock was seen');
});

test('held has no reason', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'simple.plan.md', '--slots', '2'));
  ok(q(dir, 0, 'sync'));
  dispatch(dir, 0, 'T1');
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'started', { at: at(0.5) });
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'done', { at: at(0.7), reason: 'finished', usage: null });
  ok(q(dir, 1, 'sync'));
  ok(q(dir, 1, 'approve', 'T1'));
  assert.equal(task(dir, 'T1').state, 'done');
  assert.equal(task(dir, 'T2').state, 'pending');

  assert.match(ok(q(dir, 2, 'hold', 'T2')), /^T2: (pending|ready) → held\n/);
  assert.equal(task(dir, 'T2').state, 'held');
  ok(q(dir, 3, 'sync'));
  ok(q(dir, 4, 'sync'));
  assert.equal(task(dir, 'T2').state, 'held');
  assert.match(ok(q(dir, 5, 'release', 'T2')), /^T2: held → pending\n/);
  assert.equal(task(dir, 'T2').state, 'pending');
  ok(q(dir, 6, 'sync'));
  assert.equal(task(dir, 'T2').state, 'ready');

  const hold = events(dir).find((e) => e.type === 'decision' && e.decision === 'hold');
  assert.deepEqual(Object.keys(hold).sort(), ['by', 'decision', 'seq', 't', 'tasks', 'type']);
  const held = events(dir).find((e) => e.type === 'state' && e.to === 'held');
  assert.equal(held.cause, 'hold');
  assert.deepEqual(Object.keys(held).sort(), ['cause', 'from', 'seq', 't', 'task', 'to', 'type']);
  for (const e of events(dir)) assert.equal('reason' in e && e.type !== 'signal', false, JSON.stringify(e));
  assert.doesNotMatch(fs.readFileSync(path.join(qdir(dir), 'state.json'), 'utf8'), /"reason"/);

  // A stalled task cannot be held.
  ok(q(dir, 7, 'dispatch', 'T2', '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman'));
  ok(q(dir, 10, 'sync'));
  const r = q(dir, 11, 'hold', 'T2');
  assert.equal(r.code, 1);
  assert.match(r.out, /cannot hold stalled/);
});

test('invalid ID writes nothing', () => {
  const dir = project();
  const listBefore = fs.readdirSync(dir).sort();
  for (const id of ['../../y', 'main', 'a/b', 'x'.repeat(25)]) {
    const r = q(dir, 0, 'add', id, '--title', 't');
    assert.equal(r.code, 1, id);
    assert.match(r.out, /invalid ID/);
  }
  assert.equal(fs.existsSync(qdir(dir)), false);
  assert.deepEqual(fs.readdirSync(dir).sort(), listBefore);
  assert.equal(fs.existsSync(path.join(dir, '..', 'y')), false);

  assert.equal(validId('task', 'T1'), true);
  assert.equal(validId('task', 'council'), false);
  assert.equal(validId('agent', '..'), false);
  assert.equal(validId('agent', 'a/b'), false);
  assert.equal(validId('attempt', 4), false);
  assert.equal(validId('address', 'T3-exe-7f2a'), true);
  assert.equal(validId('address', 'T3-exe-7f2a/..'), false);
  assert.throws(() => writeSignal(dir, { task: '../x', attempt: 1 }, 'started', { at: at(0) }), /invalid ID/);
  assert.throws(() => writeSignal(dir, { agentId: '..' }, 'started', { at: at(0) }), /invalid ID/);
  assert.throws(() => writeSignal(dir, { task: 'T1', attempt: 1 }, '../started', { at: at(0) }), /invalid ID/);
  assert.equal(fs.existsSync(qdir(dir)), false);
});

test('check run', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'check.plan.md', '--slots', '1'));
  ok(q(dir, 0, 'sync'));
  const work = dispatch(dir, 0, 'T3');
  bind(dir, 'a0', work, 'T3', 1);
  writeSignal(dir, { agentId: 'a0' }, 'started', { at: at(0.5) });
  writeSignal(dir, { agentId: 'a0' }, 'done', { at: at(0.8), reason: 'finished', usage: null });
  ok(q(dir, 1, 'sync'));
  assert.equal(task(dir, 'T3').state, 'review');

  const statesBefore = stateEvents(dir, 'T3').length;
  const r = q(dir, 2, 'dispatch', 'T3', '--check', '--role', 'rev', '--tool', 'claude', '--tier', 'master');
  assert.match(ok(r), /^dispatched T3 attempt 1 address T3-rev-[0-9a-f]{4}\n/);
  const address = r.out.split('\n')[0].match(ADDRESS_OF)[1];
  const d = events(dir).at(-1);
  assert.equal(d.type, 'dispatch');
  assert.equal(d.check, true);
  assert.equal(d.address, address);
  assert.equal(stateEvents(dir, 'T3').length, statesBefore);

  bind(dir, 'd4e5f6', address, 'T3', 1);
  ok(q(dir, 3, 'sync'));
  const agent = events(dir).filter((e) => e.type === 'agent').at(-1);
  assert.equal(agent.address, address);
  assert.equal(agent.task, 'T3');
  assert.equal(agent.agentId, 'd4e5f6');

  writeSignal(dir, { agentId: 'd4e5f6' }, 'done', { at: at(4), reason: 'finished', usage: null });
  ok(q(dir, 5, 'sync'));
  assert.equal(task(dir, 'T3').state, 'review');
  assert.equal(stateEvents(dir, 'T3').length, statesBefore);
  assert.deepEqual(task(dir, 'T3').checks, [{ address, role: 'rev', agentId: 'd4e5f6', attempt: 1 }]);
  assert.equal(task(dir, 'T3').agentId, 'a0');

  const before = journalText(dir);
  const bad = q(dir, 6, 'dispatch', 'T3', '--check', '--role', 'exe', '--tool', 'claude', '--tier', 'master');
  assert.equal(bad.code, 1);
  assert.equal(journalText(dir), before);
});

test('init with parts', () => {
  const dir = project();
  const r1 = q(dir, 0, 'init', 'login.plan.md', '--slots', '2');
  assert.equal(r1.code, 1);
  assert.match(r1.out, /^queue: the plan has Parts; use --part\n/);
  assert.equal(fs.existsSync(path.join(qdir(dir), 'journal.jsonl')), false);

  const r2 = ok(q(dir, 0, 'init', 'login.plan.md', '--slots', '2', '--part', '1'));
  const r3 = ok(q(dir, 0, 'init', 'login.plan.md', '--slots', '2', '--part', '2'));
  const w2 = r2.match(/^queue: 2 tasks, work (w-[0-9a-f]{8})\n/)[1];
  const w3 = r3.match(/^queue: 2 tasks, work (w-[0-9a-f]{8})\n/)[1];
  assert.notEqual(w2, w3);
  const s = stateFile(dir);
  assert.deepEqual(Object.keys(s.tasks).sort(), ['P1T1', 'P1T2', 'P2T1', 'P2T2']);
  assert.deepEqual(s.tasks.P2T2.deps, ['P2T1']);
  assert.deepEqual(s.tasks.P2T2.uses, ['D14@3f2a9c1b']);
  assert.deepEqual(s.tasks.P2T2.owns, ['D14']);
  const ev = events(dir).find((e) => e.type === 'task' && e.task === 'P2T2');
  assert.equal(ev.key, 'login.plan#Part2.T2');
  assert.equal(ev.work, w3);
  assert.deepEqual(s.works[w3], { plan: 'login.plan.md', part: 2 });

  const before = journalText(dir);
  const r4 = q(dir, 0, 'init', 'login.plan.md', '--slots', '2', '--part', '2');
  assert.equal(r4.code, 1);
  assert.match(r4.out, /^queue: task P2T1 exists\n/);
  assert.equal(journalText(dir), before);
});

test('crash after the dispatch event', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(dir, 0, 'sync'));
  const first = dispatch(dir, 0, 'T1');
  const tail = events(dir).slice(-2).map((e) => e.type);
  assert.deepEqual(tail, ['dispatch', 'state']);

  ok(q(dir, 1, 'sync'));
  assert.equal(task(dir, 'T1').state, 'dispatched');
  ok(q(dir, 3, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  assert.equal(lastState(dir, 'T1').cause, 'no-ack');
  ok(q(dir, 10, 'sync'));
  ok(q(dir, 10, 'sync'));
  assert.equal(task(dir, 'T1').state, 'stalled');
  assert.equal(events(dir).filter((e) => e.type === 'dispatch').length, 1);

  ok(q(dir, 11, 'retry', 'T1'));
  ok(q(dir, 11, 'sync'));
  const second = dispatch(dir, 11, 'T1');
  assert.notEqual(second, first);
  assert.equal(task(dir, 'T1').state, 'dispatched');
  assert.equal(task(dir, 'T1').attempt, 2);
  assert.equal(task(dir, 'T1').address, second);

  const n = stateEvents(dir, 'T1').length;
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'started', { at: at(11.5) });
  ok(q(dir, 12, 'sync'));
  const late = events(dir).filter((e) => e.type === 'signal' && e.kind === 'started');
  assert.equal(late.length, 1);
  assert.equal(late[0].attempt, 1);
  assert.equal(stateEvents(dir, 'T1').length, n);
  assert.equal(task(dir, 'T1').state, 'dispatched');
});

test('a dependency cycle is refused', () => {
  const dir = project();
  const r = q(dir, 0, 'init', 'cycle.plan.md', '--slots', '1');
  assert.equal(r.code, 1);
  assert.match(r.out, /cycle/);
  assert.match(r.out, /T1/);
  assert.match(r.out, /T2/);
  assert.equal(fs.existsSync(path.join(qdir(dir), 'journal.jsonl')), false);
});

test('makeAddress draws again on a match', () => {
  const draws = [Buffer.from([0x7f, 0x2a]), Buffer.from([0x00, 0x01])];
  let calls = 0;
  const random = (n) => {
    assert.equal(n, 2);
    return draws[Math.min(calls++, draws.length - 1)];
  };
  assert.equal(makeAddress('T3', 'exe', new Set(['T3-exe-7f2a']), random), 'T3-exe-0001');
  assert.equal(calls, 2);

  calls = 0;
  const same = () => {
    calls++;
    return Buffer.from([0x7f, 0x2a]);
  };
  assert.throws(() => makeAddress('T3', 'exe', ['T3-exe-7f2a'], same), /no free address/);
  assert.equal(calls, 10);

  assert.match(makeAddress('T3', 'rev', []), /^T3-rev-[0-9a-f]{4}$/);
  assert.throws(() => makeAddress('../x', 'exe', []), /invalid ID/);
  assert.throws(() => makeAddress('T3', 'zz', []), /invalid ID/);
});

test('a failed state write exits 2 and dispatches nothing', () => {
  const src = project();
  ok(q(src, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(src, 0, 'sync'));
  // The same journal in a project where state.json is a folder: the state write fails.
  const dir = project();
  fs.mkdirSync(qdir(dir));
  fs.copyFileSync(path.join(qdir(src), 'journal.jsonl'), path.join(qdir(dir), 'journal.jsonl'));
  fs.mkdirSync(path.join(qdir(dir), 'state.json'));
  const before = journalText(dir);
  const r = q(dir, 1, 'dispatch', 'T1', '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /io-error: .*state\.json/);
  assert.doesNotMatch(r.out, /dispatched/);
  assert.equal(journalText(dir), before);
  assert.equal(fs.existsSync(path.join(qdir(dir), 'lock')), false);
});

test('no .guilda folder: refused and no folder', () => {
  const dir = tempProject();
  for (const args of [['sync'], ['add', 'T1', '--title', 't'], ['init', 'x.plan.md', '--slots', '1']]) {
    const r = q(dir, 0, ...args);
    assert.equal(r.code, 1);
    assert.equal(r.out, `refused: guilda is not set up\n${SETUP_NOTICE}\n`);
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  assert.throws(() => writeSignal(dir, { task: 'T1', attempt: 1 }, 'started', { at: at(0) }));
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('readState folds the journal when state.json is older', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(dir, 0, 'sync'));
  const file = path.join(qdir(dir), 'state.json');
  const old = fs.readFileSync(file, 'utf8');
  dispatch(dir, 0, 'T1');

  // A state.json with the last seq is read as it is.
  const marked = stateFile(dir);
  marked.tasks.T1.title = 'from the file';
  fs.writeFileSync(file, JSON.stringify(marked));
  assert.equal(readState(dir, { now: at(1) }).tasks.T1.title, 'from the file');

  // An older state.json: the fold of the journal, and no write.
  fs.writeFileSync(file, old);
  const s = readState(dir, { now: at(1) });
  assert.equal(s.tasks.T1.state, 'dispatched');
  assert.equal(s.journalSeq, events(dir).at(-1).seq);
  assert.equal(fs.readFileSync(file, 'utf8'), old);

  // Bad JSON and a missing file: the fold too.
  fs.writeFileSync(file, '{ not json');
  assert.equal(readState(dir, { now: at(1) }).tasks.T1.state, 'dispatched');
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
});

/** A file outside the temp project, as the target of a planted link. */
function outsideFile() {
  const out = tempProject();
  const file = path.join(out, 'target.txt');
  fs.writeFileSync(file, 'outside\n');
  return file;
}

test('a link at state.json.tmp, state.json or journal.jsonl changes nothing outside', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  const tmpTarget = outsideFile();
  fs.symlinkSync(tmpTarget, path.join(qdir(dir), 'state.json.tmp'));
  ok(q(dir, 0, 'sync'));
  assert.equal(fs.readFileSync(tmpTarget, 'utf8'), 'outside\n');
  assert.equal(task(dir, 'T1').state, 'ready');

  const j = project();
  const jTarget = outsideFile();
  fs.mkdirSync(qdir(j));
  fs.symlinkSync(jTarget, path.join(qdir(j), 'journal.jsonl'));
  const r1 = q(j, 0, 'add', 'T1', '--title', 'one');
  assert.equal(r1.code, 2, r1.out);
  assert.match(r1.out, /^io-error: .*journal\.jsonl\n/);
  assert.equal(fs.readFileSync(jTarget, 'utf8'), 'outside\n');
  assert.equal(fs.existsSync(path.join(qdir(j), 'lock')), false);

  const st = project();
  ok(q(st, 0, 'init', 'one.plan.md', '--slots', '1'));
  const st2 = project();
  const sTarget = outsideFile();
  fs.mkdirSync(qdir(st2));
  fs.copyFileSync(path.join(qdir(st), 'journal.jsonl'), path.join(qdir(st2), 'journal.jsonl'));
  fs.symlinkSync(sTarget, path.join(qdir(st2), 'state.json'));
  const before = journalText(st2);
  const r2 = q(st2, 0, 'sync');
  assert.equal(r2.code, 2, r2.out);
  assert.match(r2.out, /^io-error: .*state\.json\n/);
  assert.equal(fs.readFileSync(sTarget, 'utf8'), 'outside\n');
  assert.equal(journalText(st2), before);
});

test('a linked signals folder creates nothing outside', () => {
  const dir = project();
  const out = tempProject();
  fs.mkdirSync(qdir(dir));
  fs.symlinkSync(out, path.join(qdir(dir), 'signals'));
  assert.throws(() => writeSignal(dir, { task: 'T1', attempt: 1 }, 'started', { at: at(0) }), /link/);
  assert.throws(() => writeSignal(dir, { agentId: 'a1' }, 'heartbeat', { at: at(0) }), /link/);
  assert.deepEqual(fs.readdirSync(out), []);
});

test('a signal with a bad field is skipped and counted', () => {
  const dir = project();
  ok(q(dir, 0, 'init', 'one.plan.md', '--slots', '1'));
  ok(q(dir, 0, 'sync'));
  dispatch(dir, 0, 'T1');
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'started', { at: at(0.5), reason: 'finished' });
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'heartbeat', { at: at(0.6), tokens: 'many', busyUntil: null });
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'done', {
    at: at(0.7),
    reason: 'finished',
    usage: [{ model: 'm', input: '1', cacheRead: 0, cacheCreation: 0, output: 0 }],
  });
  writeSignal(dir, { task: 'T1', attempt: 1 }, 'failed', { at: at(0.8), reason: 'bogus', usage: null });
  const out = ok(q(dir, 1, 'sync'));
  assert.match(out, /queue: skipped 4 bad signal files/);
  assert.equal(events(dir).filter((e) => e.type === 'signal').length, 0);
  assert.equal(task(dir, 'T1').state, 'dispatched');
});

test('a task named __proto__ in the journal touches no prototype', () => {
  const lines = [
    { seq: 1, t: at(0), type: 'task', task: '__proto__', work: null, key: null, title: 'x', deps: [], uses: [], owns: [] },
    { seq: 2, t: at(0), type: 'state', task: '__proto__', from: 'pending', to: 'ready', cause: 'deps-done' },
    { seq: 3, t: at(0), type: 'plan', plan: 'p', part: null, work: '__proto__', slots: 1 },
  ];
  const s = fold(lines, { now: at(1) });
  assert.equal({}.state, undefined);
  assert.equal({}.plan, undefined);
  assert.equal(Object.hasOwn(s.tasks, '__proto__'), true);
  assert.equal(s.tasks.__proto__.state, 'ready');
});

test('a journal that is a hard link to another file is refused, and the other file does not change', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const outside = path.join(tempProject(), 'outside.txt');
  fs.writeFileSync(outside, 'keep\n');
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.linkSync(outside, path.join(dir, '.guilda', 'queue', 'journal.jsonl'));
  const r = spawnSync(process.execPath, [SCRIPT, dir, 'sync'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep\n');
});

test('readJournal refuses a symbolic link at the journal and does not read the target', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const target = path.join(tempProject(), 'secret.jsonl');
  fs.writeFileSync(target, '{"event":"secret"}\n');
  fs.mkdirSync(qdir(dir), { recursive: true });
  fs.symlinkSync(target, path.join(qdir(dir), 'journal.jsonl'));
  assert.throws(() => readJournal(dir), /io-error|journal\.jsonl/);
});

test('readJournal refuses a hard-linked journal', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const outside = path.join(tempProject(), 'outside.jsonl');
  fs.writeFileSync(outside, '{"event":"x"}\n');
  fs.mkdirSync(qdir(dir), { recursive: true });
  fs.linkSync(outside, path.join(qdir(dir), 'journal.jsonl'));
  assert.throws(() => readJournal(dir), /io-error|journal\.jsonl/);
});

test('readJournal returns no events when the journal is missing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.deepEqual(readJournal(dir).events, []);
});

test('readJournal refuses a symbolic link at .guilda/queue or at .guilda, and does not read the target', () => {
  const outside = fs.mkdtempSync(path.join(tempProject(), 'out-'));
  fs.writeFileSync(path.join(outside, 'journal.jsonl'), '{"event":"secret"}\n');
  const a = tempProject({ config: MINIMAL_CONFIG });
  fs.symlinkSync(outside, path.join(qdir(a)));
  assert.throws(() => readJournal(a), /io-error|queue/);
  const b = tempProject();
  fs.mkdirSync(path.join(outside, 'queue'));
  fs.writeFileSync(path.join(outside, 'queue', 'journal.jsonl'), '{"event":"secret"}\n');
  fs.symlinkSync(outside, path.join(b, '.guilda'));
  assert.throws(() => readJournal(b), /io-error|queue/);
});

test('readJournal refuses a FIFO at the journal', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(qdir(dir), { recursive: true });
  const r = spawnSync('mkfifo', [path.join(qdir(dir), 'journal.jsonl')]);
  assert.equal(r.status, 0);
  assert.throws(() => readJournal(dir), /io-error|journal\.jsonl/);
});
