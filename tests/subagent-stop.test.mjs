import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const HOOK = 'scripts/hooks/subagent-stop.mjs';
const VERDICT = `Result: REJECTED-SMALL
Stage: code
Task: T8
Rejection count: 1 of 3
Problems: a.js:3 — R7 — fix it
Evidence: npm test, exit 1
Security: not applicable
QA: not yet — no
Not verified: none
User must look: no
Violations: R7`;

function records(dir) {
  const file = path.join(dir, '.guilda', 'violations.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('no config -> no record', () => {
  const dir = tempProject();
  const r = runHook(HOOK, { agent_type: 'guilda:reviewer', last_assistant_message: VERDICT }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('reviewer verdict with R7 -> one record with source guilda:reviewer', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(HOOK, { agent_type: 'guilda:reviewer', last_assistant_message: VERDICT }, dir);
  assert.equal(r.code, 0);
  const recs = records(dir);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].rule, 'R7');
  assert.equal(recs[0].level, 'gate');
  assert.equal(recs[0].source, 'guilda:reviewer');
  assert.equal(recs[0].action, 'verdict');
});

test('security verdict with two IDs -> two records', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const text = 'Result: REJECTED\nViolations: SEC2, R4';
  runHook(HOOK, { agent_type: 'guilda:security', last_assistant_message: text }, dir);
  assert.deepEqual(records(dir).map((x) => x.rule), ['SEC2', 'R4']);
});

test('Violations: none -> no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  runHook(HOOK, { agent_type: 'guilda:reviewer', last_assistant_message: 'Result: APPROVED\nViolations: none' }, dir);
  assert.equal(records(dir).length, 0);
});

test('other agent types are ignored', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  runHook(HOOK, { agent_type: 'guilda:executor', last_assistant_message: VERDICT }, dir);
  assert.equal(records(dir).length, 0);
});

test('invalid config -> silent, no record', () => {
  const dir = tempProject({ config: '{ not json' });
  const r = runHook(HOOK, { agent_type: 'guilda:reviewer', last_assistant_message: VERDICT }, dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('malformed input JSON -> exit 0', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, HOOK)], {
    input: '{ broken',
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(r.status, 0);
  assert.equal(records(dir).length, 0);
});

test('hooks.json registers SubagentStop for reviewer, security and qa in exec form', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = hooks.SubagentStop[0];
  assert.equal(entry.matcher, '^guilda:(reviewer|security|qa)$');
  assert.equal(entry.hooks[0].command, 'node');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/subagent-stop.mjs']);
});
