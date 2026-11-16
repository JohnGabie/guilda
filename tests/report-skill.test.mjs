import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scanText } from '../scripts/lib/scan.mjs';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

const SKILL = 'skills/report/SKILL.md';
const COPIES = [
  'skills/report/references/redaction-policy.md',
  'skills/report/prompts/scrub.md',
  'skills/report/prompts/scrub-audit.md',
  'skills/report/templates/issue.md',
  'skills/report/templates/case.md',
];
const CREDIT = '<!-- Adapted from superpowers 7.0.0 (MIT, Copyright (c) 2025 Jesse Vincent). -->';

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

function skillFiles() {
  const out = [SKILL];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  if (exists('skills/report')) walk('skills/report');
  return [...new Set(out)];
}

test('the skill has name report and a Use when description', () => {
  assert.ok(exists(SKILL), `${SKILL} exists`);
  const { fields } = parse(SKILL);
  assert.equal(fields.name, 'report');
  assert.match(fields.description, /^Use when /);
});

test('the skill names report-send.mjs and never gh issue create', () => {
  const text = read(SKILL);
  assert.match(text, /scripts\/report-send\.mjs/);
  assert.match(text, /--type/);
  assert.doesNotMatch(text, /gh issue create/);
  assert.doesNotMatch(text, /\bgh (issue|api|pr)\b/);
  assert.doesNotMatch(text, /--repo/);
});

test('the skill asks for a yes for each field', () => {
  const text = read(SKILL);
  assert.match(text, /each field/i);
  assert.match(text, /AskUserQuestion/);
  assert.match(text, /\byes\b/i);
  assert.match(text, /scrub-audit\.md/);
  assert.match(text, /scrub\.md/);
  assert.match(text, /templates\/case\.md/);
  assert.match(text, /redaction-policy\.md/);
  assert.match(text, /whole file/i);
});

test('the five copies exist, and each one has the credit comment', () => {
  for (const rel of COPIES) {
    assert.ok(exists(rel), `${rel} exists`);
    const lines = read(rel).split('\n');
    assert.match(lines[0], /^# \S/, `${rel} line 1 is the title`);
    assert.equal(lines[1], CREDIT, `${rel} line 2 is the credit comment`);
  }
});

test('no copy names superpowers outside the credit comment', () => {
  for (const rel of COPIES) {
    const text = read(rel).split(CREDIT).join('');
    assert.doesNotMatch(text, /superpowers/i, `${rel} names superpowers`);
  }
});

test('no file of the skill has an R19 hit', () => {
  const files = skillFiles();
  assert.ok(files.length >= 6, 'the skill has its six files');
  for (const rel of files) {
    assert.deepEqual(scanText(read(rel)), [], `${rel} has an R19 hit`);
  }
});
