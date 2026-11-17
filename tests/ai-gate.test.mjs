import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const body = (rel) => read(rel).match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1];

const REVIEWER = 'agents/reviewer.md';
const QA = 'agents/qa.md';
const SECURITY = 'core/knowledge/security.md';
const GATE_TITLE = 'AI artifact (a prompt, a skill, an agent)';

/** Text of a `## <title>` section, up to the next `## ` heading. */
function section(text, title) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${title}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The table row of one gate part: `| AIG<n> | <part> | <passes when> |`. */
const row = (gate, id) => gate.split('\n').find((l) => l.startsWith(`| ${id} |`));

test('the Reviewer names the six parts of the gate', () => {
  const gate = section(body(REVIEWER), GATE_TITLE);
  assert.ok(gate, `${REVIEWER} has the section "## ${GATE_TITLE}"`);
  const parts = {
    AIG1: [/\| Eval suite \|/, /3 or more real cases/, /`evals\/<suite>`/, /never under `skills\/`/],
    AIG2: [/\| Threshold \|/, /written before the first run/, /API error is not a score/],
    AIG3: [/\| Baseline difference \|/, /without the artifact/, /higher/],
    AIG4: [/\| Injection tests \|/, /one direct/, /one indirect/, /injection test set of `ai-evals`/,
      /before the rule loaded/],
    AIG5: [/\| Least privilege \|/, /needed for its task/],
    AIG6: [/\| Budget \|/, /cost, latency and tokens/, /largest session value, not the mean/],
  };
  for (const [id, patterns] of Object.entries(parts)) {
    const line = row(gate, id);
    assert.ok(line, `row ${id}`);
    for (const p of patterns) assert.match(line, p, id);
  }
  assert.match(gate, /A missing part, or a part that fails, is a rejection that cites the part ID/);
  assert.match(gate, /At `light`, the gate runs one time, at the end/);
});

test('QA runs the suite and attaches the report', () => {
  const text = body(QA);
  const line = text.split('\n').find((l) => l.startsWith('AI artifact:'));
  assert.ok(line, `${QA} has a line that starts with "AI artifact:"`);
  assert.match(line, /`claude plugin eval`/);
  assert.match(line, /attach its report/);
  for (const field of ['the scores', 'the tokens', 'the time', 'the eval model']) {
    assert.ok(line.includes(field), `the report names ${field}`);
  }
  assert.match(line, /API error is not a score/);
  assert.match(section(text, 'Output format'), /^AI eval report: /m);
});

test('the knowledge file has LLM01 to LLM10 and the risk area ai', () => {
  const ai = section(read(SECURITY), '6. AI artifacts');
  assert.ok(ai, `${SECURITY} has the section "## 6. AI artifacts"`);
  assert.match(ai, /^Risk area name: `ai`\.$/m);
  assert.match(ai, /https:\/\/genai\.owasp\.org\/llm-top-10\//);
  const names = ['Prompt Injection', 'Sensitive Information Disclosure', 'Supply Chain',
    'Data and Model Poisoning', 'Improper Output Handling', 'Excessive Agency', 'System Prompt Leakage',
    'Vector and Embedding Weaknesses', 'Misinformation', 'Unbounded Consumption'];
  names.forEach((name, i) => {
    const id = `LLM${String(i + 1).padStart(2, '0')}`;
    const lines = ai.split('\n').filter((l) => l.startsWith(`- ${id} ${name}: check `));
    assert.equal(lines.length, 1, `one line for ${id} ${name}`);
  });
});

test('the Reviewer body has 150 lines or fewer', () => {
  // Each line counts, also a blank line: stricter than the nonBlank count of the role tests.
  const lines = body(REVIEWER).replace(/\n$/, '').split('\n').length;
  assert.ok(lines <= 150, `${lines} lines`);
});
