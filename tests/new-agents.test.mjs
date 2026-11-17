import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintRules, lintModelNames } from '../scripts/lint-rules.mjs';
import { REPO_ROOT } from './helpers.mjs';

// The four agents of D42, D43 and D45 (S37). Normalize CRLF: a Windows checkout can have CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));
const nonBlank = (text) => text.split('\n').filter((l) => l.trim() !== '').length;
const TIERS = JSON.parse(read('core/tiers.json'));

// name → group, tools, rule ID prefix, and lead (a lead can disagree with the user, R27).
const AGENTS = {
  'devops-advisor': { group: 'engineering', tools: 'Read, Grep, Glob', prefix: 'DEV', lead: true },
  'ai-lead': { group: 'ai', tools: 'Read, Grep, Glob', prefix: 'AIL', lead: true },
  'architect-executor': {
    group: 'architect', tools: 'Read, Grep, Glob, Write, Edit, Bash', prefix: 'AEX', lead: false,
  },
  'coherence-validator': { group: 'architect', tools: 'Read, Grep, Glob', prefix: 'COH', lead: false },
};

/** Split a Markdown file into its frontmatter fields and its body. */
function parse(rel) {
  const m = read(rel).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
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

for (const [name, spec] of Object.entries(AGENTS)) {
  const rel = `agents/${name}.md`;

  test(`${name}: has name, description, model equal to tiers.json[master], a Tier line and its group`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    const { fields, body } = parse(rel);
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length > 40, 'description is present');
    assert.equal(fields.model, TIERS.master);
    assert.equal(body.match(/^Tier: (\w+)/m)?.[1], 'master');
    assert.equal(fields.group, spec.group);
  });

  test(`${name}: its tools list is ${spec.tools}`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    assert.equal(parse(rel).fields.tools, spec.tools);
  });

  test(`${name}: the body has the role sections in order and 150 lines or fewer`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    const { body } = parse(rel);
    assert.ok(nonBlank(body) <= 150, `${nonBlank(body)} lines`);
    const order = ['## Role', '## Does', '## Does not', '## Rules', '## Output format'].map((h) =>
      body.split('\n').indexOf(h),
    );
    for (const i of order) assert.ok(i > 0, `section found: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    const output = section(body, 'Output format');
    assert.match(output, /```[\s\S]*^Result: [\s\S]*```/m, 'the output format has a Result line');
    assert.match(body, /\bR27\b/);
    if (spec.lead) assert.match(body, /disagree with (the Architect or )?the user/i, 'a lead can disagree with the user');
    else assert.match(body, /objection to (the Architect|your lead)/i, 'a role sends an objection to its lead');
  });

  test(`${name}: lintRules(role rules) with prefix ${spec.prefix} is empty`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    const rules = section(parse(rel).body, 'Rules');
    assert.match(rules, new RegExp(`^### ${spec.prefix}1 — `, 'm'));
    assert.deepEqual(lintRules(rules, { prefix: spec.prefix }), []);
  });

  test(`${name}: lintModelNames is empty`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    assert.deepEqual(lintModelNames([path.join(REPO_ROOT, rel)]), []);
  });
}

test('coherence-validator and the two leads have no Write, Edit or Bash', () => {
  for (const name of ['coherence-validator', 'devops-advisor', 'ai-lead']) {
    const rel = `agents/${name}.md`;
    assert.ok(exists(rel), `${rel} exists`);
    const tools = parse(rel).fields.tools.split(/,\s*/);
    for (const t of ['Write', 'Edit', 'Bash']) assert.ok(!tools.includes(t), `${name} has ${t}`);
  }
});

test('evals/agents has a case folder for each agent, and the README has the threshold line', () => {
  assert.ok(exists('evals/agents/README.md'), 'evals/agents/README.md exists');
  assert.match(read('evals/agents/README.md'), /^Threshold: 0\.8$/m);
  const dir = path.join(REPO_ROOT, 'evals/agents');
  const cases = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const name of Object.keys(AGENTS)) {
    const mine = cases.filter((c) => c.startsWith(`${name}-`));
    assert.ok(mine.length >= 1, `${name} has a case: ${cases}`);
    for (const c of mine) {
      assert.ok(exists(`evals/agents/${c}/prompt.md`), `${c} has prompt.md`);
      const graders = fs.readdirSync(path.join(dir, c, 'graders')).filter((f) => f.endsWith('.md'));
      assert.ok(graders.length >= 1, `${c} has graders`);
    }
  }
});
