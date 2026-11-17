import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of one numbered procedure step, up to the next numbered step or the next heading. */
function step(n) {
  const lines = SKILL.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${n}. `));
  assert.ok(start >= 0, `procedure step ${n} exists`);
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (/^\d+\. /.test(l) || l.startsWith('#')) break;
    out.push(l);
  }
  return out.join('\n');
}

/** Text of a `## <title>` section. */
function section(title) {
  const lines = SKILL.split('\n');
  const start = lines.indexOf(`## ${title}`);
  assert.ok(start >= 0, `section ${title} exists`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

test('the procedure runs doctor.mjs before the first dispatch', () => {
  const proc = section('Procedure');
  assert.match(proc, /scripts\/doctor\.mjs/);
  assert.match(proc, /--session/);
  assert.match(proc, /--agents/);
  assert.match(proc, /before the first dispatch/i);
  assert.match(proc, /not PASS/);
  assert.match(proc, /guilda:\*/);
});

test('the tier text has 50 changed lines, git diff --numstat and shared code', () => {
  const tier = section('Tier choice');
  assert.match(tier, /50 changed lines/);
  assert.match(tier, /git diff --numstat/);
  assert.match(tier, /binary file/);
  assert.match(tier, /shared code/i);
  assert.match(tier, /Files it may touch:/);
  assert.match(tier, /producer\/consumer table/);
  assert.match(tier, /re-review/);
  assert.doesNotMatch(tier, /Reviewer always runs at master/);
});

test('step 11 names the reply language and one tier lower', () => {
  const s = step(11);
  assert.match(s, /reply language/);
  assert.match(s, /config\.languages\.replies/);
  assert.match(s, /one tier lower/);
  assert.match(s, /tell the user/i);
});

test('step 1 names the Explain: part, brief and full', () => {
  const s = step(1);
  assert.match(s, /Explain:/);
  assert.match(s, /\bfull\b/);
  assert.match(s, /\bbrief\b/);
  assert.match(s, /where/);
  assert.match(s, /example/);
  assert.match(s, /R13/);
});
