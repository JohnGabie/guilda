import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintRules, lintModelNames } from '../scripts/lint-rules.mjs';
import { REPO_ROOT } from './helpers.mjs';

// Normalize CRLF: with core.autocrlf, a Windows checkout has CRLF line ends.
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const nonBlank = (text) => text.split(/\r?\n/).filter((l) => l.trim() !== '').length;

const LEVELS = {
  R1: 'gate', R2: 'gate', R3: 'gate', R4: 'law', R5: 'gate', R6: 'gate', R7: 'gate', R8: 'gate', R9: 'gate',
  R10: 'gate', R11: 'gate', R12: 'gate', R13: 'judgment', R14: 'judgment', R15: 'gate', R16: 'gate', R17: 'gate',
  R18: 'law', R19: 'law', R20: 'gate', R21: 'gate', R22: 'gate', R23: 'gate', R24: 'gate', R25: 'judgment',
};

/** Map rule ID → full block text (heading + 3 lines). */
function blocks(text) {
  const out = {};
  const re = /^### (R\d+) — .*\nRule: .*\nWhy: .*\nCheck: (\w+) — .*$/gm;
  for (const m of text.matchAll(re)) out[m[1]] = { text: m[0], level: m[2] };
  return out;
}

test('core/rules.md has R1..R25 with the levels above', () => {
  const found = blocks(read('core/rules.md'));
  assert.deepEqual(Object.keys(found), Object.keys(LEVELS));
  for (const [id, level] of Object.entries(LEVELS)) assert.equal(found[id].level, level, id);
});

test('R15 mechanism names the ste-check report', () => {
  assert.match(blocks(read('core/rules.md')).R15.text, /Check: gate — .*ste-check/);
});

test('core/rules.md + core/writing.md have 125 lines or fewer', () => {
  assert.ok(nonBlank(read('core/rules.md')) + nonBlank(read('core/writing.md')) <= 125);
});

test('core/subagent.md has 60 lines or fewer', () => {
  assert.ok(nonBlank(read('core/subagent.md')) <= 60);
});

test('lintRules(core/rules.md) is empty', () => {
  assert.deepEqual(lintRules(read('core/rules.md'), { prefix: 'R' }), []);
});

test('core/subagent.md holds R5, R6, R15, R16 exactly as core/rules.md', () => {
  const sub = read('core/subagent.md');
  assert.deepEqual(lintRules(sub, { prefix: 'R' }), []);
  const core = blocks(read('core/rules.md'));
  const found = blocks(sub);
  assert.deepEqual(Object.keys(found), ['R5', 'R6', 'R15', 'R16']);
  for (const id of Object.keys(found)) assert.equal(found[id].text, core[id].text, id);
});

test('tiers.json has the three tier keys', () => {
  assert.deepEqual(JSON.parse(read('core/tiers.json')), { master: 'opus', journeyman: 'sonnet', apprentice: 'haiku' });
});

test('glossary has the process terms in the fixed line format', () => {
  const terms = ['brief', 'spec', 'plan', 'executor', 'reviewer', 'QA', 'security', 'architect', 'controller', 'lab',
    'verdict'];
  const lines = read('core/glossary.md').split(/\r?\n/).filter((l) => l.startsWith('- **'));
  const re = /^- \*\*([^*]+)\*\*: [^.]+\. Forbidden: [^.,]+(?:, [^.,]+)*\.$/;
  for (const line of lines) assert.match(line, re);
  assert.deepEqual(lines.map((l) => l.match(re)[1]), terms);
});

test('core text has no model names outside tiers.json', () => {
  const files = fs.readdirSync(path.join(REPO_ROOT, 'core')).map((f) => path.join(REPO_ROOT, 'core', f));
  assert.deepEqual(lintModelNames(files), []);
});

test('lint-rules CLI exits 0 on the repository', () => {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'lint-rules.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
