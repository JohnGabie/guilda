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

test('security consultation answer -> exit 0, no verdict check, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const text = 'Mode: consultation\nRequirements:\n  1. Encrypt the token at rest. Violations: R7';
  const r = stop(dir, 'guilda:security', text);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(records(dir).length, 0);
});

test('the consultation line applies to Security only and must be the first line', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(stop(dir, 'guilda:reviewer', 'Mode: consultation').code, 2);
  assert.equal(stop(dir, 'guilda:security', 'See below\nMode: consultation').code, 2);
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

const NOTICE = 'guilda: format check skipped: retry limit reached\n';
const BAD = 'Result: APPROVED';
const sendBack = (dir, agent_id) =>
  runHook(HOOK, { agent_type: 'guilda:reviewer', agent_id, last_assistant_message: BAD }, dir);

test('stop_hook_active true + invalid answer -> exit 0 + notice', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(
    HOOK,
    { agent_type: 'guilda:reviewer', stop_hook_active: true, last_assistant_message: BAD },
    dir,
  );
  assert.equal(r.code, 0);
  assert.equal(r.stderr, NOTICE);
});

test('third invalid answer from the same agent_id -> exit 0 + notice; first two -> exit 2', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(sendBack(dir, 'a1').code, 2);
  assert.equal(sendBack(dir, 'a1').code, 2);
  const third = sendBack(dir, 'a1');
  assert.equal(third.code, 0);
  assert.equal(third.stderr, NOTICE);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'format-retries.json'), 'utf8')), { a1: 2 });
});

test('a different agent_id is counted separately', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  sendBack(dir, 'a1');
  sendBack(dir, 'a1');
  assert.equal(sendBack(dir, 'a2').code, 2);
});

test('without agent_id the key is agent_type + session_id', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const run = (session_id) =>
    runHook(HOOK, { agent_type: 'guilda:qa', session_id, last_assistant_message: 'nothing' }, dir);
  assert.equal(run('s1').code, 2);
  assert.equal(run('s1').code, 2);
  assert.equal(run('s1').code, 0);
  assert.equal(run('s2').code, 2);
});

test('a corrupt retries file -> allow, never crash', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.writeFileSync(path.join(dir, '.guilda', 'format-retries.json'), '{ broken');
  const r = sendBack(dir, 'a1');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, NOTICE);
});

test('.guilda/.gitignore lists format-retries.json after a send-back', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  sendBack(dir, 'a1');
  const lines = fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').split('\n');
  assert.ok(lines.includes('format-retries.json'));
});

test('an existing .gitignore with only violations.jsonl gets the new line appended', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.writeFileSync(path.join(dir, '.guilda', '.gitignore'), 'violations.jsonl\n');
  sendBack(dir, 'a1');
  assert.equal(fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8'), 'violations.jsonl\nformat-retries.json\n');
});

test('a consultation line with a verdict in the answer is still checked', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(stop(dir, 'guilda:security', 'Mode: consultation\nResult: maybe\nViolations: R7').code, 2);
  const valid = stop(dir, 'guilda:security', 'Mode: consultation\nResult: REJECTED\nViolations: R7');
  assert.equal(valid.code, 0);
  assert.deepEqual(records(dir).map((x) => x.rule), ['R7']);
});
