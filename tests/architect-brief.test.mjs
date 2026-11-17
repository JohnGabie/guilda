import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';
import { BRIEF_FIELDS, OPTIONAL_BRIEF_FIELDS, validateBrief } from '../scripts/lib/formats.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of the `## Brief format` section, up to the next `## ` heading. */
function briefSection() {
  const lines = SKILL.split('\n');
  const start = lines.indexOf('## Brief format');
  assert.ok(start >= 0, 'section Brief format exists');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The lines of the first code fence of the section. */
function template() {
  const m = briefSection().match(/```[^\n]*\n([\s\S]*?)\n```/);
  assert.ok(m, 'the section has a code fence');
  return m[1].split('\n');
}

const MARKER = /^# Optional/;

test('the template filled with sample values passes validateBrief', () => {
  const filled = template()
    .map((l) => (l.startsWith('Suggested tier:') ? 'Suggested tier: journeyman' : l.replace(/<[^>]*>/g, 'sample')))
    .join('\n');
  assert.deepEqual(validateBrief(filled), []);
});

test('the template has the 13 required names in the order of BRIEF_FIELDS', () => {
  const lines = template();
  const marker = lines.findIndex((l) => MARKER.test(l));
  assert.ok(marker > 0, 'the template has the optional marker');
  const names = lines.slice(0, marker).filter((l) => /^\S[^:]*:/.test(l)).map((l) => l.split(':')[0]);
  assert.deepEqual(names, BRIEF_FIELDS);
  assert.equal(BRIEF_FIELDS.length, 13);
});

test('each name of OPTIONAL_BRIEF_FIELDS is in the template', () => {
  const lines = template();
  const marker = lines.findIndex((l) => MARKER.test(l));
  assert.ok(marker > 0, 'the template has the optional marker');
  const below = lines.slice(marker + 1);
  for (const name of OPTIONAL_BRIEF_FIELDS) {
    assert.ok(below.some((l) => l.startsWith(`${name}:`)), `${name} is below the marker`);
  }
});

test('the text names task-start, review-package and Brief file:', () => {
  const s = briefSection();
  assert.ok(s.includes('task-start'));
  assert.ok(s.includes('--part N'));
  assert.ok(s.includes('review-package'));
  assert.ok(s.includes('Brief file:'));
  assert.match(s, /Base commit/);
  assert.match(s, /inside the project/);
});

test('the text names the reply language and the timeout', () => {
  const s = briefSection();
  assert.ok(s.includes('config.languages.replies'));
  assert.match(s, /timeout/);
  assert.match(s, /commit for each green item/);
});
