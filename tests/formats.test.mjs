import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBrief, validateVerdict, validateQaReport } from '../scripts/lib/formats.mjs';

const BRIEF = `ID / title: T1 — Add login
Goal: Let a user sign in.
Context: docs/spec.md; journeyman because the contract is clear.
Out of scope: sign-up
Files it may touch: src/login.js
Contract / interfaces: login(user, pass): Promise<Session>
Tests that must pass: tests/login.test.js, npm test
Acceptance: S1 user signs in (QA tool: browser)
Suggested tier: journeyman
Risk area: none
Deletion rules: none
Dependencies: none`;

const without = (name) => BRIEF.split('\n').filter((l) => !l.startsWith(`${name}:`)).join('\n');

test('complete brief -> no errors', () => {
  assert.deepEqual(validateBrief(BRIEF), []);
});

test('brief without Risk area -> ["Risk area"]', () => {
  assert.deepEqual(validateBrief(without('Risk area')), ['Risk area']);
});

test('brief with an empty field is missing that field', () => {
  assert.deepEqual(validateBrief(BRIEF.replace('Goal: Let a user sign in.', 'Goal:')), ['Goal']);
});

test('a field value may continue on indented lines', () => {
  assert.deepEqual(validateBrief(BRIEF.replace('Goal: Let a user sign in.', 'Goal:\n  Let a user sign in.')), []);
});

test('brief with tier "opus" -> error naming Suggested tier', () => {
  const errors = validateBrief(BRIEF.replace('Suggested tier: journeyman', 'Suggested tier: opus'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Suggested tier/);
});

test('unfilled tier placeholder -> error', () => {
  const t = BRIEF.replace('Suggested tier: journeyman', 'Suggested tier: master | journeyman | apprentice');
  assert.equal(validateBrief(t).length, 1);
});

test('non-string brief -> all fields missing', () => {
  assert.equal(validateBrief(undefined).length, 12);
});

test('reviewer verdict with REJECTED-SMALL and Violations -> no errors', () => {
  assert.deepEqual(validateVerdict('Result: REJECTED-SMALL\nStage: code\nViolations: R7', 'reviewer'), []);
});

test('reviewer verdict without Stage line is valid', () => {
  assert.deepEqual(validateVerdict('Result: APPROVED\nViolations: none', 'reviewer'), []);
});

test('security verdict with REJECTED-SMALL -> error', () => {
  assert.equal(validateVerdict('Result: REJECTED-SMALL\nViolations: SEC1', 'security').length, 1);
});

test('security missing-diff answer (REJECTED + Violations: none) is valid', () => {
  assert.deepEqual(validateVerdict('Result: REJECTED\nNot verified: diff file\nViolations: none', 'security'), []);
});

test('verdict without Violations line -> error', () => {
  const errors = validateVerdict('Result: APPROVED', 'reviewer');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Violations/);
});

test('verdict with empty Violations, no Result, or unfilled alternatives -> errors', () => {
  assert.ok(validateVerdict('Result: APPROVED\nViolations:', 'reviewer').length > 0);
  assert.ok(validateVerdict('Violations: none', 'reviewer').length > 0);
  assert.ok(validateVerdict('Result: APPROVED | REJECTED\nViolations: none', 'security').length > 0);
  assert.ok(validateVerdict('Result: APPROVED\nStage: sideways\nViolations: none', 'reviewer').length > 0);
});

const QA = `Environment: feat/x @ abc1234 — local server
Tools: browser
Scenarios:
  1. User signs in -> PASSED — npm run e2e, exit 0
  2. Wrong password -> FAILED — screenshot a.png Steps: type bad pass
  3. Reset mail -> NOT VERIFIED — none Not verified because: mail tool is missing
Phase 2 plan: tours
Logs: none`;

test('valid QA report -> no errors', () => {
  assert.deepEqual(validateQaReport(QA), []);
});

test('QA: Not verified because may sit on a following line', () => {
  const t = QA.replace(' Not verified because: mail tool is missing', '\n     Not verified because: mail tool is missing');
  assert.deepEqual(validateQaReport(t), []);
});

test('QA report with NOT VERIFIED and no reason -> error', () => {
  const errors = validateQaReport(QA.replace(' Not verified because: mail tool is missing', ''));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /3/);
});

test('QA report without Scenarios section, or with a scenario with no result -> errors', () => {
  assert.ok(validateQaReport('Environment: x').length > 0);
  assert.ok(validateQaReport(QA.replace('PASSED — npm run e2e, exit 0', 'looked fine')).length > 0);
  assert.ok(validateQaReport(QA.replace('PASSED — npm run e2e, exit 0', 'PASSED')).length > 0);
});

test('a "Not verified because" in a later scenario does not rescue an earlier one', () => {
  const t = QA.replace('  1. User signs in -> PASSED — npm run e2e, exit 0', '  1. User signs in -> NOT VERIFIED — none');
  assert.equal(validateQaReport(t).length, 1);
});
