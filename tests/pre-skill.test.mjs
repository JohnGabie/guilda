// S41, the Skill part: R28 tells the user that guilda is not set up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
import os from 'node:os';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

const HOOK = 'scripts/hooks/pre-skill.mjs';
const call = (skill, agentType) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Skill',
  tool_input: { skill },
  ...(agentType === undefined ? {} : { agent_type: agentType }),
});

test('no .guilda folder: guilda:architect prints the R28 notice; guilda:init prints nothing; a skill of another plugin prints nothing', () => {
  const dir = tempProject();
  const r = runHook(HOOK, call('guilda:architect'), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, { systemMessage: SETUP_NOTICE });

  for (const skill of ['guilda:init', 'superpowers:brainstorming']) {
    const q = runHook(HOOK, call(skill), dir);
    assert.equal(q.code, 0);
    assert.equal(q.stdout, '', skill);
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('no .guilda folder: an agent call of a guilda skill outside its group gets the notice, not a refusal', () => {
  const dir = tempProject();
  for (const skill of ['guilda:architect', 'guilda-skills:red-team', 'Guilda:architect']) {
    const r = runHook(HOOK, call(skill, 'guilda:executor'), dir);
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.stdout), { systemMessage: SETUP_NOTICE }, skill);
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

// S5-45, the hook part: a member of an open council loads the council skill (D47, D43).
test('council skill: a member of an open council passes; others and a closed council get R30', async () => {
  const { main: council, JUDGE } = await import('../scripts/council.mjs');
  const { writeUserRecord } = await import('../scripts/lib/records.mjs');
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = { ...process.env, XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state ')) };
  fs.writeFileSync(path.join(dir, 'q.md'), 'Which database?\n');
  const refused = (r) => JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'deny';
  // No council yet: the AI lead is not a member.
  assert.equal(refused(runHook(HOOK, call('guilda:council', 'guilda:ai-lead'), dir)), true);
  const rec = writeUserRecord(dir, { session: 's1', kind: 'answer', text: 'yes, open the council', question: null }, env);
  const opened = council(
    ['open', '--question', 'q.md', '--members', 'architect,guilda:ai-lead', '--format', 'debate', '--record', rec.id],
    { cwd: dir, env },
  );
  assert.equal(opened.code, 0);
  const id = opened.lines[0];
  const ok = runHook(HOOK, call('guilda:council', 'guilda:ai-lead'), dir);
  assert.deepEqual([ok.code, ok.stdout], [0, '']);
  // The bare name and the main session (the Architect) pass too.
  assert.equal(runHook(HOOK, call('council', 'guilda:ai-lead'), dir).stdout, '');
  assert.equal(runHook(HOOK, call('guilda:council'), dir).stdout, '');
  // A non-member agent is refused with R30, and a member does not get another skill of the group.
  const no = runHook(HOOK, call('guilda:council', 'guilda:executor'), dir);
  assert.match(
    JSON.parse(no.stdout).hookSpecificOutput.permissionDecisionReason,
    /^R30: the skill guilda:council is not for the agent guilda:executor\./,
  );
  assert.equal(refused(runHook(HOOK, call('guilda:architect', 'guilda:ai-lead'), dir)), true);
  // The Judge has the group council.
  assert.equal(runHook(HOOK, call('guilda:council', JUDGE), dir).stdout, '');
  // After the close the council is not open.
  council(['say', '--id', id, '--from', JUDGE, '--type', 'open'], { cwd: dir, env });
  const close = council(
    ['say', '--id', id, '--from', JUDGE, '--type', 'close', '--position', 'architect=none', '--position', 'guilda:ai-lead=none'],
    { cwd: dir, env },
  );
  assert.equal(close.code, 0, close.lines.join());
  assert.equal(refused(runHook(HOOK, call('guilda:council', 'guilda:ai-lead'), dir)), true);
});
