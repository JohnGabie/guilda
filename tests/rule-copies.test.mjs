import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('EXE2 names the old code', () => {
  const text = read('agents/executor.md');
  const block = text.match(/^### EXE2 — .*\nRule: .*\nWhy: .*\nCheck: .*$/m);
  assert.ok(block, 'EXE2 block found');
  assert.match(block[0], /against the old code/);
  assert.match(text, /fails for the correct reason against the old code/);
  assert.match(text, /Tests failed first: <command, exit code, failure lines> against the old code/);
});

test('the Reviewer has the three R24 and R11 lines', () => {
  const text = read('agents/reviewer.md');
  assert.ok(text.includes('The review unit closes only on this approval (R24).'));
  assert.ok(text.includes(
    'Count the rejections of the review unit: the task at `full`, the integration at `light` (R11).'));
  assert.ok(text.includes('- At `full`, the diff holds one plan task only (R24).'));
});
