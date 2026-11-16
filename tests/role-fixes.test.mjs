import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintRules } from '../scripts/lint-rules.mjs';
import { validateQaReport } from '../scripts/lib/formats.mjs';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text) => text.replace(/\s+/g, ' ');
const nonBlank = (text) => text.split('\n').filter((l) => l.trim() !== '').length;

/** Text of the `## Rules` section, up to the next `## ` heading. */
function rulesOf(text) {
  const lines = text.split('\n');
  const start = lines.indexOf('## Rules');
  assert.ok(start >= 0, 'has a Rules section');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

const ROLES = { 'agents/executor.md': 'EXE', 'agents/qa.md': 'QA', 'agents/version-control.md': 'VC' };

test('the Executor names the Skills field', () => {
  const t = flat(read('agents/executor.md'));
  assert.match(t, /`Skills:` field of the brief/);
  assert.match(t, /Load each skill that the `Skills:` field of the brief names, before the work/);
  assert.match(t, /no other domain skill/);
  assert.match(t, /use it when it is installed/);
  assert.match(t, /not in your skill list, read its `SKILL.md` \(a project skill is at `\.claude\/skills\/<name>\/SKILL\.md`\) and follow it/);
  assert.match(t, /timeout on each long command/);
  assert.match(t, /Commit each green item/);
});

test('the Executor, QA and the Reviewer text say outside the worktree', () => {
  for (const rel of ['agents/executor.md', 'agents/qa.md']) {
    const t = flat(read(rel));
    assert.match(t, /Never publish or share anything outside the worktree/, rel);
  }
});

test('QA has the line QA: covered by review', () => {
  const t = flat(read('agents/qa.md'));
  assert.match(read('agents/qa.md'), /^QA: covered by review/m);
  assert.match(t, /each Acceptance scenario names a check that the Reviewer already ran/);
  assert.match(t, /list of those checks/);
});

test('version-control takes merges after the user approves', () => {
  const t = flat(read('agents/version-control.md'));
  assert.match(t, /Merges and conflicts come to this role/);
  assert.match(t, /only after the user approves the merge/);
});

test('each role file passes lintRules with its prefix', () => {
  for (const [rel, prefix] of Object.entries(ROLES)) {
    const text = read(rel);
    assert.deepEqual(lintRules(rulesOf(text), { prefix }), [], rel);
    assert.ok(nonBlank(text.split('\n---\n').slice(1).join('\n---\n')) <= 150, `${rel} has 150 lines or fewer`);
  }
});

test('validateQaReport still accepts a full report', () => {
  const report = [
    'Environment: task/x @ abc1234 — local server, seed data',
    'Tools: CLI',
    'Scenarios:',
    '  1. User signs in -> PASSED — npm run e2e, exit 0',
    'Phase 2 plan: tours',
    'Phase 2 findings: none',
    'States checked: with data',
    'Persistence after reload: ok',
    'Logs: none',
    'Out-of-scope notes (for the Architect): none',
    'User must look: none',
    'Limits of this check: none',
    'QA: covered by review — npm test, exit 0 (Reviewer)',
  ].join('\n');
  assert.deepEqual(validateQaReport(report), []);
});
