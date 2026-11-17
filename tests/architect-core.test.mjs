import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';
import { lintRules } from '../scripts/lint-rules.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of one numbered procedure step, up to the next numbered step or the next heading. */
function step(n) {
  const lines = SKILL.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${n}. `));
  assert.ok(start >= 0, `procedure step ${n} exists`);
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (/^\d+\. /.test(l) || l.startsWith('#')) break;
    out.push(l);
  }
  return out.join('\n');
}

/** Text of a `## <title>` section. */
function section(title) {
  const lines = SKILL.split('\n');
  const start = lines.indexOf(`## ${title}`);
  assert.ok(start >= 0, `section ${title} exists`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

test('the procedure runs doctor.mjs before the first dispatch', () => {
  const proc = section('Procedure');
  assert.match(proc, /scripts\/doctor\.mjs/);
  assert.match(proc, /--session/);
  assert.match(proc, /--agents/);
  assert.match(proc, /before the first dispatch/i);
  assert.match(proc, /not PASS/);
  assert.match(proc, /guilda:\*/);
});

test('the tier text has 50 changed lines, git diff --numstat and shared code', () => {
  const tier = section('Tier choice');
  assert.match(tier, /50 changed lines/);
  assert.match(tier, /git diff --numstat/);
  assert.match(tier, /binary file/);
  assert.match(tier, /shared code/i);
  assert.match(tier, /Files it may touch:/);
  assert.match(tier, /producer\/consumer table/);
  assert.match(tier, /re-review/);
  assert.doesNotMatch(tier, /Reviewer always runs at master/);
});

test('step 11 names the reply language and one tier lower', () => {
  const s = step(11);
  assert.match(s, /reply language/);
  assert.match(s, /config\.languages\.replies/);
  assert.match(s, /one tier lower/);
  assert.match(s, /tell the user/i);
});

test('step 1 names the Explain: part, brief and full', () => {
  const s = step(1);
  assert.match(s, /Explain:/);
  assert.match(s, /\bfull\b/);
  assert.match(s, /\bbrief\b/);
  assert.match(s, /where/);
  assert.match(s, /example/);
  assert.match(s, /R13/);
});

test('the triage table has the rows Lab, Security and Engineering', () => {
  const s = section('Triage and leads');
  assert.match(s, /^\| *Open question.*Lab/m);
  assert.match(s, /^\| *Risk area.*Security/m);
  assert.match(s, /^\| *Decided change.*Engineering/m);
  assert.match(s, /guilda:lab/);
  assert.match(s, /lesson/);
  assert.match(step(10), /Triage and leads/);
});

test('the leads line names the three agents', () => {
  const s = section('Triage and leads');
  for (const a of ['guilda:security', 'guilda:devops-advisor', 'guilda:ai-lead']) {
    assert.ok(s.includes(a), `${a} is in the leads line`);
  }
});

test('the verdicts section says that a Stage: spec verdict does not count', () => {
  const s = section('Review verdicts');
  assert.match(s, /Stage: spec/);
  assert.match(s, /does not count/);
  assert.match(s, /question about the spec/);
  assert.match(s, /facts/);
  assert.match(s, /never argue/i);
  assert.match(s, /ledger/);
  assert.match(s, /R11/);
  assert.match(s, /review unit/);
  assert.match(step(12), /Review verdicts/);
});

test('the Dispatch types section names guilda:architect-executor, guilda:executor, guilda:reviewer and guilda:lab-researcher', () => {
  const s = section('Dispatch types');
  for (const a of ['guilda:architect-executor', 'guilda:executor', 'guilda:reviewer', 'guilda:lab-researcher']) {
    assert.ok(s.includes(a), `${a} is in the section`);
  }
  assert.match(s, /yourself/);
  assert.match(s, /no intermediate agent/i);
});

test('the ARC4 block passes lintRules', () => {
  const lines = SKILL.split('\n');
  const i = lines.findIndex((l) => l.startsWith('### ARC4'));
  const block = lines.slice(i, i + 5).join('\n');
  assert.deepEqual(lintRules(block, { prefix: 'ARC' }), []);
  assert.match(block, /Check: law/);
  assert.match(block, /pre-agent/);
});

test('the plan text names the Issue line and the release closes the issue', () => {
  assert.match(SKILL, /names (it|the issue)/);
  assert.match(SKILL, /release closes/);
});
