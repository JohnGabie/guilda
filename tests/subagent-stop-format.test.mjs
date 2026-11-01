import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

const HOOK = 'scripts/hooks/subagent-stop.mjs';

const QA = `Environment: feat/x @ abc1234 — local server
Tools: browser
Scenarios:
  1. User signs in -> PASSED — npm run e2e, exit 0
  2. Reset mail -> NOT VERIFIED — none Not verified because: mail tool is missing
Logs: none`;

function records(dir) {
  const file = path.join(dir, '.guilda', 'violations.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const stop = (dir, agent_type, last_assistant_message) =>
  runHook(HOOK, { agent_type, last_assistant_message }, dir);

test('reviewer answer without Violations line -> exit 2, stderr names the error, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = stop(dir, 'guilda:reviewer', 'Result: REJECTED-SMALL\nProblems: a.js:3 — R7');
  assert.equal(r.code, 2);
  assert.equal(r.stderr, 'Fix the output format: Violations line missing\n');
  assert.equal(records(dir).length, 0);
});

test('several errors are joined with "; "', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = stop(dir, 'guilda:security', 'Result: REJECTED-SMALL');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^Fix the output format: Result must be one of APPROVED, REJECTED; Violations line missing\n$/);
});

test('valid reviewer answer -> exit 0, Task 8 records', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = stop(dir, 'guilda:reviewer', 'Result: REJECTED-SMALL\nStage: code\nViolations: R7');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.deepEqual(records(dir).map((x) => [x.rule, x.source]), [['R7', 'guilda:reviewer']]);
});

test('qa report with NOT VERIFIED and no reason -> exit 2', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = stop(dir, 'guilda:qa', QA.replace(' Not verified because: mail tool is missing', ''));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^Fix the output format: Scenario 2: NOT VERIFIED needs/);
});

test('valid qa report -> exit 0, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = stop(dir, 'guilda:qa', QA);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(records(dir).length, 0);
});

test('missing last_assistant_message -> exit 0, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const agent of ['guilda:reviewer', 'guilda:security', 'guilda:qa']) {
    const r = runHook(HOOK, { agent_type: agent }, dir);
    assert.equal(r.code, 0);
    assert.equal(r.stderr, '');
  }
  assert.equal(records(dir).length, 0);
});

test('no config -> exit 0 even for an invalid answer', () => {
  const dir = tempProject();
  const r = stop(dir, 'guilda:reviewer', 'nonsense');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
});
