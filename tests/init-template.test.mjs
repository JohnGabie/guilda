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
  assert.equal('schemaVersion' in parsed, false, 'config-write sets schemaVersion');
  assert.match(parsed.process, /^<.*>$/);
  assert.match(parsed.explain, /^<.*>$/);

  const raw = tempProject();
  const rejected = node('config-write.mjs', raw, template);
  assert.equal(rejected.status, 1, 'config-write must reject the unfilled template');
  assert.match(rejected.stdout, /placeholder/);
  assert.equal(fs.existsSync(path.join(raw, '.guilda')), false);

  // Fill the placeholders that the user answers. The tier placeholders stay: config-write fills them.
  parsed.languages = { replies: 'en', docs: 'en' };
  parsed.process = 'light';
  parsed.explain = 'brief';
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

test('a template with the process placeholder left is refused', () => {
  const parsed = JSON.parse(fs.readFileSync(path.join(REFS, 'config-template.json'), 'utf8'));
  parsed.languages = { replies: 'en', docs: 'en' };
  parsed.checks = [{ name: 'test', command: 'npm test' }];
  parsed.explain = 'brief';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test ')), 'answers.json');
  fs.writeFileSync(file, JSON.stringify(parsed));
  const dir = tempProject();
  const r = node('config-write.mjs', dir, file);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /process/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
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

const readRef = (name) => fs.readFileSync(path.join(REFS, name), 'utf8');

test('S20: the CLAUDE.md block has the exact sentence', () => {
  const text = readRef('claude-md-block.md');
  assert.ok(
    text.includes('This project uses guilda. If no `guilda:*` agent exists in this session, stop and tell the user that guilda is off.'),
  );
});

test('S24: the glossary skeleton has a heading, and each `- **` line matches the line format of core/glossary.md', () => {
  const text = readRef('glossary-template.md');
  assert.match(text, /^# .+/m);
  const lines = text.split(/\r?\n/).filter((l) => l.startsWith('- **'));
  assert.ok(lines.length >= 1);
  const re = /^- \*\*([^*]+)\*\*: .+?\. Forbidden: [^.,]+(?:, [^.,]+)*\.$/;
  for (const line of lines) assert.match(line, re);
});

test('the skill names process, explain, doctor.mjs, --new-project and "with its context"', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');
  for (const word of ['process', 'explain', 'doctor.mjs', '--new-project', 'with its context']) {
    assert.ok(text.includes(word), word);
  }
});

test('rules-template has the triage rows', () => {
  const text = readRef('rules-template.md');
  assert.match(text, /^## Triage/m);
  assert.match(text, /lesson/i);
  assert.match(text, /open question.*Lab/i);
  assert.match(text, /risk area.*Security/i);
  assert.match(text, /decided change.*Engineering/i);
});

test('rules-template has 20 non-blank lines or fewer', () => {
  const lines = readRef('rules-template.md').split(/\r?\n/).filter((l) => l.trim() !== '');
  assert.ok(lines.length <= 20, `${lines.length} lines`);
});

const initText = () => fs.readFileSync(path.join(REPO_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');

test('init runs init-progress at each step', () => {
  const text = initText();
  assert.match(text, /scripts\/init-progress\.mjs" "<project>" start /);
  assert.match(text, /init-progress\.mjs" "<project>" set <n> doing/);
  assert.match(text, /init-progress\.mjs" "<project>" set <n> done/);
  assert.match(text, /usage\.source/);
  assert.match(text, /"cswap"/);
  assert.match(text, /cswap MCP tools/);
  assert.match(text, /"off"/);
});

test('the template has usage.source off', () => {
  const parsed = JSON.parse(readRef('config-template.json'));
  assert.deepEqual(parsed.usage, { source: 'off' });
});

test('init writes no AGENTS.md line', () => {
  assert.doesNotMatch(initText(), /AGENTS\.md/);
});
