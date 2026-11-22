import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
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

test('S41: no .guilda folder and guilda:executor: systemMessage is the R28 notice, no deny, no record, no folder', () => {
  const dir = tempProject();
  const r = runHook(HOOK, dispatch('guilda:executor', 'no brief'), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.systemMessage, SETUP_NOTICE);
  assert.equal(out.hookSpecificOutput, undefined);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('no .guilda folder and another agent type: empty stdout', () => {
  const dir = tempProject();
  for (const type of ['general-purpose', undefined]) {
    const r = runHook(HOOK, dispatch(type, 'x'), dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
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

test('a subagent dispatch of another agent type with a Role: executor line -> the same check', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const sub = (prompt) => ({ ...dispatch('general-purpose', prompt), agent_type: 'guilda:executor' });
  writeFile(dir, 'briefs/T1.md', BRIEF_NO_BASE);
  const reason = denyReason(runHook(HOOK, sub('Role: executor\nBrief file: briefs/T1.md\n'), dir));
  assert.equal(reason, 'ARC6: brief incomplete: Base commit');
  writeFile(dir, 'briefs/T2.md', BRIEF);
  const r = runHook(HOOK, sub('Role: executor\nBrief file: briefs/T2.md\n'), dir);
  assert.equal(r.stdout, '');
  const inline = denyReason(runHook(HOOK, sub(`Role: executor\n${BRIEF_NO_BASE}`), dir));
  assert.equal(inline, 'ARC6: brief incomplete: Base commit');
});

test('a general-purpose dispatch of the main session with a Role: executor line and a full brief is refused (ARC4)', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeFile(dir, 'briefs/T2.md', BRIEF);
  const reason = denyReason(runHook(HOOK, dispatch('general-purpose', 'Role: executor\nBrief file: briefs/T2.md\n'), dir));
  assert.match(reason, /^ARC4:/);
  assert.match(reason, /guilda:executor/);
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
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput, undefined);
  assert.equal(JSON.parse(r.stdout).systemMessage, SETUP_NOTICE);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

// ARC4 (T28): the main session dispatches a guilda agent, never an untyped or general-purpose one. The hook input
// has `agent_type` only inside a subagent.

const GUILDA_AGENTS = /guilda:architect-executor[\s\S]*guilda:executor[\s\S]*guilda:reviewer[\s\S]*guilda:lab-researcher/;
const arc4 = (dir) => records(dir).map(({ rule, level, source, action }) => ({ rule, level, source, action }));

test('an Agent call with no subagent_type from the main session is refused, and the text names a guilda agent', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const reason = denyReason(runHook(HOOK, { tool_name: 'Agent', tool_input: { prompt: 'secret plan text' } }, dir));
  assert.match(reason, /^ARC4: /);
  assert.match(reason, GUILDA_AGENTS);
  assert.deepEqual(arc4(dir), [{ rule: 'ARC4', level: 'law', source: 'pre-agent', action: 'untyped dispatch' }]);
  const text = fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8');
  assert.ok(!text.includes('secret plan text'), 'a record never has the prompt');
});

test('a general-purpose Agent call from the main session is refused', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const reason = denyReason(runHook(HOOK, dispatch('general-purpose', 'write the spec'), dir));
  assert.match(reason, /^ARC4: /);
  assert.match(reason, /general-purpose/);
  assert.match(reason, GUILDA_AGENTS);
  assert.deepEqual(arc4(dir), [{ rule: 'ARC4', level: 'law', source: 'pre-agent', action: 'untyped dispatch' }]);
});

test('the same call from a subagent passes', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const tool_input of [{ subagent_type: 'general-purpose', prompt: 'x' }, { prompt: 'x' }]) {
    const r = runHook(HOOK, { tool_name: 'Agent', agent_type: 'guilda:lab-experimenter', tool_input }, dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.equal(records(dir).length, 0);
});

test('Explore passes', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const type of ['Explore', 'Plan']) {
    const r = runHook(HOOK, dispatch(type, 'find the config'), dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.equal(records(dir).length, 0);
});

test('a guilda:executor call passes', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, dispatch('guilda:executor', BRIEF), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('no .guilda folder: nothing is refused', () => {
  const dir = tempProject();
  for (const tool_input of [{ prompt: 'x' }, { subagent_type: 'general-purpose', prompt: 'x' }]) {
    const r = runHook(HOOK, { tool_name: 'Agent', tool_input }, dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('ARC4: a blank, non-string or case variant of general-purpose from the main session is refused', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const subagent_type of ['   ', 123, {}, 'General-Purpose', ' general-purpose ']) {
    const r = runHook(HOOK, { tool_name: 'Agent', tool_input: { subagent_type, prompt: 'x' } }, dir);
    assert.match(denyReason(r), /^ARC4:/, String(subagent_type));
  }
});

// ARC4 (the user, 2026-11-17): guilda:*, Explore, Plan and the types of dispatch.agentTypes pass; each other type is
// refused, and the text never echoes the type.
test('ARC4: an agent type of another plugin or of the project is refused, and the text does not echo it', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const type of ['other-plugin:helper', 'my-project-agent']) {
    const reason = denyReason(runHook(HOOK, dispatch(type, 'do it'), dir));
    assert.match(reason, /^ARC4: .*dispatch\.agentTypes/);
    assert.ok(!reason.includes(type), type);
  }
  const actions = records(dir).filter((r) => r.rule === 'ARC4').map((r) => r.action);
  assert.deepEqual(actions, ['agent type not allowed', 'agent type not allowed']);
});

test('ARC4: a type listed in dispatch.agentTypes passes, in any case or spacing', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, dispatch: { agentTypes: ['My-Project-Agent'] } } });
  for (const type of ['my-project-agent', ' MY-PROJECT-AGENT ']) {
    const r = runHook(HOOK, dispatch(type, 'do it'), dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
  assert.equal(records(dir).length, 0);
});

test('ARC4: a bad dispatch.agentTypes value reads as empty, and the type is refused', () => {
  for (const dispatchValue of [{ agentTypes: 'my-project-agent' }, 'my-project-agent', { agentTypes: [7] }]) {
    const dir = tempProject({ config: { ...MINIMAL_CONFIG, dispatch: dispatchValue } });
    assert.match(denyReason(runHook(HOOK, dispatch('my-project-agent', 'do it'), dir)), /^ARC4: /);
  }
});

test('ARC4: a broken project layer reads no dispatch.agentTypes, and the type is refused', () => {
  const dir = tempProject({ config: '{ not json' });
  assert.match(denyReason(runHook(HOOK, dispatch('my-project-agent', 'do it'), dir)), /^ARC4: /);
});

test('ARC6: a case or space variant of guilda:executor still gets the brief check', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const type of ['GUILDA:EXECUTOR', ' guilda:Executor ']) {
    assert.equal(denyReason(runHook(HOOK, dispatch(type, BRIEF_NO_BASE), dir)), 'ARC6: brief incomplete: Base commit');
  }
});

// R37 (S5-18): a dispatch of the Security Executor needs a complete brief, a Risk area that is not none and an
// approval that verifies, names the task and is used one time. ARC9: each case asserts the exact reason text.
const SX_TYPE = 'guilda:security-executor';
const sxState = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-state-'));
process.env.XDG_STATE_HOME = sxState;
const sxBrief = (area, approval) =>
  BRIEF.replace('Risk area: none', `Risk area: ${area}`) + (approval === null ? '' : `\nApproval: ${approval}`);
const R37 = {
  none: 'R37: the Security Executor needs a Risk area that is not none.',
  noLine: 'R37: the brief has no `Approval: <user record ID>` line.',
  verify: 'R37: the user record of the Approval line does not verify.',
  task: 'R37: the user record does not name the task ID of the brief.',
  words: 'R37: the user record does not approve this run.',
  used: 'R37: the user record was used for an earlier run.',
  noPrompt: 'R37: the dispatch has no brief text (X9).',
  noProject: 'R37: the Security Executor needs a guilda project and a recorded approval (X9).',
};

const SANDBOX_ON = JSON.stringify({ sandbox: { enabled: true } });
const SANDBOX_TEXT =
  'R37: the project sandbox is off. The user must turn on the sandbox for the project (U5-8): set sandbox.enabled to true ' +
  'in .claude/settings.json. guilda never writes this setting.';
const NO_TASK_ID = 'R37: the brief has no task ID of the form of a queue task ID (letters and digits, one of each at least).';

/** A project with the sandbox on in its settings file. */
function sxDir(settings = SANDBOX_ON, name = 'settings.json') {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  if (settings !== null) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', name), settings);
  }
  return dir;
}

async function userRecord(dir, text = 'I approve the red team run of T1.') {
  const { writeUserRecord } = await import('../scripts/lib/records.mjs');
  const rec = writeUserRecord(dir, { session: 's1', kind: 'prompt', text }, process.env);
  assert.ok(rec, 'a user record was written');
  return rec.id;
}

function sxReason(dir, prompt, type = SX_TYPE) {
  const r = runHook(HOOK, dispatch(type, prompt), dir);
  assert.equal(r.code, 0);
  if (r.stdout === '') return null;
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  return out.permissionDecisionReason;
}

test('S5-18: Risk area none is refused, even with a good approval', async () => {
  const dir = sxDir();
  assert.equal(sxReason(dir, sxBrief('none', await userRecord(dir))), R37.none);
  assert.deepEqual(records(dir).map((r) => r.rule), ['R37']);
});

test('S5-18: no Approval line is refused', () => {
  const dir = sxDir();
  assert.equal(sxReason(dir, sxBrief('auth', null)), R37.noLine);
});

test('S5-18: an unknown record and a malformed Approval are refused', async () => {
  const dir = sxDir();
  await userRecord(dir);
  assert.equal(sxReason(dir, sxBrief('auth', 'u-00000001')), R37.verify);
  assert.equal(sxReason(dir, sxBrief('auth', 'nope')), R37.verify);
  assert.equal(sxReason(dir, sxBrief('auth', '')), R37.noLine);
});

test('S5-18: a forged record (bad mac) is refused', async () => {
  const dir = sxDir();
  const id = await userRecord(dir);
  const file = path.join(dir, '.guilda', 'bus', 'user.jsonl');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/"mac":"[0-9a-f]{4}/, '"mac":"0000'));
  assert.equal(sxReason(dir, sxBrief('auth', id)), R37.verify);
});

test('S5-18: a record that verifies, names the task and approves passes one time', async () => {
  const dir = sxDir();
  const id = await userRecord(dir);
  assert.equal(sxReason(dir, sxBrief('auth, secrets', id)), null);
  const used = fs.readFileSync(path.join(dir, '.guilda', 'security', 'approvals.jsonl'), 'utf8').trim().split('\n');
  assert.deepEqual(used.map((l) => JSON.parse(l).id), [id]);
  assert.deepEqual(records(dir), []);
});

test('S5-18: a second use of the same record is refused', async () => {
  const dir = sxDir();
  const id = await userRecord(dir);
  assert.equal(sxReason(dir, sxBrief('auth', id)), null);
  assert.equal(sxReason(dir, sxBrief('auth', id)), R37.used);
  const again = await userRecord(dir);
  assert.equal(sxReason(dir, sxBrief('auth', again)), null);
});

test('S5-18: a record for another task, with no approval word or with a refusal, fails', async () => {
  const dir = sxDir();
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'I approve the run of T2.'))), R37.task);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'I approve T10.'))), R37.task);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'Run T1 now.'))), R37.words);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'No, do not run T1.'))), R37.words);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'No. I do not approve T1.'))), R37.words);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'Sim, aprovo T1.'))), null);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir, 'yes T1'))), null);
});

test('S5-18: an approval with a refusal word is not written to the used list', async () => {
  const dir = sxDir();
  sxReason(dir, sxBrief('auth', await userRecord(dir, 'No, T1.')));
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'security', 'approvals.jsonl')), false);
});

test('S5-18 (ARC6): a brief with a missing field is refused before the R37 checks', async () => {
  const dir = sxDir();
  const id = await userRecord(dir);
  const prompt = sxBrief('auth', id).replace('Goal: g\n', '');
  assert.equal(sxReason(dir, prompt), 'ARC6: brief incomplete: Goal');
  assert.deepEqual(records(dir).map((r) => r.rule), ['ARC6']);
});

test('S5-18: the hook fails closed with no prompt, with a non-string prompt and with no key', async () => {
  const dir = sxDir();
  assert.equal(sxReason(dir, undefined), R37.noPrompt);
  assert.equal(sxReason(dir, 42), R37.noPrompt);
  const id = await userRecord(dir);
  const saved = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-nokey-'));
  try {
    assert.equal(sxReason(dir, sxBrief('auth', id)), R37.verify);
  } finally {
    process.env.XDG_STATE_HOME = saved;
  }
});

test('S5-18: a case or space variant of the type gets the same check; other types do not', () => {
  const dir = sxDir();
  assert.equal(sxReason(dir, sxBrief('none', null), ' Guilda:Security-Executor '), R37.none);
  assert.equal(sxReason(dir, sxBrief('none', null), 'guilda:security'), null);
});

test('S5-18: with no .guilda folder the dispatch is refused, with no record and no folder', () => {
  const dir = tempProject();
  assert.equal(sxReason(dir, sxBrief('auth', 'u-00000001')), R37.noProject);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('U5-8: no settings file, a sandbox that is off and a bad JSON refuse, and the record is not used', async () => {
  for (const settings of [null, '{"sandbox":{"enabled":false}}', '{}', '{"sandbox":{"enabled":"true"}}', '{ not json']) {
    const dir = sxDir(settings);
    assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), SANDBOX_TEXT, String(settings));
    assert.equal(fs.existsSync(path.join(dir, '.guilda', 'security', 'approvals.jsonl')), false);
  }
});

test('U5-8: true with false refuses (in both orders); true with an absent file passes', async () => {
  for (const [a, b] of [['settings.json', 'settings.local.json'], ['settings.local.json', 'settings.json']]) {
    const dir = sxDir(SANDBOX_ON, a);
    fs.writeFileSync(path.join(dir, '.claude', b), '{"sandbox":{"enabled":false}}');
    assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), SANDBOX_TEXT, `${a} true, ${b} false`);
    fs.writeFileSync(path.join(dir, '.claude', b), '{"sandbox":{"enabled":"yes"}}');
    assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), SANDBOX_TEXT, `${b} string`);
    fs.writeFileSync(path.join(dir, '.claude', b), '{"other":1}');
    assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), null, `${b} with no sandbox key`);
  }
  const dir = sxDir(SANDBOX_ON);
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), null);
});

test('U5-8: enabled in settings.json or in settings.local.json passes; a bad file refuses even if the other is on', async () => {
  for (const name of ['settings.json', 'settings.local.json']) {
    const dir = sxDir(SANDBOX_ON, name);
    assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), null, name);
  }
  const dir = sxDir(SANDBOX_ON);
  fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), '{ bad');
  assert.equal(sxReason(dir, sxBrief('auth', await userRecord(dir))), SANDBOX_TEXT);
});

test('S5-18: the task ID of the brief needs the form of a task ID and is not an approval word', async () => {
  const dir = sxDir();
  for (const title of ['yes — x', 'approve — x', 'Sim', 'Task — x', '123 — x', '--- x', 'T1-2 — x', 'T' + '1'.repeat(30) + ' — x']) {
    const id = await userRecord(dir, 'I approve yes sim T1 Task 123 T1-2.');
    const prompt = sxBrief('auth', id).replace('ID / title: T1 — x', `ID / title: ${title}`);
    const reason = sxReason(dir, prompt);
    // T1-2 reads as the ID T1, which the record names: only the form check refuses the others.
    if (title === 'T1-2 — x') assert.equal(reason, null, title);
    else assert.equal(reason, NO_TASK_ID, title);
  }
});
