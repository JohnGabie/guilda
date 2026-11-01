import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT } from './helpers.mjs';
import { lintRules } from '../scripts/lint-rules.mjs';

const REFS = path.join(REPO_ROOT, 'skills', 'init', 'references');
const node = (script, ...args) =>
  spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { encoding: 'utf8' });

test('config-template passes config-check', () => {
  const template = path.join(REFS, 'config-template.json');
  const parsed = JSON.parse(fs.readFileSync(template, 'utf8'));
  assert.equal('guildaVersion' in parsed, false, 'config-write sets guildaVersion');
  const dir = tempProject();
  const write = node('config-write.mjs', dir, template);
  assert.equal(write.status, 0, write.stdout + write.stderr);
  const check = node('config-check.mjs', dir);
  assert.equal(check.status, 0, check.stdout);
  assert.equal(check.stdout.trim(), 'ok');
});

test('rules-template passes lintRules with prefix P', () => {
  const text = fs.readFileSync(path.join(REFS, 'rules-template.md'), 'utf8');
  assert.match(text, /^### P1 — /m);
  assert.deepEqual(lintRules(text, { prefix: 'P' }), []);
});

test('init skill has its name and a "Use when" description', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');
  assert.match(text, /^---\r?\nname: init\r?\n/);
  assert.match(text, /^description: Use when /m);
});

test('lint-rules CLI lints a project rules file with --prefix P', () => {
  const good = node('lint-rules.mjs', '--prefix', 'P', path.join(REFS, 'rules-template.md'));
  assert.equal(good.status, 0, good.stdout);
  const dir = tempProject({ rules: '### P1 — Bad\nRule:  no terminal mark\n' });
  const bad = node('lint-rules.mjs', '--prefix', 'P', path.join(dir, '.guilda', 'rules.md'));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /P1/);
});
