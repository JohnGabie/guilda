import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appendViolation, countViolations, ensureIgnored, IGNORED } from '../scripts/lib/violations.mjs';
import { tempProject } from './helpers.mjs';

const V = { rule: 'R1', level: 'gate', source: 'hook', action: 'blocked' };

test('appendViolation writes one line without content fields', () => {
  const dir = tempProject({ git: true });
  fs.mkdirSync(path.join(dir, '.guilda'));
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
  fs.mkdirSync(path.join(dir, '.guilda'));
  appendViolation(dir, V);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8'));
  assert.equal(typeof rec.branch, 'string');
  assert.ok(rec.branch.length > 0);
});

test('appendViolation creates .guilda/.gitignore', () => {
  const dir = tempProject();
  fs.mkdirSync(path.join(dir, '.guilda'));
  appendViolation(dir, V);
  assert.deepEqual(
    fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').trim().split('\n'),
    ['violations.jsonl', 'format-retries.json', '.hooks-live.json', '.extension-live.json', 'reports/', 'queue/', 'audit.jsonl', 'transcripts/', 'trace/', 'status.md', 'logs/', '.doctor-last.json', '.init-progress.json', 'costs/', 'handoff.md', 'decisions-pending.md', 'eval-cache/', 'bus/', 'runs/', 'codex/', 'pace-last.json'],
  );
});

test('appendViolation does not throw when .guilda is a file', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, '.guilda'), 'not a directory');
  assert.doesNotThrow(() => appendViolation(dir, V));
});

test('appendViolation without a .guilda folder writes nothing (S14)', () => {
  const dir = tempProject();
  appendViolation(dir, V);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'violations.jsonl')), false);
});

test('appendViolation with a .guilda folder writes one line (S14)', () => {
  const dir = tempProject();
  fs.mkdirSync(path.join(dir, '.guilda'));
  appendViolation(dir, V);
  const lines = fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).rule, 'R1');
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

test('ensureIgnored adds .hooks-live.json and reports/ one time', () => {
  const dir = tempProject();
  const guildaDir = path.join(dir, '.guilda');
  fs.mkdirSync(guildaDir);
  fs.writeFileSync(path.join(guildaDir, '.gitignore'), 'violations.jsonl\nformat-retries.json\n');
  assert.ok(IGNORED.length >= 5);
  ensureIgnored(guildaDir);
  const first = fs.readFileSync(path.join(guildaDir, '.gitignore'), 'utf8');
  ensureIgnored(guildaDir);
  const second = fs.readFileSync(path.join(guildaDir, '.gitignore'), 'utf8');
  assert.equal(second, first);
  const lines = second.split('\n');
  for (const name of ['.hooks-live.json', 'reports/', 'violations.jsonl', 'format-retries.json']) {
    assert.equal(lines.filter((l) => l === name).length, 1, name);
  }
});

test('IGNORED has the 0.4.0 lines', () => {
  assert.deepEqual(IGNORED, ['violations.jsonl', 'format-retries.json', '.hooks-live.json', '.extension-live.json', 'reports/', 'queue/', 'audit.jsonl', 'transcripts/', 'trace/', 'status.md', 'logs/', '.doctor-last.json', '.init-progress.json', 'costs/', 'handoff.md', 'decisions-pending.md', 'eval-cache/', 'bus/', 'runs/', 'codex/', 'pace-last.json']);
});

test('IGNORED has handoff.md', () => {
  assert.ok(IGNORED.includes('handoff.md'));
});

test('an existing ignore line stays one time', () => {
  const dir = tempProject();
  const guildaDir = path.join(dir, '.guilda');
  fs.mkdirSync(guildaDir);
  fs.writeFileSync(path.join(guildaDir, '.gitignore'), 'queue/\nstatus.md\n');
  ensureIgnored(guildaDir);
  ensureIgnored(guildaDir);
  const lines = fs.readFileSync(path.join(guildaDir, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.filter((l) => l === 'queue/').length, 1);
  assert.equal(lines.filter((l) => l === 'status.md').length, 1);
  assert.deepEqual([...new Set(lines)], lines);
  assert.equal(lines.length, IGNORED.length);
});

test('IGNORED has decisions-pending.md', () => {
  assert.ok(IGNORED.includes('decisions-pending.md'));
});

test('IGNORED has pace-last.json', () => {
  assert.ok(IGNORED.includes('pace-last.json'));
});

test('IGNORED has eval-cache/', () => {
  assert.ok(IGNORED.includes('eval-cache/'));
});
