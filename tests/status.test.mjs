import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { GENERATOR, writeSignal } from '../scripts/lib/queue.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';

const STATUS = path.join(REPO_ROOT, 'scripts', 'status.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'status');
const PLANS = path.join(REPO_ROOT, 'tests', 'fixtures', 'queue');
const NOW = '2026-11-10T14:02:11Z';
const T0 = Date.parse('2026-11-17T10:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

/** A project with the status fixture: journal.jsonl and a state.json of the current generator. */
function fixtureProject(config = MINIMAL_CONFIG) {
  const dir = tempProject({ config });
  const q = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(q, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'journal.jsonl'), path.join(q, 'journal.jsonl'));
  const state = fs.readFileSync(path.join(FIXTURES, 'state.json'), 'utf8').replace('@GENERATOR@', GENERATOR);
  fs.writeFileSync(path.join(q, 'state.json'), state);
  return dir;
}

test('status prints the state', () => {
  const dir = fixtureProject();
  const expected = fs.readFileSync(path.join(FIXTURES, 'expected.txt'), 'utf8');
  const r = run(STATUS, [dir, '--events', '3', '--now', NOW]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, expected);
  assert.equal(r.stdout.trimEnd().split('\n').length, 12);

  const j = run(STATUS, [dir, '--json', '--events', '3', '--now', NOW]);
  assert.equal(j.status, 0, j.stderr);
  const o = JSON.parse(j.stdout);
  assert.deepEqual(o.tasks, {
    pending: 2, ready: 1, dispatched: 0, running: 2, review: 1, done: 4, failed: 0, stalled: 1, held: 0, dead: 0,
  });
  assert.equal(o.agentSeconds, 12240);
  assert.equal(o.events.length, 3);
  assert.equal(o.running.length, 2);
  assert.equal(o.stalled.length, 1);
  assert.equal(o.stalled[0].cause, 'no-ack');
  assert.equal(o.running[1].late, 'no heartbeat for 16m');
  const files = fs.readdirSync(path.join(dir, '.guilda'));
  assert.ok(!files.includes('status.md'), 'status writes no file');
});

test('no queue yet', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = run(STATUS, [dir]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'guilda status: no queue yet\n');
  assert.ok(!fs.existsSync(path.join(dir, '.guilda', 'queue')));
});

test('no .guilda folder: refused and no folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda status '));
  const r = run(STATUS, [dir]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, `refused: guilda is not set up\n${SETUP_NOTICE}\n`);
  assert.deepEqual(fs.readdirSync(dir), []);
});

/** A project with T1 running with agent a1, a done signal waiting; returns { dir, address }. */
function endedProject(source) {
  const config = { ...MINIMAL_CONFIG, ...(source ? { usage: { source } } : {}) };
  const dir = tempProject({ config });
  fs.copyFileSync(path.join(PLANS, 'simple.plan.md'), path.join(dir, 'simple.plan.md'));
  const q = (min, ...args) => run(QUEUE, [dir, ...args, '--now', at(min)]);
  assert.equal(q(0, 'init', 'simple.plan.md', '--slots', '2').status, 0);
  assert.equal(q(0, 'sync').status, 0);
  const d = q(0, 'dispatch', 'T1', '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman', '--session', 's1');
  assert.equal(d.status, 0, d.stdout);
  const address = d.stdout.split('\n')[0].match(/address (\S+)$/)[1];
  writeSignal(dir, { agentId: 'a1' }, 'dispatch.json', { address, task: 'T1', attempt: 1, at: at(0) });
  writeSignal(dir, { agentId: 'a1' }, 'started', { at: at(0.5) });
  assert.equal(q(1, 'sync').status, 0);
  writeSignal(dir, { agentId: 'a1' }, 'done', { at: at(2), reason: 'finished', usage: null });
  return { dir, address, q };
}

test('queue writes status.md', () => {
  const { dir, q } = endedProject();
  const file = path.join(dir, '.guilda', 'status.md');
  assert.equal(q(3, 'sync').status, 0);
  let text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^guilda status — 2026-11-17T10:03:00Z\nTasks: pending 1 · ready 0 · dispatched 0 · running 0 · review 1 /);
  assert.equal(q(4, 'approve', 'T1').status, 0);
  text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\nTasks: pending 1 · ready 0 · dispatched 0 · running 0 · review 0 · done 1 /);
  const expected = run(STATUS, [dir, '--now', '2026-11-17T10:04:00Z']).stdout;
  assert.ok(text.startsWith(expected), 'the file has the text of status');
  const leftovers = fs.readdirSync(path.join(dir, '.guilda')).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('record lines only with cswap', () => {
  const on = endedProject('cswap');
  const out = on.q(3, 'sync').stdout.split('\n');
  assert.match(out[0], /^queue: \d+ events$/);
  const rec = out.filter((l) => l.startsWith('record_task '));
  assert.equal(rec.length, 1);
  assert.equal(out[1], rec[0]);
  const o = JSON.parse(rec[0].slice('record_task '.length));
  assert.deepEqual(Object.keys(o).sort(), [
    'address', 'agent_id', 'attempt', 'ended_at', 'model', 'outcome', 'project_hash', 'role', 'session_id',
    'started_at', 'task_id', 'tier', 'tool',
  ]);
  assert.equal(o.role, 'executor');
  assert.equal(o.task_id, 'T1');
  assert.equal(o.address, on.address);
  assert.equal(o.attempt, 1);
  assert.equal(o.agent_id, 'a1');
  assert.equal(o.session_id, 's1');
  assert.equal(o.tool, 'claude-code');
  assert.equal(o.tier, 'journeyman');
  assert.equal(o.model, 'sonnet');
  assert.equal(o.outcome, 'finished');
  assert.equal(o.started_at, at(0));
  assert.equal(o.ended_at, at(2));
  // a second sync folds nothing new: no second record
  assert.ok(!on.q(4, 'sync').stdout.includes('record_task'));

  for (const source of [undefined, 'off']) {
    const off = endedProject(source);
    assert.ok(!off.q(3, 'sync').stdout.includes('record_task'), `source ${source}`);
  }
});

test('a record line has no path and a 16-hex project hash', () => {
  const { dir, q } = endedProject('cswap');
  const line = q(3, 'sync').stdout.split('\n').find((l) => l.startsWith('record_task '));
  const o = JSON.parse(line.slice('record_task '.length));
  assert.match(o.project_hash, /^[0-9a-f]{16}$/);
  assert.ok(!line.includes('/'), line);
  assert.ok(!line.includes(os.tmpdir()));
  assert.ok(!line.includes(dir));
});

test('a bad state.json folds the journal in memory', () => {
  const dir = fixtureProject();
  const file = path.join(dir, '.guilda', 'queue', 'state.json');
  fs.writeFileSync(file, '{ not json');
  const r = run(STATUS, [dir, '--json', '--now', NOW]);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.tasks.pending, 9);
  assert.equal(o.tasks.running, 1);
  assert.equal(o.tasks.stalled, 1);
  assert.equal(o.events.length, 3);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
});
