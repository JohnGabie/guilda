import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contextRules } from '../scripts/lib/rules-context.mjs';
import { REPO_ROOT } from './helpers.mjs';

const RULES = fs.readFileSync(path.join(REPO_ROOT, 'core', 'rules.md'), 'utf8').replace(/\r\n/g, '\n');
const BLOCK_RE = /^### (\S+) — (.*)\nRule: (.*)\nWhy: .*\nCheck: (\w+) — .*$/gm;
const blocks = [...RULES.matchAll(BLOCK_RE)].map((m) => ({
  id: m[1], title: m[2], ruleLine: `Rule: ${m[3]}`, level: m[4],
}));
const out = contextRules(RULES);
const lines = out.split('\n');

test('a law block becomes one line with (law — enforced by a hook)', () => {
  const text = '### R19 — No secrets\nRule:  Never commit.\nWhy:   Leaks.\nCheck: law — A hook scans.\n';
  assert.equal(contextRules(text).trim(), '### R19 — No secrets (law — enforced by a hook)');
});

test('a gate block becomes its heading with (gate) and its Rule: line, word for word', () => {
  const text = '### R1 — Source\nRule:  Take facts.\nWhy:   Drift.\nCheck: gate — Reject.\n';
  assert.equal(contextRules(text).trim(), '### R1 — Source (gate)\nRule:  Take facts.');
});

test('a judgment block the same', () => {
  const text = '### R14 — Disagree\nRule:  As Architect.\nWhy:   Errors.\nCheck: judgment — Text only.\n';
  assert.equal(contextRules(text).trim(), '### R14 — Disagree (judgment)\nRule:  As Architect.');
});

test('no output line starts with Why: or Check:', () => {
  assert.ok(blocks.length > 0);
  for (const l of lines) assert.doesNotMatch(l, /^(Why|Check):/);
});

test('the intro lines stay', () => {
  const intro = RULES.split('\n').slice(0, RULES.split('\n').findIndex((l) => l.startsWith('### ')))
    .filter((l) => l.trim() !== '');
  assert.equal(intro.length, 3);
  for (const l of intro) assert.ok(lines.includes(l), l);
});

test('each rule ID of core/rules.md is in the output one time', () => {
  for (const b of blocks) {
    const n = lines.filter((l) => l.startsWith(`### ${b.id} — `)).length;
    assert.equal(n, 1, b.id);
  }
});

test('each Rule: line of a rule that is not a law is in the output', () => {
  for (const b of blocks.filter((x) => x.level !== 'law')) {
    const i = lines.indexOf(`### ${b.id} — ${b.title} (${b.level})`);
    assert.ok(i >= 0, b.id);
    assert.equal(lines[i + 1], b.ruleLine, b.id);
  }
});

test('a text with no block returns as it is', () => {
  const text = 'Just a line.\n\nAnother line.\n';
  assert.equal(contextRules(text), text);
  assert.equal(contextRules(''), '');
});
