import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG, runHook } from './helpers.mjs';
import { GENERATOR, writeSignal } from '../scripts/lib/queue.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
import { buildIndex } from '../scripts/lib/trace.mjs';

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

// ---- status --agent (D32, section 4f) ----

const AGENT_FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'status-agent');
const readFixture = (name) => fs.readFileSync(path.join(AGENT_FIXTURES, name), 'utf8');
const sh = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
const TRANSCRIPT_PATH = '/synthetic/agent-a1b2c3.jsonl';

/** A project for the S23 fixture. `git: false` gives no repository. Returns { dir, base, head, d14, d27now, fill }. */
function agentProject({ git = true, edit = (t) => t, auditEdit = (t) => t } = {}) {
  const dir = tempProject({ config: MINIMAL_CONFIG, git });
  const specDir = path.join(dir, 'docs', 'superpowers', 'specs');
  fs.mkdirSync(specDir, { recursive: true });
  fs.copyFileSync(path.join(AGENT_FIXTURES, 'spec.md'), path.join(specDir, 'fixture.md'));
  let base = null;
  let head = null;
  if (git) {
    sh(dir, ['add', 'docs']);
    sh(dir, ['commit', '-m', 'base']);
    base = sh(dir, ['rev-parse', 'HEAD']).stdout.trim();
    for (const n of ['one', 'two']) {
      fs.writeFileSync(path.join(dir, `${n}.txt`), n);
      sh(dir, ['add', `${n}.txt`]);
      sh(dir, ['commit', '-m', n]);
    }
    head = sh(dir, ['rev-parse', 'HEAD']).stdout.trim();
  }
  const idx = buildIndex(dir);
  const d14 = idx.blocks.D14.hash;
  const d27now = idx.blocks.D27.hash;
  const fill = (text, abbrev = false) =>
    text
      .replaceAll('<base>', abbrev ? base.slice(0, 7) : base ?? '').replaceAll('<head>', abbrev ? head.slice(0, 7) : head ?? '').replaceAll('<d14>', d14)
      .replaceAll('<d27now>', d27now).replaceAll('<transcript>', TRANSCRIPT_PATH);
  const q = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(q, { recursive: true });
  const journal = fill(edit(readFixture('journal.jsonl')));
  fs.writeFileSync(path.join(q, 'journal.jsonl'), git ? journal : journal.replace(/"baseCommit":"",/, '"baseCommit":null,').replace(/"head":""/, '"head":null'));
  fs.writeFileSync(path.join(dir, '.guilda', 'audit.jsonl'), fill(auditEdit(readFixture('audit.jsonl'))));
  return { dir, base, head, d14, d27now, fill };
}

const agentOut = (dir, ...names) => run(STATUS, [dir, '--agent', ...names]);

test('name an agent', () => {
  const p = agentProject();
  const expected = p.fill(readFixture('expected.txt'), true);
  assert.equal(expected.split('\n').filter(Boolean).length, 8);
  const forms = [['T3-exe-7f2a'], ['a1b2c3'], ['executor T3'], ['executor', 'T3']];
  for (const form of forms) {
    const r = agentOut(p.dir, ...form);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, expected, form.join(' '));
  }
  const bad = agentOut(p.dir, 'T9-exe-0000');
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, 'status: no agent T9-exe-0000\n');
  const noRole = agentOut(p.dir, 'qa T3');
  assert.equal(noRole.status, 1);
  assert.equal(noRole.stdout, 'status: no agent qa T3\n');
});

test('a check role prints each check run', () => {
  const p = agentProject();
  const r = agentOut(p.dir, 'reviewer T3');
  assert.equal(r.status, 0, r.stderr);
  const heads = r.stdout.split('\n').filter((l) => l.startsWith('agent: '));
  assert.deepEqual(heads, [
    'agent: T3-rev-a9f0 (reviewer, claude, in session, agent r1)',
    'agent: T3-rev-b7c1 (reviewer, claude, in session, agent r2)',
  ]);
});

test('two attempts give two blocks', () => {
  const extra = [
    '{"seq":15,"t":"2026-11-17T11:00:00.000Z","type":"state","task":"T3","from":"done","to":"ready","cause":"reject"}',
    '{"seq":16,"t":"2026-11-17T11:00:01.000Z","type":"dispatch","task":"T3","attempt":2,"address":"T3-exe-9c3d","role":"exe","tool":"codex","inSession":false,"check":false,"tier":"journeyman","session":"s1","briefFile":".guilda/work/login/T3-brief.md","baseCommit":"<base>","uses":[]}',
    '{"seq":17,"t":"2026-11-17T11:00:02.000Z","type":"agent","address":"T3-exe-9c3d","task":"T3","attempt":2,"agentId":"d4e5f6"}',
  ].join('\n');
  const p = agentProject({ edit: (t) => `${t}${extra}\n` });
  const r = agentOut(p.dir, 'executor T3');
  assert.equal(r.status, 0, r.stderr);
  const blocks = r.stdout.trimEnd().split('\n\n');
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /^agent: T3-exe-7f2a \(executor, claude, in session, agent a1b2c3\)\ntask: T3 — Login form; attempt 1; /);
  assert.match(blocks[1], /^agent: T3-exe-9c3d \(executor, codex, outside, agent d4e5f6\)\ntask: T3 — Login form; attempt 2; /);
  for (const b of blocks) assert.equal(b.split('\n').length, 8);
});

test('no agent event', () => {
  const p = agentProject({ edit: (t) => t.split('\n').filter((l) => !l.includes('"type":"agent","address":"T3-exe-7f2a"')).join('\n') });
  const r = agentOut(p.dir, 'T3-exe-7f2a');
  assert.equal(r.status, 0, r.stderr);
  const first = r.stdout.split('\n')[0];
  assert.equal(first, 'agent: T3-exe-7f2a (executor, claude, in session, no agent ID)');
  assert.ok(!r.stdout.includes('agent a1b2c3'));
  assert.match(r.stdout, /\naudit: 0 tool calls; files: none\n/);
});

test('no copy', () => {
  const p = agentProject({ auditEdit: (t) => t.replace(',"copy":".guilda/transcripts/T3/a1b2c3.jsonl"', ',"copy":null') });
  const r = agentOut(p.dir, 'a1b2c3');
  assert.equal(r.status, 0, r.stderr);
  const last = r.stdout.trimEnd().split('\n').pop();
  assert.equal(last, `transcript: ${TRANSCRIPT_PATH}`);
  assert.ok(!r.stdout.includes('copy'));
});

test('no git repository: commits not measured', () => {
  const p = agentProject({ git: false });
  const r = agentOut(p.dir, 'T3-exe-7f2a');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.split('\n').includes('commits: not measured'), r.stdout);
});

test('status --agent reads the audit lines that the hooks of T7 wrote', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
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
  const sub = { session_id: 's1', cwd: dir, agent_id: 'a1', agent_type: 'guilda:executor' };
  const calls = [['Write', { file_path: path.join(dir, 'src', 'a.js'), content: 'x' }], ['Bash', { command: 'node a.js' }]];
  for (const [tool, input] of calls) {
    const h = runHook('scripts/hooks/agent-trace.mjs', { ...sub, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: input, tool_response: {} }, dir);
    assert.equal(h.code, 0, h.stderr);
  }
  const transcript = path.join(REPO_ROOT, 'tests', 'fixtures', 'transcripts', 'two-lines.jsonl');
  const e = runHook('scripts/hooks/agent-end.mjs', { ...sub, hook_event_name: 'SubagentStop', stop_hook_active: false, agent_transcript_path: transcript, last_assistant_message: 'Status: done' }, dir);
  assert.equal(e.code, 0, e.stderr);
  const lines = run(STATUS, [dir, '--agent', 'a1']).stdout.split('\n');
  assert.equal(lines[0], `agent: ${address} (executor, claude, in session, agent a1)`);
  assert.equal(lines[1], 'task: T1 — A; attempt 1; state running');
  assert.ok(lines.includes('audit: 2 tool calls; files: src/a.js'), lines.join('\n'));
  assert.ok(lines.includes(`transcript: ${transcript} (copy: .guilda/transcripts/T1/a1.jsonl)`), lines.join('\n'));
});
