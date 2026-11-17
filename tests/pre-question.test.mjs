import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/pre-question.mjs';

const input = (dir, question) => ({
  session_id: '00000000-0000-4000-8000-000000000000',
  cwd: dir,
  hook_event_name: 'PreToolUse',
  tool_name: 'AskUserQuestion',
  tool_input: { questions: [question] },
});
const q = (over = {}) => ({
  question: 'Which way do we go?',
  header: 'Way',
  multiSelect: false,
  options: [
    { label: 'Fast', description: 'Quick path' },
    { label: 'Safe', description: 'Slow path' },
  ],
  ...over,
});
const violations = (dir) => {
  try {
    return fs
      .readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

test('deny names the IDs', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(SCRIPT, input(dir, q({ question: 'Do we keep R13 and D40?' })), dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.permissionDecisionReason, 'R13: say <ID> in plain words first, then the ID in parentheses: R13, D40');
});

test('the record has no question text', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  runHook(SCRIPT, input(dir, q({ question: 'Secret wording about R13' })), dir);
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R13');
  assert.equal(v[0].level, 'guidance');
  assert.equal(v[0].source, 'pre-question');
  assert.equal(v[0].action, 'deny');
  assert.ok(!JSON.stringify(v[0]).includes('Secret'));
});

test('an option description is read', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const bad = q({ options: [{ label: 'Fast', description: 'Follows T31' }, { label: 'Safe', description: 'ok' }] });
  const r = runHook(SCRIPT, input(dir, bad), dir);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /: T31$/);
  const lbl = q({ options: [{ label: 'Use S3', description: 'x' }] });
  assert.notEqual(runHook(SCRIPT, input(dir, lbl), dir).stdout, '');
  const hdr = q({ header: 'R5' });
  assert.notEqual(runHook(SCRIPT, input(dir, hdr), dir).stdout, '');
});

test('a clean question is allowed', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(SCRIPT, input(dir, q({ question: 'Keep the short form (R13)?' })), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(violations(dir), []);
});

test('no .guilda folder: allow', () => {
  const dir = tempProject();
  const r = runHook(SCRIPT, input(dir, q({ question: 'Do we keep R13?' })), dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('not JSON: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runHook(SCRIPT, 'not json R13', dir);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const odd = runHook(SCRIPT, { tool_name: 'AskUserQuestion', tool_input: { questions: 'R13' } }, dir);
  assert.equal(odd.stdout, '');
});
