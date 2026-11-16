import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintRules } from '../scripts/lint-rules.mjs';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));
const nonBlank = (text) => text.split('\n').filter((l) => l.trim() !== '').length;
const TIERS = JSON.parse(read('core/tiers.json'));

const SKILL = 'skills/lab/SKILL.md';
const TEMPLATE = 'skills/lab/templates/report.md';
const AGENTS = {
  'lab-researcher': 'Read, Grep, Glob, WebSearch, WebFetch',
  'lab-reader': 'Read, Grep, Glob',
  'lab-experimenter': 'Read, Grep, Glob, Bash, Write, Edit',
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

test('the skill has name lab, a Use when description and groups [architect]', () => {
  assert.ok(exists(SKILL), `${SKILL} exists`);
  const { fields } = parse(SKILL);
  assert.equal(fields.name, 'lab');
  assert.match(fields.description, /^Use when /);
  assert.equal(fields.groups, '[architect]');
  assert.equal(fields['user-invocable'], 'false');
});

test('the skill says to dispatch an agent and cites R26', () => {
  const { body } = parse(SKILL);
  assert.match(body, /\bR26\b/);
  assert.match(body, /Agent tool/);
  assert.match(body, /guilda:lab-(researcher|reader|experimenter)/);
  assert.match(body, /never in the controller/i);
  assert.match(body, /docs\/labs\/<date>-<name>\.md/);
  assert.match(body, /NO-GO/);
  assert.match(body, /MORE DATA/);
});

test('the template has the eight parts of D34 in order, and the header line names the agent ID', () => {
  assert.ok(exists(TEMPLATE), `${TEMPLATE} exists`);
  const lines = read(TEMPLATE).split('\n');
  const idx = (re) => lines.findIndex((l) => re.test(l));
  const order = [
    idx(/^# Lab: /),
    idx(/^Date: .*Branch: .*Spec: .*Agent ID: .*Model: .*Account: /),
    idx(/^## Hypothesis$/),
    idx(/^## PASS criteria \(written before the run\)$/),
    idx(/^## Method$/),
    idx(/^## Evidence$/),
    idx(/^## Not verified$/),
    idx(/^## Verdict$/),
    idx(/^## Lessons$/),
  ];
  for (const i of order) assert.ok(i >= 0, `part found: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const comments = read(TEMPLATE).match(/<!--[\s\S]*?-->/g) ?? [];
  assert.equal(comments.length, 1);
  assert.match(comments[0], /superpowers 7\.0\.0/);
  assert.match(comments[0], /MIT/);
});

for (const [name, tools] of Object.entries(AGENTS)) {
  const rel = `agents/${name}.md`;

  test(`${name}: has name, description, model equal to tiers.json[master], a Tier line, group: lab and its tools list`, () => {
    assert.ok(exists(rel), `${rel} exists`);
    const { fields, body } = parse(rel);
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length > 40);
    assert.equal(fields.model, TIERS.master);
    assert.equal(body.match(/^Tier: (\w+)/m)?.[1], 'master');
    assert.equal(fields.group, 'lab');
    assert.equal(fields.tools, tools);
  });

  test(`${name}: the body has the role sections in order and 150 lines or fewer`, () => {
    const { body } = parse(rel);
    assert.ok(nonBlank(body) <= 150);
    const order = ['## Role', '## Does', '## Does not', '## Rules', '## Output format'].map((h) =>
      body.split('\n').indexOf(h),
    );
    for (const i of order) assert.ok(i > 0, `section found: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(section(body, 'Output format'), /```/);
    assert.match(body, /\bR27\b/);
    assert.match(section(body, 'Output format'), /Agent ID:/);
  });

  test(`${name}: lintRules(role rules) with prefix LAB is empty`, () => {
    const rules = section(parse(rel).body, 'Rules');
    assert.match(rules, /^### LAB1 — /m);
    assert.deepEqual(lintRules(rules, { prefix: 'LAB' }), []);
  });
}

test('lab-reader has no Write, Edit or Bash', () => {
  const tools = parse('agents/lab-reader.md').fields.tools.split(/,\s*/);
  for (const t of ['Write', 'Edit', 'Bash']) assert.ok(!tools.includes(t), t);
});

test('evals/lab has 5 case folders for each of the four artifacts, and the README has the threshold line', () => {
  const dir = path.join(REPO_ROOT, 'evals/lab');
  assert.ok(fs.existsSync(dir), 'evals/lab exists');
  const cases = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const artifact of ['lab', 'lab-researcher', 'lab-reader', 'lab-experimenter']) {
    const mine = cases.filter((c) => {
      if (!c.startsWith(`${artifact}-`)) return false;
      // `lab-` also prefixes the agent names, so the skill owns only the other folders.
      return artifact !== 'lab' || !/^lab-(researcher|reader|experimenter)-/.test(c);
    });
    assert.equal(mine.length, 5, `${artifact} has 5 cases: ${mine}`);
    for (const c of mine) {
      assert.ok(exists(`evals/lab/${c}/prompt.md`), `${c} has prompt.md`);
      const graders = fs.readdirSync(path.join(dir, c, 'graders')).filter((f) => f.endsWith('.md'));
      assert.ok(graders.length >= 1, `${c} has graders`);
    }
  }
  assert.match(read('evals/lab/README.md'), /^Threshold: 0\.8$/m);
});
