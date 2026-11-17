// S41, the Skill part: R28 tells the user that guilda is not set up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
import { tempProject, runHook } from './helpers.mjs';

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
