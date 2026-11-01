import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict } from '../scripts/lib/verdict.mjs';

// Filled from the Output format template in agents/reviewer.md.
const REVIEWER = `Result: APPROVED
Stage: final
Task: T8 / Verdict reader
Rejection count: 0 of 3
Problems: none
Evidence: npm test, exit 0, all passing
Security: not applicable
QA: yes — yes
Not verified: none
User must look: no
Violations: none`;

// Filled from the Output format template in agents/security.md.
const SECURITY = `Result: REJECTED
Risk area: auth
Brief requirements:
  1. Tokens expire -> NOT MET — src/auth.js:12
Findings: src/auth.js:12 — blocks — OWASP A07 — no expiry — add expiry
Notes: none
Not verified: none
User must decide: no
Violations: SEC2, R7`;

test('parses APPROVED with none', () => {
  assert.deepEqual(parseVerdict(REVIEWER), { result: 'APPROVED', violations: [] });
});

test('parses two IDs', () => {
  assert.deepEqual(parseVerdict(SECURITY), { result: 'REJECTED', violations: ['SEC2', 'R7'] });
});

test('parses a rejected reviewer verdict with a Stage line', () => {
  const text = REVIEWER.replace('Result: APPROVED', 'Result: REJECTED-SMALL').replace(
    'Violations: none',
    'Violations: REV1, P3, ARC4',
  );
  assert.deepEqual(parseVerdict(text), {
    result: 'REJECTED-SMALL',
    violations: ['REV1', 'P3', 'ARC4'],
  });
});

test('ignores IDs in prose above the Violations line', () => {
  const text = `I saw R1 and R2 broken in the draft.\nProblems: R5 in a.js:1\n${REVIEWER}`;
  assert.deepEqual(parseVerdict(text).violations, []);
});

test('no Violations line -> []', () => {
  assert.deepEqual(parseVerdict('Result: APPROVED\nProblems: R3'), {
    result: 'APPROVED',
    violations: [],
  });
});

test('uses the last Result and Violations lines', () => {
  const text = 'Result: REJECTED\nViolations: R1\nResult: APPROVED\nViolations: R9';
  assert.deepEqual(parseVerdict(text), { result: 'APPROVED', violations: ['R9'] });
});

test('drops tokens that are not rule IDs', () => {
  assert.deepEqual(parseVerdict('Violations: R7, foo, r8, X1, ABCDE5, QA1').violations, ['R7', 'QA1']);
});

test('no Result line -> null; non-string input is safe', () => {
  assert.equal(parseVerdict('nothing here').result, null);
  assert.deepEqual(parseVerdict(undefined), { result: null, violations: [] });
});
