import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';
import { writeSignal } from '../scripts/lib/queue.mjs';

const SCRIPT = 'scripts/hooks/agent-end.mjs';
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'transcripts');
const TWO_LINES = path.join(FIXTURES, 'two-lines.jsonl');
const BAD_LINE = path.join(FIXTURES, 'bad-line.jsonl');
const MODEL = 'claude-sonnet-5-5';
const S21_SUMS = { input: 30, cacheRead: 300, cacheCreation: 5, output: 10 };

function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'));
  return dir;
}

const audit = (dir) => path.join(dir, '.guilda', 'audit.jsonl');
const auditLines = (dir) =>
  fs.existsSync(audit(dir)) ? fs.readFileSync(audit(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const agentDir = (dir, id) => path.join(dir, '.guilda', 'queue', 'signals', 'agents', id);
const bindT3 = (dir) =>
  writeSignal(dir, { agentId: 'a1' }, 'dispatch.json', { address: 'T3-exe-7f2a', task: 'T3', attempt: 1, at: new Date().toISOString() });

function end(dir, extra = {}) {
  return runHook(SCRIPT, {
    session_id: 's1',
    cwd: dir,
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_id: 'a1',
    agent_type: 'guilda:executor',
    agent_transcript_path: TWO_LINES,
    last_assistant_message: 'Status: done',
    ...extra,
  }, dir);
}

function checkTokens(dir, task, copy) {
  const lines = auditLines(dir);
  const ends = lines.filter((l) => l.kind === 'end');
  assert.equal(ends.length, 1);
  assert.deepEqual(ends[0], { kind: 'end', t: ends[0].t, agentId: 'a1', agentType: 'guilda:executor', task, transcript: TWO_LINES, copy });
  const tokens = lines.filter((l) => l.kind === 'tokens');
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0], { kind: 'tokens', t: tokens[0].t, agentId: 'a1', task, model: MODEL, ...S21_SUMS });
  assert.equal(lines.filter((l) => l.kind === 'verdict').length, 0);
  const done = JSON.parse(fs.readFileSync(path.join(agentDir(dir, 'a1'), 'done'), 'utf8'));
  assert.equal(done.reason, 'finished');
  assert.ok(!Number.isNaN(Date.parse(done.at)));
  assert.deepEqual(done.usage, [{ model: MODEL, ...S21_SUMS }]);
  assert.equal(fs.existsSync(path.join(agentDir(dir, 'a1'), 'failed')), false);
}

test('the end of an agent records its tokens (S21, three cases)', async (t) => {
  await t.test('a background dispatch for T3', () => {
    const dir = project();
    bindT3(dir);
    const r = end(dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
    checkTokens(dir, 'T3', '.guilda/transcripts/T3/a1.jsonl');
  });
  await t.test('the copy is on (DU3 a)', () => {
    const dir = project();
    bindT3(dir);
    assert.equal(end(dir).code, 0);
    const copy = path.join(dir, '.guilda', 'transcripts', 'T3', 'a1.jsonl');
    assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(TWO_LINES));
    assert.equal(auditLines(dir).find((l) => l.kind === 'end').copy, '.guilda/transcripts/T3/a1.jsonl');
    const ignore = fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').split('\n');
    assert.ok(ignore.includes('audit.jsonl'));
    assert.ok(ignore.includes('transcripts/'));
  });
  await t.test('a foreground agent with no dispatch.json', () => {
    const dir = project();
    assert.equal(end(dir).code, 0);
    checkTokens(dir, null, '.guilda/transcripts/none/a1.jsonl');
    assert.deepEqual(fs.readFileSync(path.join(dir, '.guilda', 'transcripts', 'none', 'a1.jsonl')), fs.readFileSync(TWO_LINES));
  });
});

test('a bad transcript line is skipped', () => {
  const dir = project();
  const r = end(dir, { agent_transcript_path: BAD_LINE });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const tokens = auditLines(dir).filter((l) => l.kind === 'tokens').map(({ model, input, cacheRead, cacheCreation, output }) =>
    ({ model, input, cacheRead, cacheCreation, output }));
  const expected = [
    { model: MODEL, input: 30, cacheRead: 300, cacheCreation: 5, output: 10 },
    { model: 'claude-haiku-5-5', input: 1, cacheRead: 3, cacheCreation: 2, output: 4 },
  ];
  assert.deepEqual(tokens, expected);
  const done = JSON.parse(fs.readFileSync(path.join(agentDir(dir, 'a1'), 'done'), 'utf8'));
  assert.deepEqual(done.usage, expected);
});

test('a missing transcript gives usage null and no tokens line', () => {
  const dir = project();
  const r = end(dir, { agent_transcript_path: path.join(dir, 'no-such.jsonl') });
  assert.equal(r.code, 0);
  const lines = auditLines(dir);
  assert.deepEqual(lines.map((l) => l.kind), ['end']);
  assert.equal(lines[0].copy, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(agentDir(dir, 'a1'), 'done'), 'utf8')).usage, null);
});

test('a reviewer end writes a verdict line', () => {
  const reply = 'Some prose. Result: maybe\n\nResult: APPROVED\nStage: code\nViolations: none\n';
  const dir = project();
  bindT3(dir);
  assert.equal(end(dir, { agent_type: 'guilda:reviewer', last_assistant_message: reply }).code, 0);
  const verdicts = auditLines(dir).filter((l) => l.kind === 'verdict');
  assert.equal(verdicts.length, 1);
  assert.deepEqual(verdicts[0], { kind: 'verdict', t: verdicts[0].t, agentId: 'a1', task: 'T3', result: 'APPROVED', stage: 'code' });

  for (const type of ['guilda:security', 'guilda:qa']) {
    const d = project();
    end(d, { agent_type: type, last_assistant_message: 'Result: REJECTED-SMALL\nViolations: R6' });
    const v = auditLines(d).filter((l) => l.kind === 'verdict');
    assert.deepEqual(v.map((l) => [l.result, l.stage, l.task]), [['REJECTED-SMALL', null, null]], type);
  }
  for (const type of ['guilda:executor', 'general-purpose']) {
    const d = project();
    end(d, { agent_type: type, last_assistant_message: reply });
    assert.equal(auditLines(d).filter((l) => l.kind === 'verdict').length, 0, type);
  }
  const text = fs.readFileSync(audit(dir), 'utf8');
  assert.ok(!text.includes('Some prose'));
});

test('no .guilda folder or no agent ID: nothing; a second end keeps the first done signal', () => {
  const bare = tempProject();
  assert.equal(end(bare).code, 0);
  assert.deepEqual(fs.readdirSync(bare), []);

  const dir = project();
  assert.equal(end(dir, { agent_id: undefined }).code, 0);
  assert.equal(end(dir, { agent_id: 'a/b' }).code, 0);
  assert.equal(fs.existsSync(audit(dir)), false);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda', 'queue')), []);

  assert.equal(end(dir).code, 0);
  const first = fs.readFileSync(path.join(agentDir(dir, 'a1'), 'done'), 'utf8');
  const r = end(dir);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(fs.readFileSync(path.join(agentDir(dir, 'a1'), 'done'), 'utf8'), first);
});

test('after the done signal, queue sync moves the task to review', () => {
  const dir = project();
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'queue'))) {
    fs.copyFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'queue', f), path.join(dir, f));
  }
  const q = (...args) => {
    const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'queue.mjs'), dir, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    return r.stdout;
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'queue', 'state.json'), 'utf8')).tasks.T1;
  q('init', 'simple.plan.md', '--slots', '1');
  q('sync');
  const out = q('dispatch', 'T1', '--role', 'exe', '--tool', 'claude', '--tier', 'journeyman');
  const address = out.split('\n')[0].match(/address (\S+)$/)[1];
  writeSignal(dir, { agentId: 'a1' }, 'dispatch.json', { address, task: 'T1', attempt: 1, at: new Date().toISOString() });
  const start = runHook('scripts/hooks/subagent-start.mjs', { hook_event_name: 'SubagentStart', cwd: dir, agent_id: 'a1', agent_type: 'guilda:executor' }, dir);
  assert.equal(start.code, 0);
  q('sync');
  assert.equal(state().state, 'running');
  assert.equal(end(dir).code, 0);
  q('sync');
  assert.equal(state().state, 'review');
});
