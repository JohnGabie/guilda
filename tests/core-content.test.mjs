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
  R26: 'gate', R27: 'judgment', R28: 'law', R30: 'law', R31: 'gate', R32: 'law',
};

/** Map rule ID → full block text (heading + 3 lines). */
function blocks(text) {
  const out = {};
  const re = /^### (R\d+) — .*\nRule: .*\nWhy: .*\nCheck: (\w+) — .*$/gm;
  for (const m of text.matchAll(re)) out[m[1]] = { text: m[0], level: m[2] };
  return out;
}

test('core/rules.md has each rule of LEVELS with its level, and no other rule', () => {
  const found = blocks(read('core/rules.md'));
  assert.deepEqual(Object.keys(found), Object.keys(LEVELS));
  for (const [id, level] of Object.entries(LEVELS)) assert.equal(found[id].level, level, id);
});

test('R15 mechanism names the ste-check report', () => {
  assert.match(blocks(read('core/rules.md')).R15.text, /Check: gate — .*ste-check/);
});

test('the full files have 150 lines or fewer', () => {
  // core/rules.md + core/writing.md; the limit of 0.3.0 (spec X1).
  const n = nonBlank(read('core/rules.md')) + nonBlank(read('core/writing.md'));
  assert.ok(n <= 150, `got ${n} lines`);
});

test('R28 has the level law', () => {
  assert.equal(blocks(read('core/rules.md')).R28.level, 'law');
});

test('R30 has the level law', () => {
  assert.equal(blocks(read('core/rules.md')).R30.level, 'law');
});

test('R31 has the level gate', () => {
  assert.equal(blocks(read('core/rules.md')).R31?.level, 'gate');
});

test('R32 has the level law', () => {
  assert.equal(blocks(read('core/rules.md')).R32?.level, 'law');
});

test('R28 Check line names the Skill part (S41)', () => {
  assert.match(blocks(read('core/rules.md')).R28.text, /Check: law — SessionStart, and PreToolUse on a guilda skill or a `guilda:\*` agent, print the set-up notice\./);
});

test('R27 has the level judgment (S38)', () => {
  assert.equal(blocks(read('core/rules.md')).R27.level, 'judgment');
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
    'verdict', 'process level', 'security zone', 'review unit', 'domain skill', 'triage', 'mutant', 'field report',
    'lab report', 'Lab group', 'block', 'agent ID', 'address', 'queue journal', 'signal', 'audit log', 'block index',
    'cost record'];
  const lines = read('core/glossary.md').split(/\r?\n/).filter((l) => l.startsWith('- **'));
  const re = /^- \*\*([^*]+)\*\*: .+?\. Forbidden: [^.,]+(?:, [^.,]+)*\.$/;
  for (const line of lines) assert.match(line, re);
  assert.deepEqual(lines.map((l) => l.match(re)[1]), terms);
});

test('core text has no model names outside tiers.json', () => {
  // Recursive: core/ has subfolders such as core/knowledge/.
  const files = fs
    .readdirSync(path.join(REPO_ROOT, 'core'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
  assert.deepEqual(lintModelNames(files), []);
});

test('lint-rules CLI exits 0 on the repository', () => {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'lint-rules.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
