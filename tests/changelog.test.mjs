import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { changesBetween } from '../scripts/changelog.mjs';
import { REPO_ROOT, tempProject } from './helpers.mjs';

const LOG = [
  '# Changelog',
  '',
  'Each entry lists the version and the rule IDs that changed.',
  '',
  '## 0.3.0 — 2026-12-01',
  '',
  '- Change C. Rule R30 changed.',
  '',
  '## 0.2.0 — 2026-11-15',
  '',
  '- Change B.',
  '',
  '## 0.1.0 — 2026-11-01',
  '',
  '- Change A.',
  '',
].join('\n');

test('changesBetween returns the 0.2.0 and 0.3.0 entries for 0.1.0 → 0.3.0', () => {
  const out = changesBetween(LOG, '0.1.0', '0.3.0');
  assert.match(out, /^## 0\.3\.0 — 2026-12-01$/m);
  assert.match(out, /^## 0\.2\.0 — 2026-11-15$/m);
  assert.doesNotMatch(out, /0\.1\.0/);
  assert.match(out, /Change B\./);
  assert.match(out, /Change C\./);
  assert.doesNotMatch(out, /Change A\./);
});

test('changesBetween returns "" when the versions are equal', () => {
  assert.equal(changesBetween(LOG, '0.2.0', '0.2.0'), '');
});

test('changesBetween excludes entries above the target version', () => {
  const out = changesBetween(LOG, '0.1.0', '0.2.0');
  assert.match(out, /Change B\./);
  assert.doesNotMatch(out, /Change C\./);
});

test('changesBetween returns "" when from is newer than to', () => {
  assert.equal(changesBetween(LOG, '0.3.0', '0.1.0'), '');
});

test('changesBetween compares numbers, not text (0.10.0 > 0.9.0)', () => {
  const log = '## 0.10.0 — 2027-01-01\n\n- Ten.\n\n## 0.9.0 — 2026-12-20\n\n- Nine.\n';
  const out = changesBetween(log, '0.9.0', '0.10.0');
  assert.match(out, /Ten\./);
  assert.doesNotMatch(out, /Nine\./);
});

test('CLI prints the entries for a changelog path with a space in it', () => {
  const dir = tempProject();
  const file = path.join(dir, 'CHANGELOG copy.md');
  fs.writeFileSync(file, LOG);
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'changelog.mjs'), '0.1.0', '0.3.0', file], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Change B\./);
  assert.match(r.stdout, /Change C\./);
});

test('CLI defaults to the CHANGELOG.md of the plugin', () => {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'changelog.mjs'), '0.0.0', '0.1.0'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^## 0\.1\.0 — /m);
});

test('CLI exits 1 with a usage line when arguments are missing', () => {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'changelog.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /usage/);
});

test('update skill names the required commands and steps', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'update', 'SKILL.md'), 'utf8');
  assert.match(text, /^name: update$/m);
  assert.match(text, /gh api repos\/JohnGabie\/guilda\/contents\/\.claude-plugin\/plugin\.json/);
  assert.match(text, /git ls-remote --tags https:\/\/github\.com\/JohnGabie\/guilda/);
  assert.match(text, /guilda--v\*/);
  assert.match(text, /claude plugin update guilda@guilda/);
  assert.match(text, /\/reload-plugins/);
  assert.match(text, /guilda:init/);
  assert.match(text, /scripts\/changelog\.mjs/);
});
