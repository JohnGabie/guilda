import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of the `## Parallel waves` section, up to the next `## ` heading. */
function wavesSection() {
  const lines = SKILL.split('\n');
  const start = lines.indexOf('## Parallel waves');
  assert.ok(start >= 0, 'section Parallel waves exists');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

test('the producer/consumer table has one row for each interaction and names the join test', () => {
  const s = wavesSection();
  assert.ok(s.includes('producer'));
  assert.ok(s.includes('join test'));
  assert.match(s, /one row/);
});

test('the foundation fix has no local workaround', () => {
  const s = wavesSection();
  assert.ok(s.includes('no local workaround'));
  assert.match(s, /merge order/);
});

test('the shared helper forecast has the consolidate marker', () => {
  const s = wavesSection();
  assert.ok(s.includes('guilda:consolidate <name>'));
  assert.match(s, /grep/);
  assert.match(s, /not a command/);
});

test('the foundation task adds ignore entries', () => {
  assert.ok(wavesSection().includes('ignore entries'));
});

test('each wave names its base commit and no two tasks touch one file', () => {
  const s = wavesSection();
  assert.ok(s.includes('base commit'));
  assert.match(s, /R8/);
});
