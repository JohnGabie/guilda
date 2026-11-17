import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintRules, lintModelNames } from '../scripts/lint-rules.mjs';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));
const nonBlank = (text) => text.split('\n').filter((l) => l.trim() !== '').length;

const AGENT = 'agents/reviewer.md';
const REVIEW = 'core/knowledge/review.md';
const body = () => read(AGENT).match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1];

/** Text of a `## <title>` section, up to the next `## ` heading. */
function section(text, title) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${title}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

// The checklists may live in the agent file or, past 150 lines, in the knowledge file.
const checklistText = () => read(AGENT) + (exists(REVIEW) ? '\n' + read(REVIEW) : '');

test('the spec review mode writes Stage: spec and does not count toward R11', () => {
  const text = checklistText();
  assert.ok(text.includes('Stage: spec'));
  assert.match(text, /does not count toward R11/);
  assert.match(read(AGENT), /^Stage: code \| final \| spec$/m);
});

test('the mutants are classified killed, survived or equivalent', () => {
  const text = checklistText();
  assert.ok(text.includes('killed, survived or equivalent'));
  assert.match(text, /survived[^.\n]*rejection/);
  assert.match(text, /equivalent[^.\n]*only noted/);
  assert.match(text, /failing assertion targets the mutant/);
});

test('the lab report check needs an agent ID and criteria written before the run', () => {
  const text = checklistText();
  assert.ok(text.includes('agent ID'));
  assert.match(text, /R26/);
  assert.match(text, /written before the run/);
});

test('each skill use in a plan has a line with when, who, where and what', () => {
  const text = checklistText();
  assert.ok(text.includes('when, who, where and what'));
  assert.match(text, /names the task and the skill/);
});

test('each new test failed against the old code (EXE2)', () => {
  const text = checklistText();
  assert.ok(text.includes('old code'));
  assert.match(text, /EXE2/);
});

test('the issue 10 checklist items are present', () => {
  const text = checklistText();
  assert.match(text, /No secret in a client cache, the URL, storage or logs/);
  assert.match(text, /anchored assertions/i);
  assert.match(text, /record that each filter must reject/);
  assert.match(text, /No generated artifact in the diff/);
  assert.match(text, /exit code is in the Executor report/);
  assert.match(text, /skills of the brief `Skills:` field and no other/);
});

test('the spec review checklist has the ARC items and the Security zone line', () => {
  const text = checklistText();
  for (const id of ['ARC7', 'ARC2', 'ARC8', 'ARC10']) assert.ok(text.includes(id), id);
  assert.ok(text.includes('Security zone:'));
});

test('the domain skill check needs 20 sources, an approved curation and evals', () => {
  const text = checklistText();
  assert.match(text, /20 or more sources/);
  assert.match(text, /approved curation/);
  assert.match(text, /evals/);
});

test('the Reviewer can ask the Architect and keeps the verdict', () => {
  const text = checklistText();
  assert.match(text, /ask the Architect/);
  assert.match(text, /facts only/);
  assert.match(text, /R7/);
});

test('the Reviewer never publishes outside the worktree', () => {
  assert.ok(checklistText().includes('outside the worktree'));
});

test('the body has 150 lines or fewer', () => {
  assert.ok(nonBlank(body()) <= 150, `${nonBlank(body())} lines`);
});

test('the role rules pass lintRules with prefix REV', () => {
  const rules = section(body(), 'Rules');
  assert.match(rules, /^### REV1 — /m);
  assert.deepEqual(lintRules(rules, { prefix: 'REV' }), []);
});

if (exists(REVIEW)) {
  test('lintModelNames(review.md) is empty', () => {
    assert.deepEqual(lintModelNames([path.join(REPO_ROOT, REVIEW)]), []);
  });
  test('it has an https:// source', () => {
    assert.match(read(REVIEW), /https:\/\//);
  });
  test('the Reviewer names the file', () => {
    assert.ok(read(AGENT).includes('core/knowledge/review.md'));
  });
}

test('the reviewer runs the trace check and cites R31', () => {
  const text = checklistText();
  assert.ok(text.includes('Each plan task and each brief has a `Uses:` line.'));
  assert.ok(text.includes('Run `node <plugin root>/scripts/trace.mjs <project> check`.'));
  assert.match(text, /A `LEGACY` task is not rejected for R31\./);
  assert.ok(text.includes('Read a cited block with `node <plugin root>/scripts/trace.mjs <project> show <key>`; never read the whole spec for one ID (D27).'));
});

test('a suspect link is read, and only a mismatch is rejected', () => {
  const text = checklistText();
  assert.ok(text.includes('Read each suspect change; reject only a content mismatch (R31).'));
  assert.doesNotMatch(text, /reject each suspect/i);
});

test('the output format has the optional Questions section', () => {
  const format = section(body(), 'Output format');
  const lines = format.split('\n');
  const violations = lines.findIndex((l) => l.startsWith('Violations: '));
  assert.ok(violations >= 0);
  assert.equal(lines[violations + 1], 'Questions:');
  assert.equal(lines[violations + 2], '- <question to the Executor>');
  assert.match(body(), /optional `Questions:` section/);
});
