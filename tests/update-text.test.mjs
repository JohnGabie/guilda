import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'update', 'SKILL.md'), 'utf8');
const description = text.match(/^description: (.*)$/m)?.[1] ?? '';

test('the skill has its name and a Use when description', () => {
  assert.match(text, /^name: update$/m);
  assert.match(description, /^Use when /);
});

test('the description has the Run guilda:update trigger', () => {
  assert.match(description, /a session notice says "Run guilda:update"/);
});

test('no step says to run guilda:init again', () => {
  assert.doesNotMatch(text, /guilda:init/);
});

test('the last step names config-write.mjs --migrate and the yes of the user', () => {
  const steps = text.split(/^\d+\. \*\*/m);
  const last = steps[steps.length - 1];
  assert.match(last, /config-write\.mjs/);
  assert.match(last, /--migrate/);
  assert.match(last, /question tool/);
  assert.match(last, /\byes\b/);
  assert.match(last, /migrate refused:/);
});

test('update offers usage.source cswap and writes it only after a yes', () => {
  const steps = text.split(/^\d+\. \*\*/m);
  const last = steps[steps.length - 1];
  assert.match(last, /usage\.source/);
  assert.match(last, /"cswap"/);
  const ask = last.search(/question tool[^\n]*usage\.source|usage\.source[^\n]*question tool/);
  assert.ok(ask >= 0, 'the offer goes through the question tool');
  const write = last.search(/On a yes[^\n]*usage\.source|usage\.source[^\n]*only after a yes/i);
  assert.ok(write > ask, 'the write comes after the question');
  assert.match(last, /same bytes/);
  assert.doesNotMatch(text, /AGENTS\.md/);
});
