import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText } from '../scripts/lib/scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'plugins/ios-on-linux/skills/ios-on-linux');
const FILES = [
  'SKILL.md',
  'references/control.md',
  'references/setup.md',
  'scripts/ios-doctor.sh',
  'scripts/iphone-agent',
  'scripts/tap_by_label.py',
];
const read = (f) => readFileSync(join(SKILL, f), 'utf8');

test('the six files exist', () => {
  for (const f of FILES) assert.ok(existsSync(join(SKILL, f)), f);
});

test('SKILL.md has name ios-on-linux and a description', () => {
  const fm = read('SKILL.md').match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'frontmatter');
  assert.match(fm[1], /^name: ios-on-linux$/m);
  assert.match(fm[1], /^description: \S.+$/m);
});

test('no file has an R19 hit', () => {
  for (const f of FILES) assert.deepEqual(scanText(read(f)), [], f);
});

test('no file has /home/ or /Users/ followed by a name', () => {
  for (const f of FILES) assert.doesNotMatch(read(f), /\/(home|Users)\/[A-Za-z0-9_.-]+/, f);
});

test('SKILL.md has the ask rule', () => {
  const t = read('SKILL.md');
  assert.match(t, /ask the user/);
  assert.match(t, /sends, deletes or buys/);
});
