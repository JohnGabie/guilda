import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const HOOK = 'scripts/hooks/pre-agent.mjs';
const BRIEF = [
  'ID / title: T1 — x', 'Goal: g', 'Context: c', 'Out of scope: o', 'Files it may touch: f',
  'Contract / interfaces: i', 'Tests that must pass: t', 'Acceptance: a', 'Suggested tier: apprentice',
  'Risk area: none', 'Deletion rules: none', 'Dependencies: none',
  'Base commit: 0123456789abcdef0123456789abcdef01234567',
].join('\n');
const BRIEF_NO_BASE = BRIEF.split('\n').filter((l) => !l.startsWith('Base commit:')).join('\n');

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
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('broken project layer: incomplete brief -> deny and one ARC6 record (S12)', () => {
  const dir = tempProject({ config: '{ not json' });
  const prompt = BRIEF.replace('Goal: g\n', '');
  const r = runHook(HOOK, dispatch('guilda:executor', prompt), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.permissionDecisionReason, 'ARC6: brief incomplete: Goal');
  assert.deepEqual(
    records(dir).map(({ rule, level, source, action }) => ({ rule, level, source, action })),
    [{ rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'incomplete brief' }],
  );
});

test('executor dispatch with incomplete brief -> deny and one ARC6 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const prompt = BRIEF.replace('Risk area: none\n', '');
  const r = runHook(HOOK, dispatch('guilda:executor', prompt), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.permissionDecisionReason, 'ARC6: brief incomplete: Risk area');
  assert.deepEqual(
    records(dir).map(({ rule, level, source, action }) => ({ rule, level, source, action })),
    [{ rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'incomplete brief' }],
  );
});

test('executor dispatch with a complete brief -> allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, dispatch('guilda:executor', BRIEF), dir);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('executor dispatch without prompt -> allow, notice on stderr, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, { tool_name: 'Agent', tool_input: { subagent_type: 'guilda:executor' } }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'guilda: brief check skipped: tool_input.prompt not found\n');
  assert.equal(records(dir).length, 0);
});

test('executor dispatch with a non-string prompt -> allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, { tool_name: 'Agent', tool_input: { subagent_type: 'guilda:executor', prompt: 42 } }, dir);
  assert.equal(r.stdout, '');
  assert.equal(r.code, 0);
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

// S22: the brief check reads a Brief file and needs Base commit (D5, U6).

function writeFile(dir, rel, text) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const fileDispatch = (subagent_type, briefPath) => dispatch(subagent_type, `Do the task.\nBrief file: ${briefPath}\n`);

function denyReason(r) {
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  return out.permissionDecisionReason;
}

const arc6 = (dir) => records(dir).map(({ rule, level, source, action }) => ({ rule, level, source, action }));

test('a brief file without Base commit -> deny with ARC6 and Base commit', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T1.md', BRIEF_NO_BASE);
  const reason = denyReason(runHook(HOOK, fileDispatch('guilda:executor', 'briefs/T1.md'), dir));
  assert.equal(reason, 'ARC6: brief incomplete: Base commit');
  assert.deepEqual(arc6(dir), [{ rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'incomplete brief' }]);
});

test('the same brief file with the field -> allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T1.md', BRIEF);
  const r = runHook(HOOK, fileDispatch('guilda:executor', 'briefs/T1.md'), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('another agent type with a Role: executor line -> the same check', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T1.md', BRIEF_NO_BASE);
  const prompt = 'Role: executor\nBrief file: briefs/T1.md\n';
  const reason = denyReason(runHook(HOOK, dispatch('general-purpose', prompt), dir));
  assert.equal(reason, 'ARC6: brief incomplete: Base commit');
  writeFile(dir, 'briefs/T2.md', BRIEF);
  const r = runHook(HOOK, dispatch('general-purpose', 'Role: executor\nBrief file: briefs/T2.md\n'), dir);
  assert.equal(r.stdout, '');
  const inline = denyReason(runHook(HOOK, dispatch('general-purpose', `Role: executor\n${BRIEF_NO_BASE}`), dir));
  assert.equal(inline, 'ARC6: brief incomplete: Base commit');
});

test('a relative Brief file resolves from the project root', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T1.md', BRIEF);
  // The same relative path from the sub folder holds a brief without Base commit.
  writeFile(dir, 'sub/briefs/T1.md', BRIEF_NO_BASE);
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, HOOK)], {
    input: JSON.stringify(fileDispatch('guilda:executor', 'briefs/T1.md')),
    encoding: 'utf8',
    cwd: path.join(dir, 'sub'),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('a brief file that does not exist -> deny with ARC6 and the path', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const reason = denyReason(runHook(HOOK, fileDispatch('guilda:executor', 'briefs/none.md'), dir));
  assert.equal(reason, 'ARC6: brief file not found: briefs/none.md');
  assert.deepEqual(arc6(dir), [{ rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'brief file refused' }]);
});

test('../other/brief.md -> deny with "outside the project"', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test '));
  const dir = path.join(parent, 'project');
  fs.mkdirSync(path.join(dir, '.guilda'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), JSON.stringify(MINIMAL_CONFIG));
  writeFile(parent, 'other/brief.md', BRIEF);
  const reason = denyReason(runHook(HOOK, fileDispatch('guilda:executor', '../other/brief.md'), dir));
  assert.equal(reason, 'ARC6: brief file outside the project: ../other/brief.md');
  assert.deepEqual(arc6(dir), [{ rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'brief file refused' }]);
});

test('an absolute path of another folder -> deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const other = tempProject();
  const file = writeFile(other, 'brief.md', BRIEF);
  const reason = denyReason(runHook(HOOK, fileDispatch('guilda:executor', file), dir));
  assert.equal(reason, `ARC6: brief file outside the project: ${file}`);
});

test('a symbolic link to a file outside the project -> deny', (t) => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const other = tempProject();
  const target = writeFile(other, 'brief.md', BRIEF);
  try {
    fs.symlinkSync(target, path.join(dir, 'link.md'));
  } catch {
    t.skip('this platform cannot make a symbolic link');
    return;
  }
  const reason = denyReason(runHook(HOOK, fileDispatch('guilda:executor', 'link.md'), dir));
  assert.equal(reason, 'ARC6: brief file outside the project: link.md');
});

test('an inline brief without Base commit -> deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const reason = denyReason(runHook(HOOK, dispatch('guilda:executor', BRIEF_NO_BASE), dir));
  assert.equal(reason, 'ARC6: brief incomplete: Base commit');
});

test('each deny adds one ARC6 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T1.md', BRIEF_NO_BASE);
  const other = tempProject();
  const outside = writeFile(other, 'brief.md', BRIEF);
  const prompts = [
    BRIEF_NO_BASE,
    'Brief file: briefs/T1.md',
    'Brief file: briefs/none.md',
    `Brief file: ${outside}`,
  ];
  for (const prompt of prompts) denyReason(runHook(HOOK, dispatch('guilda:executor', prompt), dir));
  assert.deepEqual(arc6(dir).map((r) => r.action), [
    'incomplete brief', 'incomplete brief', 'brief file refused', 'brief file refused',
  ]);
  for (const r of arc6(dir)) assert.equal(r.rule, 'ARC6');
  const text = fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8');
  assert.ok(!text.includes('briefs/'), 'a record never has the path');
  assert.ok(!text.includes(path.basename(other)), 'a record never has the path');
});

test('no .guilda folder -> allow, no record', () => {
  const dir = tempProject();
  const r = runHook(HOOK, fileDispatch('guilda:executor', 'briefs/none.md'), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});
