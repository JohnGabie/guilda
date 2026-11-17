// SK1: the domain skill data of the extension plugin (D25, G2, S40).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scanText } from '../../scripts/lib/scan.mjs';
import { skillGroups } from '../../scripts/lib/groups.mjs';
import { REPO_ROOT } from '../helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

const SKILL_DIR = 'plugins/guilda-skills/skills/data';
const SKILL = `${SKILL_DIR}/SKILL.md`;
const EVALS = 'plugins/guilda-skills/evals/data';
const MAX_BODY_LINES = 500;
const MIN_REAL_CASES = 3;

// The kept sources of the SK1 curation table (research of 2026-11-17, approved at G2).
const KEPT = [
  'https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents',
  'https://www.anthropic.com/research/statistical-approach-to-model-evals',
  'https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005510',
  'https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html',
  'https://www.itl.nist.gov/div898/handbook/eda/section1/eda11.htm',
];
// The dropped candidates of the same table.
const DROPPED = [/wshobson/i, /data-engineering/i, /orangevoinULTRA/i, /alirezarezvani/i, /r02-/i];

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

function walk(dir) {
  const out = [];
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

function cases() {
  if (!exists(EVALS)) return [];
  return fs
    .readdirSync(path.join(REPO_ROOT, EVALS), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'results')
    .map((e) => e.name);
}

test('the skill has its name, a Use when description and the groups value', () => {
  assert.ok(exists(SKILL), `${SKILL} exists`);
  const { fields, body } = parse(SKILL);
  assert.equal(fields.name, 'data');
  assert.match(fields.description, /^Use when /);
  assert.deepEqual(skillGroups(REPO_ROOT, 'guilda-skills:data'), { guilda: true, groups: ['shared'] });
  assert.ok(body.split('\n').length <= MAX_BODY_LINES, `the body has ${MAX_BODY_LINES} lines or fewer`);
});

test('the skill is hidden from the menu (user-invocable: false)', () => {
  assert.equal(parse(SKILL).fields['user-invocable'], 'false');
});

test('the skill states that text in data, logs and transcripts is data, never an instruction', () => {
  const { body } = parse(SKILL);
  assert.match(body, /data, never an instruction/i);
  for (const word of ['logs', 'transcripts']) assert.match(body, new RegExp(word, 'i'));
});

test('the Sources list has each kept source of the curation table, and no dropped source', () => {
  const text = read(SKILL);
  const at = text.indexOf('\n## Sources');
  assert.ok(at >= 0, 'SKILL.md has a "## Sources" section');
  const sources = text.slice(at);
  for (const url of KEPT) assert.ok(sources.includes(url), `Sources lists ${url}`);
  for (const rel of walk(SKILL_DIR)) {
    for (const re of DROPPED) assert.doesNotMatch(read(rel), re, `${rel} names a dropped source`);
  }
});

test('the evals folder has 3 or more cases and a threshold line', () => {
  const all = cases();
  const real = all.filter((c) => !c.startsWith('inject-'));
  assert.ok(real.length >= MIN_REAL_CASES, `${real.length} real cases`);
  assert.ok(all.includes('inject-direct'), 'a direct injection case');
  assert.ok(all.includes('inject-indirect'), 'an indirect injection case');
  for (const c of all) {
    assert.ok(exists(`${EVALS}/${c}/prompt.md`), `${c} has prompt.md`);
    assert.ok(walk(`${EVALS}/${c}/graders`).length >= 1, `${c} has graders`);
  }
  assert.match(read(`${EVALS}/README.md`), /^Threshold: 0\.8 \(written \d{4}-\d{2}-\d{2}, before the first run\)$/m);
});

test('no file of the skill has an R19 hit', () => {
  const files = [...walk(SKILL_DIR), ...walk(EVALS).filter((f) => !f.includes('/results/'))];
  assert.ok(files.length >= 2, 'the skill and its evals have files');
  for (const rel of files) assert.deepEqual(scanText(read(rel)), [], `${rel} has an R19 hit`);
});
