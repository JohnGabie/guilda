import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { steCheck, parseGlossary, checkScope, DEFAULT_VAGUE } from '../scripts/lib/ste.mjs';
import { REPO_ROOT, tempProject } from './helpers.mjs';

const OPTS = { glossary: [], vague: DEFAULT_VAGUE };
const words = (n) => Array.from({ length: n }, (_, i) => `word${i + 1}`).join(' ');

test('21-word list step -> long-sentence', () => {
  const found = steCheck(`Intro.\n\n- ${words(21)}.\n`, OPTS);
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[3, 'long-sentence']]);
  assert.match(found[0].detail, /21 words/);
});

test('20-word numbered step -> no finding', () => {
  assert.deepEqual(steCheck(`1. ${words(20)}.\n`, OPTS), []);
});

test('25-word description -> no finding', () => {
  assert.deepEqual(steCheck(`${words(25)}.\n`, OPTS), []);
});

test('26-word description -> long-sentence', () => {
  const found = steCheck(`${words(26)}.\n`, OPTS);
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[1, 'long-sentence']]);
  assert.match(found[0].detail, /26 words/);
});

test('a sentence that wraps over two lines is one sentence on its first line', () => {
  const found = steCheck(`Short one.\n${words(15)}\n${words(15)}.\n`, OPTS);
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[2, 'long-sentence']]);
});

test('code fence is skipped', () => {
  const md = '```js\n// handle the ticket ' + words(40) + '\n```\n';
  assert.deepEqual(steCheck(md, { glossary: [{ term: 'brief', forbidden: ['ticket'] }], vague: DEFAULT_VAGUE }), []);
});

test('inline code, tables, headings, links and frontmatter are skipped', () => {
  const md = [
    '---',
    `description: handle ${words(30)}`,
    '---',
    `# Handle ${words(30)}`,
    '',
    `| handle | ${words(30)} |`,
    '',
    'Use `handle` here, see [handle it](https://example.com/handle).',
  ].join('\n');
  assert.deepEqual(steCheck(md, OPTS), []);
});

test('"handle" -> vague-word', () => {
  const found = steCheck('Line one.\nThe hook must handle errors.\n', OPTS);
  assert.deepEqual(found.map((f) => [f.line, f.kind, f.detail]), [[2, 'vague-word', '"handle"']]);
});

test('vague phrase in Portuguese -> vague-word', () => {
  const found = steCheck('O agente deve lidar com o erro.\n', OPTS);
  assert.deepEqual(found.map((f) => f.kind), ['vague-word']);
});

test('vague word inside a longer word -> no finding', () => {
  assert.deepEqual(steCheck('The handler returns 404.\n', OPTS), []);
});

test('glossary forbidden word -> forbidden-word', () => {
  const glossary = [{ term: 'brief', forbidden: ['ticket', 'assignment'] }];
  const found = steCheck('Send the Ticket to the Executor.\n', { glossary, vague: [] });
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[1, 'forbidden-word']]);
  assert.match(found[0].detail, /"ticket".*"brief"/i);
});

test('forbidden word inside a glossary definition line -> no finding', () => {
  const glossary = parseGlossary('- **brief**: the task text. Forbidden: ticket, assignment.\n');
  assert.deepEqual(steCheck('- **brief**: the task text. Forbidden: ticket, assignment.\n', { glossary, vague: [] }), []);
});

test('detail never longer than 60 characters', () => {
  const long = 'x'.repeat(200);
  const glossary = [{ term: long, forbidden: ['ticket'] }];
  const found = steCheck(`Send the ticket now.\n\n${words(90)}.\n`, { glossary, vague: [] });
  assert.equal(found.length, 2);
  for (const f of found) assert.ok(f.detail.length <= 60, f.detail);
});

test('parseGlossary reads the core/glossary.md format', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'core', 'glossary.md'), 'utf8');
  const glossary = parseGlossary(text);
  assert.equal(glossary.length, 11);
  assert.deepEqual(glossary[0], { term: 'brief', forbidden: ['ticket', 'assignment'] });
});

test('checkScope: .md checked; .ts, .journal and writing.free skipped', () => {
  const config = { writing: { free: ['docs/blog/**'], exceptions: [] } };
  assert.equal(checkScope('docs/a.md', config).check, true);
  assert.equal(checkScope('src/a.ts', config).check, false);
  assert.equal(checkScope('.journal/2026-11-01.md', config).check, false);
  assert.equal(checkScope('docs/blog/post.md', config).check, false);
});

test('checkScope: exception with a level other than full -> skipped with the reason', () => {
  const config = {
    writing: { free: [], exceptions: [{ docType: 'docs/marketing/**', level: '80%', reason: 'sales text' }] },
  };
  assert.deepEqual(checkScope('docs/marketing/a.md', config), { check: false, reason: 'sales text' });
  const full = { writing: { free: [], exceptions: [{ docType: 'docs/**', level: 'full', reason: 'x' }] } };
  assert.equal(checkScope('docs/a.md', full).check, true);
});

test('CLI prints <file>:<line> <kind> <detail> and exits 1 on a finding', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'a.md'), 'We handle it.\n');
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'ste-check.mjs'), 'a.md'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), 'a.md:1 vague-word "handle"');
});

test('CLI exits 0 when no finding', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'a.md'), 'The hook returns 404.\n');
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'ste-check.mjs'), 'a.md'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
