import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of the `## Writing a spec` section, up to the next `## ` heading. */
function specSection() {
  const lines = SKILL.split('\n');
  const start = lines.indexOf('## Writing a spec');
  assert.ok(start >= 0, 'section Writing a spec exists');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

test('the security zone part has the line, the risk area, the brief and the review', () => {
  const s = specSection();
  assert.ok(s.includes('Security zone: <risk area>'));
  assert.match(s, /directly under the heading/);
  assert.match(s, /config\.security\.riskAreas/);
  assert.match(s, /login, secrets, user data/);
  assert.match(s, /`Risk area:` is not `none`/);
  assert.match(s, /Security review at each process level/);
  assert.match(s, /security-zones/);
});

test('the scenario part has Given, When, Then, Tool and Test', () => {
  const s = specSection();
  for (const w of ['Given', 'When', 'Then', 'Tool', 'Test']) assert.ok(s.includes(w), w);
  assert.match(s, /exact result/);
});

test('the glossary part names GLOSSARY.md', () => {
  assert.ok(specSection().includes('docs/superpowers/specs/GLOSSARY.md'));
  assert.ok(specSection().includes('GLOSSARY.md'));
});

test('the builder check reads the spec cold and sorts each guess', () => {
  const s = specSection();
  assert.ok(s.includes('reads the spec cold'));
  assert.ok(s.includes('answered, minor or the user'));
  assert.match(s, /before the approval step/i);
});

test('a ruling that changes behavior enters the spec in the same step', () => {
  const s = specSection();
  assert.ok(s.includes('in the same step'));
  assert.match(s, /unique in a project/);
});

test('the skill lines name when, who, where and what', () => {
  const s = specSection();
  assert.ok(s.includes('when, who, where and what'));
  assert.match(s, /no line is not used/);
});
