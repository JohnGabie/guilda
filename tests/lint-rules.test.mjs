import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintRules, lintModelNames } from '../scripts/lint-rules.mjs';
import { tempProject } from './helpers.mjs';

const block = ({
  id = 'R1',
  title = 'Spec before code',
  rule = 'Do not write product code before the user approves the spec.',
  why = 'Code from an unapproved spec builds the wrong thing.',
  check = 'gate — The Reviewer rejects the work.',
} = {}) => `### ${id} — ${title}\nRule:  ${rule}\nWhy:   ${why}\nCheck: ${check}\n`;

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('accepts a good block', () => {
  assert.deepEqual(lintRules(`# Rules\n\n${block()}\n${block({ id: 'R2' })}`, { prefix: 'R' }), []);
});

test('accepts a 20-word Rule', () => {
  assert.deepEqual(lintRules(block({ rule: `${words(20)}.` }), { prefix: 'R' }), []);
});

test('rejects a 21-word Rule', () => {
  const errors = lintRules(block({ rule: `${words(21)}.` }), { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /R1.*21 words/);
});

test('rejects a Rule with two sentences', () => {
  const errors = lintRules(block({ rule: 'Read the spec. Run the tests.' }), { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /R1.*Rule.*one sentence/);
});

test('rejects a Why with two sentences', () => {
  const errors = lintRules(block({ why: 'It fails. It costs time.' }), { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /R1.*Why.*one sentence/);
});

test('ignores periods inside inline code', () => {
  assert.deepEqual(lintRules(block({ rule: 'Write the plan in `docs/x.md. y` as a section.' }), { prefix: 'R' }), []);
});

test('rejects a duplicate ID', () => {
  const errors = lintRules(`${block()}\n${block()}`, { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate.*R1/);
});

test('rejects an unknown level', () => {
  const errors = lintRules(block({ check: 'hook — PreToolUse refuses it.' }), { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /R1.*level/);
});

test('rejects a Check without a mechanism', () => {
  assert.equal(lintRules(block({ check: 'gate' }), { prefix: 'R' }).length, 1);
});

test('rejects a block with a missing line', () => {
  const text = '### R1 — Spec before code\nRule:  Do the thing.\nCheck: gate — The Reviewer rejects it.\n';
  assert.ok(lintRules(text, { prefix: 'R' }).length >= 1);
});

test('rejects a heading with the wrong prefix', () => {
  const errors = lintRules(block({ id: 'P1' }), { prefix: 'R' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /P1/);
});

test('accepts a project prefix', () => {
  assert.deepEqual(lintRules(block({ id: 'P1' }), { prefix: 'P' }), []);
});

test('rejects a Rule line outside a block', () => {
  assert.equal(lintRules('# Rules\n\nRule:  Do the thing.\n', { prefix: 'R' }).length, 1);
});

function writeFile(dir, rel, text) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

test('flags a model name in a role body', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'agents/reviewer.md', '---\nname: reviewer\nmodel: opus\n---\nUse Sonnet for this.\n');
  const errors = lintModelNames([file]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reviewer\.md:5/);
});

test('allows model: in frontmatter', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'agents/executor.md', '---\nname: executor\nmodel: sonnet\n---\nWrite the code.\n');
  assert.deepEqual(lintModelNames([file]), []);
});

test('flags a model: line outside frontmatter', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'agents/qa.md', '---\nname: qa\n---\nmodel: haiku\n');
  assert.equal(lintModelNames([file]).length, 1);
});

test('flags a full model ID', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'core/notes.md', 'Pin the ID claude-x-1 here.\n');
  assert.equal(lintModelNames([file]).length, 1);
});

test('allows model names in core/tiers.json', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'core/tiers.json', '{ "master": "opus", "apprentice": "haiku" }\n');
  assert.deepEqual(lintModelNames([file]), []);
});

test('does not flag the .claude-plugin folder name', () => {
  const dir = tempProject();
  const file = writeFile(dir, 'README.md', 'Raise the version in `.claude-plugin/plugin.json`.\n');
  assert.deepEqual(lintModelNames([file]), []);
});
