import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT } from './helpers.mjs';
import { lintRules } from '../scripts/lint-rules.mjs';

const REFS = path.join(REPO_ROOT, 'skills', 'init', 'references');
const node = (script, ...args) =>
  spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { encoding: 'utf8' });

test('config-template passes config-check after its placeholders are filled', () => {
  const template = path.join(REFS, 'config-template.json');
  const parsed = JSON.parse(fs.readFileSync(template, 'utf8'));
  assert.equal('guildaVersion' in parsed, false, 'config-write sets guildaVersion');

  const raw = tempProject();
  const rejected = node('config-write.mjs', raw, template);
  assert.equal(rejected.status, 1, 'config-write must reject the unfilled template');
  assert.match(rejected.stdout, /placeholder/);
  assert.equal(fs.existsSync(path.join(raw, '.guilda')), false);

  // Fill the placeholders that the user answers. The tier placeholders stay: config-write fills them.
  parsed.languages = { replies: 'en', docs: 'en' };
  parsed.checks = [{ name: 'test', command: 'npm test' }];
  const filled = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test ')), 'answers.json');
  fs.writeFileSync(filled, JSON.stringify(parsed));
  const dir = tempProject();
  const write = node('config-write.mjs', dir, filled);
  assert.equal(write.status, 0, write.stdout + write.stderr);
  const check = node('config-check.mjs', dir);
  assert.equal(check.status, 0, check.stdout);
  assert.equal(check.stdout.trim(), 'ok');
  const written = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'config.json'), 'utf8'));
  const defaults = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8'));
  assert.deepEqual(written.tiers, defaults);
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
