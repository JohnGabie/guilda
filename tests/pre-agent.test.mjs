import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const HOOK = 'scripts/hooks/pre-agent.mjs';
const BRIEF = [
  'ID / title: T1 — x', 'Goal: g', 'Context: c', 'Out of scope: o', 'Files it may touch: f',
  'Contract / interfaces: i', 'Tests that must pass: t', 'Acceptance: a', 'Suggested tier: apprentice',
  'Risk area: none', 'Deletion rules: none', 'Dependencies: none',
].join('\n');

const dispatch = (subagent_type, prompt) => ({
  tool_name: 'Agent',
  tool_input: { subagent_type, prompt },
});

function records(dir) {
  const file = path.join(dir, '.guilda', 'violations.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('no config -> allow, no output', () => {
  const dir = tempProject();
  const r = runHook(HOOK, dispatch('guilda:executor', 'no brief'), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('invalid config -> silent allow', () => {
  const dir = tempProject({ config: '{ nope' });
  const r = runHook(HOOK, dispatch('guilda:executor', 'no brief'), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('executor dispatch with incomplete brief -> deny and one R3 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const prompt = BRIEF.replace('Risk area: none\n', '');
  const r = runHook(HOOK, dispatch('guilda:executor', prompt), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.permissionDecisionReason, 'R3: brief incomplete: Risk area');
  assert.deepEqual(
    records(dir).map(({ rule, level, source, action }) => ({ rule, level, source, action })),
    [{ rule: 'R3', level: 'law', source: 'pre-agent', action: 'incomplete brief' }],
  );
});

test('executor dispatch with a complete brief -> allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, dispatch('guilda:executor', BRIEF), dir);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('executor dispatch with a missing prompt -> deny (all fields missing)', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, { tool_name: 'Agent', tool_input: { subagent_type: 'guilda:executor' } }, dir);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('dispatch of another agent type -> allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, dispatch('guilda:reviewer', 'no brief'), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('hooks.json registers PreToolUse for Agent in exec form', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = hooks.PreToolUse.find((e) => e.matcher === 'Agent');
  assert.ok(entry);
  assert.equal(entry.hooks[0].command, 'node');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-agent.mjs']);
});
