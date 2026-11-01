import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appendViolation, countViolations } from '../scripts/lib/violations.mjs';
import { tempProject } from './helpers.mjs';

const V = { rule: 'R1', level: 'gate', source: 'hook', action: 'blocked' };

test('appendViolation writes one line without content fields', () => {
  const dir = tempProject({ git: true });
  appendViolation(dir, { ...V, content: 'secret', file: 'a.txt' });
  const lines = fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(rec).sort(), ['action', 'branch', 'level', 'rule', 'source', 'ts']);
  assert.equal(rec.rule, 'R1');
  assert.ok(!Number.isNaN(Date.parse(rec.ts)));
  assert.equal(typeof rec.branch, 'string');
});

test('appendViolation records unknown branch outside a repository', () => {
  const dir = tempProject();
  appendViolation(dir, V);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8'));
  assert.equal(typeof rec.branch, 'string');
  assert.ok(rec.branch.length > 0);
});

test('appendViolation creates .guilda/.gitignore', () => {
  const dir = tempProject();
  appendViolation(dir, V);
  assert.deepEqual(
    fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').trim().split('\n'),
    ['violations.jsonl', 'format-retries.json'],
  );
});

test('appendViolation does not throw when .guilda is a file', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, '.guilda'), 'not a directory');
  assert.doesNotThrow(() => appendViolation(dir, V));
});

test('countViolations skips malformed lines', () => {
  const dir = tempProject({ rules: '' });
  fs.writeFileSync(
    path.join(dir, '.guilda', 'violations.jsonl'),
    ['{"rule":"R1"}', 'not json', '{"rule":"R1"}', '{"rule":"R2"}', '', '{"x":1}'].join('\n') + '\n',
  );
  const counts = countViolations(dir);
  assert.equal(counts.get('R1'), 2);
  assert.equal(counts.get('R2'), 1);
  assert.equal(counts.size, 2);
});

test('countViolations returns an empty map without a log', () => {
  assert.equal(countViolations(tempProject()).size, 0);
});
