import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';
import { writeSignal, DEFAULT_TOOL_TIMEOUT_MS } from '../scripts/lib/queue.mjs';

const SCRIPT = 'scripts/hooks/agent-trace.mjs';
const MAX_VALUE = 200;
const LONG_VALUE = 300;
const HEARTBEAT_GAP_MS = 2000;

/** A temp project with a .guilda folder and a .guilda/queue folder. */
function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'));
  return dir;
}

const audit = (dir) => path.join(dir, '.guilda', 'audit.jsonl');
const auditLines = (dir) =>
  fs.existsSync(audit(dir)) ? fs.readFileSync(audit(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const agentDir = (dir, id) => path.join(dir, '.guilda', 'queue', 'signals', 'agents', id);

function post(dir, toolName, toolInput, extra = {}) {
  return runHook(SCRIPT, {
    session_id: 's1',
    cwd: dir,
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: { output: 'TOOL-OUTPUT-SECRET' },
    ...extra,
  }, dir);
}

function pre(dir, toolName, toolInput, extra = {}) {
  return runHook(SCRIPT, { session_id: 's1', cwd: dir, hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, ...extra }, dir);
}

const sub = { agent_id: 'a1', agent_type: 'guilda:executor' };

test('the audit line keeps no secret (S20)', () => {
  const dir = project();
  writeSignal(dir, { agentId: 'a1' }, 'dispatch.json', { address: 'T3-exe-7f2a', task: 'T3', attempt: 1, at: new Date().toISOString() });
  const outsideFile = path.join(os.tmpdir(), 'elsewhere', 'x.js');
  const results = [
    post(dir, 'Bash', { command: 'API_KEY=abc123 curl https://example.test' }, sub),
    post(dir, 'Write', { file_path: path.join(dir, 'src', 'login.js'), content: 'const pw = "hunter2";' }, sub),
    post(dir, 'Write', { file_path: outsideFile, content: 'const pw = "hunter2";' }, sub),
    post(dir, 'Bash', { command: 'API_KEY=abc123 curl https://example.test' }),
  ];
  for (const r of results) {
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  const lines = auditLines(dir);
  assert.equal(lines.length, 3);
  for (const l of lines) {
    assert.equal(l.kind, 'tool');
    assert.equal(l.agentId, 'a1');
    assert.equal(l.agentType, 'guilda:executor');
    assert.equal(l.task, 'T3');
    assert.equal(l.session, 's1');
    assert.ok(!Number.isNaN(Date.parse(l.t)));
    assert.deepEqual(Object.keys(l).sort(), ['agentId', 'agentType', 'kind', 'session', 't', 'target', 'task', 'tool']);
  }
  assert.deepEqual(lines.map((l) => [l.tool, l.target]), [['Bash', 'curl'], ['Write', 'src/login.js'], ['Write', 'outside']]);
  const text = fs.readFileSync(audit(dir), 'utf8');
  for (const secret of ['abc123', 'example.test', 'hunter2', 'TOOL-OUTPUT-SECRET', 'elsewhere']) {
    assert.ok(!text.includes(secret), secret);
  }
});

test('the Bash target skips NAME=value, cd <dir> && and timeout <n>; another tool has no target', () => {
  const dir = project();
  const cases = [
    ['cd sub/dir && A=1 B="x y" timeout 30 npm test', 'npm'],
    ["TOKEN='a b c' node script.mjs --key=zzz", 'node'],
    ['timeout -s KILL 5 git status', 'git'],
    ['git commit -m "msg"', 'git'],
  ];
  for (const [command] of cases) post(dir, 'Bash', { command }, sub);
  post(dir, 'Read', { file_path: path.join(dir, 'a.txt') }, sub);
  post(dir, 'Edit', { file_path: 'rel/b.js', old_string: 'q', new_string: 'r' }, sub);
  post(dir, 'NotebookEdit', { notebook_path: path.join(dir, 'n.ipynb'), new_source: 'x' }, sub);
  const lines = auditLines(dir);
  assert.deepEqual(lines.map((l) => l.target), [...cases.map((c) => c[1]), null, 'rel/b.js', 'n.ipynb']);
  assert.equal(lines[0].task, null);
  const text = fs.readFileSync(audit(dir), 'utf8');
  for (const secret of ['a b c', 'zzz', 'x y', 'msg']) assert.ok(!text.includes(secret), secret);
});

test('heartbeat (S42)', async () => {
  const dir = project();
  const r1 = pre(dir, 'Bash', { command: 'sleep 1', timeout: 120000 }, sub);
  const hb = path.join(agentDir(dir, 'a1'), 'heartbeat');
  const first = JSON.parse(fs.readFileSync(hb, 'utf8'));
  assert.equal(first.tokens, null);
  assert.equal(Date.parse(first.busyUntil) - Date.parse(first.at), 120000);
  await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_GAP_MS));
  const before = Date.now();
  const r2 = pre(dir, 'Read', { file_path: 'x' }, sub);
  const after = Date.now();
  const second = JSON.parse(fs.readFileSync(hb, 'utf8'));
  assert.ok(Date.parse(second.at) >= before - 1 && Date.parse(second.at) <= after + 1, second.at);
  assert.ok(Date.parse(second.at) - Date.parse(first.at) >= HEARTBEAT_GAP_MS - 100);
  assert.equal(Date.parse(second.busyUntil) - Date.parse(second.at), DEFAULT_TOOL_TIMEOUT_MS);
  assert.deepEqual(Object.keys(second).sort(), ['at', 'busyUntil', 'tokens']);

  const r3 = pre(dir, 'Bash', { command: 'ls' }, { agent_id: undefined });
  for (const r of [r1, r2, r3]) {
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda', 'queue', 'signals', 'agents')), ['a1']);
  assert.deepEqual(fs.readdirSync(agentDir(dir, 'a1')), ['heartbeat']);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda', 'queue')), ['signals']);
  assert.equal(fs.existsSync(audit(dir)), false);
});

test('no .guilda folder, no queue folder or a bad agent ID: nothing is written', () => {
  const bare = tempProject();
  assert.equal(pre(bare, 'Bash', { command: 'ls' }, sub).code, 0);
  assert.equal(post(bare, 'Bash', { command: 'ls' }, sub).code, 0);
  assert.deepEqual(fs.readdirSync(bare), []);

  const noQueue = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(pre(noQueue, 'Bash', { command: 'ls' }, sub).code, 0);
  assert.equal(fs.existsSync(path.join(noQueue, '.guilda', 'queue')), false);

  const dir = project();
  assert.equal(pre(dir, 'Bash', { command: 'ls' }, { agent_id: '../x' }).code, 0);
  assert.equal(post(dir, 'Bash', { command: 'ls' }, { agent_id: '../x' }).code, 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.guilda', 'queue')), []);
  assert.equal(fs.existsSync(audit(dir)), false);
});

test('a value of 300 characters is cut at 200', () => {
  const dir = project();
  const longName = 'f'.repeat(LONG_VALUE);
  const longType = 't'.repeat(LONG_VALUE);
  const r = post(dir, 'Write', { file_path: path.join(dir, longName), content: 'x' }, { agent_id: 'a1', agent_type: longType });
  assert.equal(r.code, 0);
  const text = fs.readFileSync(audit(dir), 'utf8');
  assert.equal(text.split('\n').filter(Boolean).length, 1);
  assert.ok(Buffer.byteLength(text) < 4096);
  const [line] = auditLines(dir);
  assert.equal(line.target, 'f'.repeat(MAX_VALUE));
  assert.equal(line.agentType, 't'.repeat(MAX_VALUE));
});

test('a write error of the audit log exits 0', () => {
  const dir = project();
  fs.mkdirSync(audit(dir));
  const r = post(dir, 'Bash', { command: 'ls' }, sub);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.deepEqual(fs.readdirSync(audit(dir)), []);

  const linked = project();
  const target = path.join(linked, 'elsewhere.jsonl');
  fs.writeFileSync(target, '');
  fs.symlinkSync(target, audit(linked));
  assert.equal(post(linked, 'Bash', { command: 'ls' }, sub).code, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), '');
});

test('hooks.json has the 0.4.0 entries of X6 and the 0.2.0 entries unchanged', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const cmd = (file) => ({ type: 'command', command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/scripts/hooks/${file}`] });
  const entry = (matcher, file) => (matcher === null ? { hooks: [cmd(file)] } : { matcher, hooks: [cmd(file)] });
  assert.deepEqual(hooks.PreToolUse, [
    entry('Bash|Write|Edit|Read|Grep|Glob', 'pre-tool-use.mjs'),
    entry('Write|Edit|MultiEdit|NotebookEdit', 'pre-architect-write.mjs'),
    entry('Agent', 'pre-agent.mjs'),
    entry('Skill', 'pre-skill.mjs'),
    entry('*', 'agent-trace.mjs'),
    entry('Bash', 'pre-rm.mjs'),
    entry('AskUserQuestion', 'pre-question.mjs'),
  ]);
  assert.deepEqual(hooks.PostToolUse, [
    entry('Write|Edit|AskUserQuestion|SendMessage', 'post-tool-use.mjs'),
    entry('Agent', 'post-agent.mjs'),
    entry('*', 'agent-trace.mjs'),
  ]);
  assert.deepEqual(hooks.SubagentStop, [
    entry('^guilda:(reviewer|security|qa)$', 'subagent-stop.mjs'),
    entry(null, 'agent-end.mjs'),
  ]);
  assert.deepEqual(hooks.SubagentStart, [entry(null, 'subagent-start.mjs')]);
  assert.deepEqual(hooks.SessionStart, [entry('startup|resume|clear|compact', 'session-start.mjs')]);
  assert.deepEqual(hooks.PreCompact, [entry('manual|auto', 'pre-compact.mjs')]);
  assert.deepEqual(hooks.UserPromptSubmit, [entry(null, 'user-prompt-submit.mjs')]);
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreCompact', 'PreToolUse', 'SessionStart', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit']);
});
