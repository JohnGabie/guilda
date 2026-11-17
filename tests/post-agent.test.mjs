import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';
import { readJournal } from '../scripts/lib/queue.mjs';

const HOOK = 'scripts/hooks/post-agent.mjs';
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'queue');
const T0 = Date.parse('2026-11-17T10:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const ADDRESS_OF = /address (\S+)$/;

/** A temp project with a .guilda folder and the queue fixture plans. */
function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const f of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
  return dir;
}

function q(dir, min, ...args) {
  const r = spawnSync(process.execPath, [QUEUE, dir, ...args, '--now', at(min)], { encoding: 'utf8' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out);
  return out;
}

const addressOf = (out) => out.trim().split('\n')[0].match(ADDRESS_OF)[1];
const qdir = (dir) => path.join(dir, '.guilda', 'queue');
const journalBytes = (dir) => fs.readFileSync(path.join(qdir(dir), 'journal.jsonl'));
const dispatchFile = (dir, agentId) => path.join(qdir(dir), 'signals', 'agents', agentId, 'dispatch.json');

/** A project with T3 dispatched in attempt 1. Returns { dir, address }. */
function dispatched() {
  const dir = project();
  q(dir, 0, 'init', 'check.plan.md', '--slots', '1');
  q(dir, 0, 'sync');
  const address = addressOf(q(dir, 0, 'dispatch', 'T3', '--role', 'exe', '--tool', 'claude', '--tier', 'master'));
  return { dir, address };
}

/** A PostToolUse input of an Agent call, in the shape of the L2 lab (I1). */
function agentInput(dir, prompt, agentId) {
  const toolResponse = { status: 'async_launched', isAsync: true, agentType: 'guilda:executor', canContinueAgent: true };
  if (agentId !== undefined) toolResponse.agentId = agentId;
  return {
    session_id: 's-1',
    cwd: dir,
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'T3', prompt, subagent_type: 'guilda:executor', run_in_background: true },
    tool_response: toolResponse,
    tool_use_id: 'toolu_1',
  };
}

/** Every file path below dir, relative, sorted. */
function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(path.relative(dir, p));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

function assertSilent(r) {
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
}

test('the identity hook writes a signal file, not the journal', () => {
  const { dir, address } = dispatched();
  const before = journalBytes(dir);
  const stateBefore = fs.readFileSync(path.join(qdir(dir), 'state.json'));
  const prompt = `ID / title: T3 — C\nAddress: ${address}\nGoal: g\n`;
  const r = runHook(HOOK, agentInput(dir, prompt, 'a1b2c3'), dir);
  assertSilent(r);

  const d = JSON.parse(fs.readFileSync(dispatchFile(dir, 'a1b2c3'), 'utf8'));
  assert.equal(d.address, address);
  assert.equal(d.task, 'T3');
  assert.equal(d.attempt, 1);
  assert.ok(!Number.isNaN(Date.parse(d.at)), 'at is an ISO time');
  assert.deepEqual(Object.keys(d).sort(), ['address', 'at', 'attempt', 'task']);
  assert.deepEqual(journalBytes(dir), before, 'the journal has the same bytes');
  assert.deepEqual(fs.readFileSync(path.join(qdir(dir), 'state.json')), stateBefore, 'state.json is not written');

  // A second call does not change an existing dispatch.json.
  const text = fs.readFileSync(dispatchFile(dir, 'a1b2c3'), 'utf8');
  assertSilent(runHook(HOOK, agentInput(dir, prompt, 'a1b2c3'), dir));
  assert.equal(fs.readFileSync(dispatchFile(dir, 'a1b2c3'), 'utf8'), text);

  q(dir, 1, 'sync');
  const agents = readJournal(dir).events.filter((e) => e.type === 'agent');
  assert.equal(agents.length, 1);
  assert.equal(agents[0].agentId, 'a1b2c3');
  assert.equal(agents[0].address, address);
  assert.equal(agents[0].task, 'T3');
});

test('no Address line writes nothing, also with an ID / title line', () => {
  const { dir, address } = dispatched();
  const before = tree(dir);
  const cases = [
    'ID / title: T3 — C\nGoal: g\n',
    `ID / title: ${address}\n`,
    `Address:${address}\n`,
    `  Address: ${address}\n`,
    `Address: ${address} extra\n`,
    'Address: T3-exe-zzzz\n',
    'Address: ../../x\n',
  ];
  for (const prompt of cases) assertSilent(runHook(HOOK, agentInput(dir, prompt, 'a1b2c3'), dir));
  // A valid line but no agent ID, or a prompt that is not text.
  assertSilent(runHook(HOOK, agentInput(dir, `Address: ${address}\n`), dir));
  const noPrompt = agentInput(dir, `Address: ${address}\n`, 'a1b2c3');
  noPrompt.tool_input.prompt = 42;
  assertSilent(runHook(HOOK, noPrompt, dir));
  const noResponse = agentInput(dir, `Address: ${address}\n`, 'a1b2c3');
  noResponse.tool_response = 'a1b2c3';
  assertSilent(runHook(HOOK, noResponse, dir));
  assertSilent(runHook(HOOK, {}, dir));
  assert.deepEqual(tree(dir), before);
});

test('no .guilda folder or no queue folder writes nothing', () => {
  const plain = tempProject();
  assertSilent(runHook(HOOK, agentInput(plain, 'Address: T3-exe-7f2a\n', 'a1b2c3'), plain));
  assert.deepEqual(tree(plain), []);

  const noQueue = project();
  const before = tree(noQueue);
  assertSilent(runHook(HOOK, agentInput(noQueue, 'Address: T3-exe-7f2a\n', 'a1b2c3'), noQueue));
  assert.deepEqual(tree(noQueue), before);
});

test('an agent ID ../z writes nothing', () => {
  const { dir, address } = dispatched();
  const parent = path.dirname(dir);
  // The parent is the shared temp folder: parallel tests add and remove their own folders
  // there, so a full listing is racy. Check the names an escaped write would create.
  const escapes = ['z', 'x'.repeat(65)].map((n) => path.join(parent, n));
  const outside = () => escapes.map((p) => fs.existsSync(p));
  const outsideBefore = outside();
  const before = tree(dir);
  for (const agentId of ['../z', '..', '.', 'a/b', '', 'x'.repeat(65), 7]) {
    assertSilent(runHook(HOOK, agentInput(dir, `Address: ${address}\n`, agentId), dir));
  }
  assert.deepEqual(tree(dir), before);
  assert.deepEqual(outside(), outsideBefore, 'no file outside the project');
});

test('a check run address binds its task', () => {
  const { dir, address: work } = dispatched();
  runHook(HOOK, agentInput(dir, `Address: ${work}\n`, 'a0'), dir);
  fs.mkdirSync(path.join(qdir(dir), 'signals', 'agents', 'a0'), { recursive: true });
  fs.writeFileSync(path.join(qdir(dir), 'signals', 'agents', 'a0', 'started'), `${JSON.stringify({ at: at(0.5) })}\n`);
  fs.writeFileSync(
    path.join(qdir(dir), 'signals', 'agents', 'a0', 'done'),
    `${JSON.stringify({ at: at(0.8), reason: 'finished', usage: null })}\n`,
  );
  q(dir, 1, 'sync');
  const out = q(dir, 2, 'dispatch', 'T3', '--check', '--role', 'rev', '--tool', 'claude', '--tier', 'master');
  assert.match(out, /^dispatched T3 attempt 1 address T3-rev-[0-9a-f]{4}\n/);
  const address = addressOf(out);

  const before = journalBytes(dir);
  assertSilent(runHook(HOOK, agentInput(dir, `Brief: x\nAddress: ${address}\n`, 'd4e5f6'), dir));
  const d = JSON.parse(fs.readFileSync(dispatchFile(dir, 'd4e5f6'), 'utf8'));
  assert.equal(d.address, address);
  assert.equal(d.task, 'T3');
  assert.equal(d.attempt, 1);
  assert.deepEqual(journalBytes(dir), before);

  q(dir, 3, 'sync');
  const agent = readJournal(dir).events.filter((e) => e.type === 'agent').at(-1);
  assert.equal(agent.address, address);
  assert.equal(agent.task, 'T3');
  assert.equal(agent.agentId, 'd4e5f6');
});

test('an unreadable state.json gives task null', () => {
  const { dir, address } = dispatched();
  // The hook reads the state with readState, which folds the journal when state.json is bad. So the state
  // cannot be read only when the journal cannot be read too.
  const state = path.join(qdir(dir), 'state.json');
  const journal = path.join(qdir(dir), 'journal.jsonl');
  fs.writeFileSync(state, '{ not json');
  fs.chmodSync(state, 0o000);
  fs.chmodSync(journal, 0o000);
  try {
    assertSilent(runHook(HOOK, agentInput(dir, `Address: ${address}\n`, 'a1b2c3'), dir));
  } finally {
    fs.chmodSync(state, 0o600);
    fs.chmodSync(journal, 0o600);
  }
  const d = JSON.parse(fs.readFileSync(dispatchFile(dir, 'a1b2c3'), 'utf8'));
  assert.equal(d.address, address);
  assert.equal(d.task, null);
  assert.equal(d.attempt, null);
  assert.ok(!Number.isNaN(Date.parse(d.at)));
  assert.equal(fs.readFileSync(state, 'utf8'), '{ not json');

  // sync fills the task from the journal.
  q(dir, 1, 'sync');
  const agent = readJournal(dir).events.filter((e) => e.type === 'agent').at(-1);
  assert.equal(agent.task, 'T3');
  assert.equal(agent.attempt, 1);
  assert.equal(agent.agentId, 'a1b2c3');
});

test('hooks.json has the PostToolUse Agent entry, and the Write|Edit entry is unchanged', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const post = hooks.PostToolUse;
  const agent = post.filter((e) => e.matcher === 'Agent');
  assert.equal(agent.length, 1);
  assert.deepEqual(agent[0], {
    matcher: 'Agent',
    hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/post-agent.mjs'] }],
  });
  assert.deepEqual(
    post.filter((e) => e.matcher === 'Write|Edit'),
    [
      {
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/post-tool-use.mjs'] }],
      },
    ],
  );
  // T7 added a third PostToolUse entry (matcher *), per spec X6.
  assert.equal(post.length, 3);
});
