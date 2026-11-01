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

// name → expected tier, tools (undefined = inherit) and rule ID prefix.
const AGENTS = {
  executor: { tier: 'journeyman', tools: undefined, prefix: 'EXE' },
  reviewer: { tier: 'master', tools: 'Read, Grep, Glob, Bash', prefix: 'REV' },
  qa: { tier: 'journeyman', tools: undefined, prefix: 'QA' },
  'version-control': { tier: 'journeyman', tools: 'Read, Grep, Glob, Bash', prefix: 'VC' },
  security: { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'SEC' },
};
const SKILL = 'skills/architect/SKILL.md';
const KNOWLEDGE = ['core/knowledge/security.md', 'core/knowledge/qa.md'];
const TIERS = JSON.parse(read('core/tiers.json'));

/** Split a Markdown file into its frontmatter fields and its body. */
function parse(rel) {
  const text = read(rel);
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${rel} has frontmatter`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    const f = line.match(/^([\w-]+):\s*(.*)$/);
    if (f) fields[f[1]] = f[2].trim();
  }
  return { fields, body: m[2] };
}

/** Text of a `## <title>` section, up to the next `## ` heading. */
function section(body, title) {
  const lines = body.split('\n');
  const start = lines.indexOf(`## ${title}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** Lines of the first fenced block in a text. */
function fence(text) {
  const m = text?.match(/```[^\n]*\n([\s\S]*?)\n```/);
  return m ? m[1].split('\n') : null;
}

const agentFile = (name) => `agents/${name}.md`;

for (const [name, spec] of Object.entries(AGENTS)) {
  const rel = agentFile(name);

  test(`${name}: has name, description, model`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    const { fields } = parse(rel);
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length > 40, 'description is present');
    assert.ok(fields.model, 'model is present');
  });

  test(`${name}: model equals tiers.json[tier]`, () => {
    const { fields, body } = parse(rel);
    const tier = body.match(/^Tier: (\w+)/m)?.[1];
    assert.equal(tier, spec.tier);
    assert.equal(fields.model, TIERS[tier]);
  });

  test(`${name}: tools are least privilege`, () => {
    assert.equal(parse(rel).fields.tools, spec.tools);
  });

  test(`${name}: body has 150 lines or fewer`, () => {
    assert.ok(nonBlank(parse(rel).body) <= 150);
  });

  test(`${name}: body has the role sections in order`, () => {
    const { body } = parse(rel);
    const order = ['## Role', '## Does', '## Does not', '## Rules', '## Output format'].map((h) =>
      body.split('\n').indexOf(h),
    );
    for (const i of order) assert.ok(i > 0, `section found: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(fence(section(body, 'Output format')), 'Output format has a fenced block');
  });

  test(`${name}: lintRules(role rules) is empty`, () => {
    const rules = section(parse(rel).body, 'Rules');
    assert.match(rules, new RegExp(`^### ${spec.prefix}1 — `, 'm'));
    assert.deepEqual(lintRules(rules, { prefix: spec.prefix }), []);
  });
}

test('lintModelNames(agents, skill, knowledge) is empty', () => {
  const files = [...Object.keys(AGENTS).map(agentFile), SKILL, ...KNOWLEDGE].map((r) => path.join(REPO_ROOT, r));
  assert.deepEqual(lintModelNames(files), []);
});

function verdictLines(name) {
  const lines = fence(section(parse(agentFile(name)).body, 'Output format'));
  return lines.map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
}

test('reviewer output format has the Result and Violations lines', () => {
  const lines = verdictLines('reviewer');
  assert.equal(lines[0], 'Result: APPROVED | REJECTED-SMALL | REJECTED-LARGE');
  assert.equal(lines.at(-1), 'Violations: <comma-separated rule IDs | none>');
});

test('security output format has the Result and Violations lines', () => {
  const lines = verdictLines('security');
  assert.equal(lines[0], 'Result: APPROVED | REJECTED');
  assert.equal(lines.at(-1), 'Violations: <comma-separated rule IDs | none>');
});

test('security tools exclude Write and Edit', () => {
  const tools = parse(agentFile('security')).fields.tools.split(/,\s*/);
  assert.ok(!tools.includes('Write') && !tools.includes('Edit'));
});

test('QA output format follows Ruling Q', () => {
  const lines = fence(section(parse(agentFile('qa')).body, 'Output format'));
  const start = lines.findIndex((l) => l.trim() === 'Scenarios:');
  assert.ok(start >= 0, 'has a Scenarios: section');
  const scenarios = lines.slice(start + 1).filter((l) => /^\s+\d+\. /.test(l));
  assert.ok(scenarios.length >= 3);
  const results = scenarios.map((l) => l.match(/ (PASSED|FAILED|NOT VERIFIED) — \S/)?.[1]);
  assert.deepEqual([...new Set(results)].sort(), ['FAILED', 'NOT VERIFIED', 'PASSED']);
  for (const l of scenarios.filter((s) => / NOT VERIFIED — /.test(s))) assert.match(l, /Not verified because: \S/);
});

test('architect skill has name and description frontmatter', () => {
  assert.ok(exists(SKILL));
  const { fields } = parse(SKILL);
  assert.equal(fields.name, 'architect');
  assert.match(fields.description, /^Use when /);
});

test('architect brief template has the 12 Ruling B fields, one line each', () => {
  const body = parse(SKILL).body;
  const lines = fence(section(body, 'Brief format'));
  const names = lines.filter((l) => /^\S[^:]*:/.test(l)).map((l) => l.split(':')[0]);
  assert.deepEqual(names, ['ID / title', 'Goal', 'Context', 'Out of scope', 'Files it may touch',
    'Contract / interfaces', 'Tests that must pass', 'Acceptance', 'Suggested tier', 'Risk area', 'Deletion rules',
    'Dependencies']);
  assert.ok(lines.includes('Suggested tier: master | journeyman | apprentice'));
});

test('architect skill rules pass lintRules with prefix ARC', () => {
  const rules = section(parse(SKILL).body, 'Rules');
  assert.match(rules, /^### ARC1 — /m);
  assert.deepEqual(lintRules(rules, { prefix: 'ARC' }), []);
});

test('architect skill names the dispatch model and the Security switch', () => {
  const body = parse(SKILL).body;
  assert.match(body, /config\.tiers\[/);
  assert.match(body, /config\.security\.enabled/);
  for (const tag of ['@decided', '@proposed', '@open']) assert.ok(body.includes(tag), tag);
});

test('reviewer and architect hold the definition-of-done table (R23)', () => {
  for (const rel of [agentFile('reviewer'), SKILL]) {
    const dod = section(parse(rel).body, 'Definition of done');
    assert.ok(dod, `${rel} has a Definition of done section`);
    for (const row of [/^\| Typo, formatting or docs/m, /^\| Code without a spec/m, /^\| Feature/m]) {
      assert.match(dod, row, rel);
    }
  }
});

test('knowledge files cite sources and keep out project application', () => {
  for (const rel of KNOWLEDGE) {
    const text = read(rel);
    assert.match(text, /https:\/\//, rel);
    assert.doesNotMatch(text, /how it applies|HealthAurora|patient|Asaas/i, rel);
  }
});
