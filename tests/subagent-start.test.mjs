import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/subagent-start.mjs';
const run = (dir) => runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir }, dir);

test('without config: empty stdout, exit 0', () => {
  const r = run(tempProject());
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('a broken layer gives Docs language: en. Process: full.', () => {
  const r = run(tempProject({ config: '{ nope' }));
  assert.equal(r.code, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^Docs language: en\. Process: full\. Glossary: .*glossary\.md$/m);
});

test('the line has Process: full. for a 0.1.0 fixture and Process: light. for a light config (S18)', () => {
  const fixture = fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'compat', '0.1.0', 'config.json'), 'utf8');
  const ctx = (config) => JSON.parse(run(tempProject({ config })).stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx(fixture), /^Docs language: en\. Process: full\. Glossary: /m);
  assert.match(ctx({ ...MINIMAL_CONFIG, process: 'light' }), /^Docs language: en\. Process: light\. Glossary: /m);
});

test('with config: context has R5, the docs language and the glossary path', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, languages: { replies: 'pt', docs: 'de' } } });
  const out = JSON.parse(run(dir).stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SubagentStart');
  assert.match(out.additionalContext, /R5/);
  assert.match(out.additionalContext, /docs language: de/i);
  assert.match(out.additionalContext, /glossary\.md/);
  const n = out.additionalContext.split('\n').filter((l) => l.trim()).length;
  assert.ok(n <= 60 + 3, `got ${n}`);
});

const agentsDir = (dir) => path.join(dir, '.guilda', 'queue', 'signals', 'agents');
const withQueue = () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'));
  return dir;
};
const start = (dir, extra) =>
  runHook(SCRIPT, { session_id: 's1', hook_event_name: 'SubagentStart', cwd: dir, agent_type: 'guilda:executor', ...extra }, dir);

test('started signal (S42)', () => {
  const dir = withQueue();
  const before = Date.now();
  const r = start(dir, { agent_id: 'a1' });
  assert.equal(r.code, 0);
  const body = JSON.parse(fs.readFileSync(path.join(agentsDir(dir), 'a1', 'started'), 'utf8'));
  assert.deepEqual(Object.keys(body), ['at']);
  assert.ok(Date.parse(body.at) >= before - 1 && Date.parse(body.at) <= Date.now() + 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda', 'queue')), ['signals']);

  assert.equal(start(dir, {}).code, 0);
  assert.equal(start(dir, { agent_id: '../x' }).code, 0);
  assert.deepEqual(fs.readdirSync(agentsDir(dir)), ['a1']);

  const noQueue = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(start(noQueue, { agent_id: 'a1' }).code, 0);
  assert.equal(fs.existsSync(path.join(noQueue, '.guilda', 'queue')), false);
});

test('the context output does not change', () => {
  const plain = tempProject({ config: MINIMAL_CONFIG });
  const queued = withQueue();
  const a = run(plain);
  const b = start(queued, { agent_id: 'a1' });
  const c = start(queued, { agent_id: 'a1' });
  assert.equal(b.code, 0);
  assert.equal(c.code, 0);
  assert.equal(c.stderr, '');
  assert.ok(a.stdout.length > 0);
  assert.equal(c.stdout, b.stdout);
  const ctx = (o) => JSON.parse(o).hookSpecificOutput.additionalContext;
  assert.equal(ctx(b.stdout), `${ctx(a.stdout)}\nYour agent ID: a1`);
});

const ctxOf = (input, dir) => JSON.parse(runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir, ...input }, dir).stdout).hookSpecificOutput.additionalContext;

test('the agent ID line is added for a valid agent_id', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const lines = ctxOf({ agent_id: 'agent-ab12.C:d_3' }, dir).split('\n');
  const i = lines.findIndex((l) => l.startsWith('Docs language:'));
  assert.equal(lines[i + 1], 'Your agent ID: agent-ab12.C:d_3');
});

test('a bad or missing agent_id adds no line', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const id of [undefined, '', 42, null, 'a b', 'x\ny', 'a'.repeat(129), '../x/']) {
    const r = runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir, agent_id: id }, dir);
    assert.equal(r.code, 0);
    assert.doesNotMatch(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Your agent ID/);
  }
});

test('with no project layer the hook prints nothing even with an agent_id', () => {
  const dir = tempProject();
  const r = runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir, agent_id: 'abc' }, dir);
  assert.equal(r.stdout, '');
});
