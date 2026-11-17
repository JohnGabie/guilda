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
  executor: { tier: 'journeyman', tools: undefined, prefix: 'EXE', group: ['engineering'] },
  reviewer: { tier: 'master', tools: 'Read, Grep, Glob, Bash', prefix: 'REV', group: ['engineering', 'architect'] },
  qa: { tier: 'journeyman', tools: undefined, prefix: 'QA', group: ['engineering'] },
  'version-control': { tier: 'journeyman', tools: 'Read, Grep, Glob, Bash', prefix: 'VC', group: ['engineering'] },
  security: { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'SEC', group: ['security'] },
  'lab-researcher': {
    tier: 'master', tools: 'Read, Grep, Glob, WebSearch, WebFetch', prefix: 'LAB', group: ['lab'],
  },
  'lab-reader': { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'LAB', group: ['lab'] },
  'lab-experimenter': {
    tier: 'master', tools: 'Read, Grep, Glob, Bash, Write, Edit', prefix: 'LAB', group: ['lab'],
  },
  'devops-advisor': { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'DEV', group: ['engineering'] },
  'ai-lead': { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'AIL', group: ['ai'] },
  // T24: Bash removed from the tools of architect-executor.
  'architect-executor': {
    tier: 'master', tools: 'Read, Grep, Glob, Write, Edit', prefix: 'AEX', group: ['architect'],
  },
  'coherence-validator': { tier: 'master', tools: 'Read, Grep, Glob', prefix: 'COH', group: ['architect'] },
};
const SKILL = 'skills/architect/SKILL.md';
const KNOWLEDGE = ['core/knowledge/security.md', 'core/knowledge/qa.md'];
const TIERS = JSON.parse(read('core/tiers.json'));

/** A value `[a, b]` is a list; any other value is a string. */
const parseValue = (v) => (/^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean) : v);

/** Split a Markdown file into its frontmatter fields and its body. */
function parse(rel) {
  const text = read(rel);
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${rel} has frontmatter`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    const f = line.match(/^([\w-]+):\s*(.*)$/);
    if (f) fields[f[1]] = parseValue(f[2].trim());
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

  test(`${name}: has its group`, () => {
    const g = parse(rel).fields.group;
    assert.deepEqual(Array.isArray(g) ? g : [g], spec.group);
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
    const out = section(body, 'Output format');
    // A lab report form holds `## ` headings inside its fence, so the section text stops at the first one.
    if (spec.group.includes('lab')) assert.match(out, /^```/m, 'Output format opens a fenced block');
    else assert.ok(fence(out), 'Output format has a fenced block');
  });

  test(`${name}: lintRules(role rules) is empty`, () => {
    const rules = section(parse(rel).body, 'Rules');
    assert.match(rules, new RegExp(`^### ${spec.prefix}1 — `, 'm'));
    assert.deepEqual(lintRules(rules, { prefix: spec.prefix }), []);
  });
}

test('no agent definition of agents/ is outside the AGENTS map', () => {
  const files = fs.readdirSync(path.join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), Object.keys(AGENTS).sort());
});

test('ai-lead and devops-advisor each have a tools list', () => {
  for (const name of ['ai-lead', 'devops-advisor']) assert.ok(parse(agentFile(name)).fields.tools, name);
});

test('each skill of skills/ has a groups field, and its value is [architect] (S37, section 3e)', () => {
  const dirs = fs.readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.deepEqual(dirs.map((d) => d.name).sort(), ['architect', 'init', 'lab', 'report', 'update']);
  for (const d of dirs) {
    assert.deepEqual(parse(`skills/${d.name}/SKILL.md`).fields.groups, ['architect'], d.name);
  }
});

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

test('architect brief template has the 13 Ruling B fields, one line each', () => {
  const body = parse(SKILL).body;
  const all = fence(section(body, 'Brief format'));
  const marker = all.findIndex((l) => l.startsWith('# Optional'));
  const lines = marker < 0 ? all : all.slice(0, marker);
  const names = lines.filter((l) => /^\S[^:]*:/.test(l)).map((l) => l.split(':')[0]);
  assert.deepEqual(names, ['ID / title', 'Goal', 'Context', 'Out of scope', 'Files it may touch',
    'Contract / interfaces', 'Tests that must pass', 'Acceptance', 'Suggested tier', 'Risk area', 'Deletion rules',
    'Dependencies', 'Base commit']);
  assert.ok(lines.includes('Suggested tier: master | journeyman | apprentice'));
});

test('architect skill rules pass lintRules with prefix ARC', () => {
  const rules = section(parse(SKILL).body, 'Rules');
  assert.match(rules, /^### ARC1 — /m);
  assert.deepEqual(lintRules(rules, { prefix: 'ARC' }), []);
});

test('the Architect skill has ARC1 to ARC10, each heading one time (S15)', () => {
  const rules = section(parse(SKILL).body, 'Rules');
  for (let n = 1; n <= 10; n++) {
    const heads = rules.split('\n').filter((l) => l.startsWith(`### ARC${n} — `));
    assert.equal(heads.length, 1, `ARC${n} has one heading`);
  }
  for (const key of ['Rule:', 'Why:', 'Check:']) {
    assert.equal(rules.split('\n').filter((l) => l.startsWith(key)).length, 10, `ten ${key} lines`);
  }
});

test('ARC1 names the question tool', () => {
  const rules = section(parse(SKILL).body, 'Rules');
  const block = rules.match(/^### ARC1 — [\s\S]*?(?=^### ARC2 — )/m)[0];
  assert.match(block, /question tool/);
  assert.match(parse(SKILL).body, /Ask each decision alone in the question tool \(ARC1\)/);
});

test('step 9 names <feature>.plan.md', () => {
  const body = parse(SKILL).body;
  const step = body.match(/^9\. [\s\S]*?(?=^10\. )/m)[0];
  assert.match(step, /<feature>\.plan\.md/);
  assert.match(step, /At `full`, one task is one cycle \(R24\)/);
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
