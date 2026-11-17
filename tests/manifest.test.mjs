import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));

test('plugin name is guilda', () => {
  assert.equal(readJson('.claude-plugin/plugin.json').name, 'guilda');
});

test('version is semver', () => {
  assert.match(readJson('.claude-plugin/plugin.json').version, /^\d+\.\d+\.\d+$/);
});

test('marketplace entry name equals plugin name and source is "./"', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  const entry = readJson('.claude-plugin/marketplace.json').plugins[0];
  assert.equal(entry.name, plugin.name);
  assert.equal(entry.source, './');
});

test('CHANGELOG top released entry equals plugin version', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  const text = fs.readFileSync(new URL('CHANGELOG.md', root), 'utf8');
  const m = text.match(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/m);
  assert.ok(m, 'CHANGELOG has an entry heading');
  assert.equal(m[1], plugin.version);
});

const CORE = '.claude-plugin/plugin.json';
const EXT = 'plugins/guilda-skills/.claude-plugin/plugin.json';
const IOS = 'plugins/ios-on-linux/.claude-plugin/plugin.json';
const PANEL = 'plugins/guilda-panel/.claude-plugin/plugin.json';

test('the core manifest has no dependencies field (S17)', () => {
  assert.equal('dependencies' in readJson(CORE), false);
});

test('the extension manifest lists skill-creator and superpowers (S17)', () => {
  const ext = readJson(EXT);
  assert.equal(ext.name, 'guilda-skills');
  assert.deepEqual(ext.dependencies, [
    { name: 'superpowers', marketplace: 'claude-plugins-official', version: '^7.0.0' },
    'skill-creator@claude-plugins-official',
  ]);
});

test('the ios-on-linux manifest has no dependencies field (S17)', () => {
  const ios = readJson(IOS);
  assert.equal(ios.name, 'ios-on-linux');
  assert.equal('dependencies' in ios, false);
});

test('the guilda-panel manifest has no dependencies field (S33)', () => {
  const panel = readJson(PANEL);
  assert.equal(panel.name, 'guilda-panel');
  assert.equal('dependencies' in panel, false);
});

test('the marketplace lists four plugins with their sources (S33)', () => {
  const got = readJson('.claude-plugin/marketplace.json').plugins.map((p) => [p.name, p.source]);
  assert.deepEqual(got, [
    ['guilda', './'],
    ['guilda-skills', './plugins/guilda-skills'],
    ['ios-on-linux', './plugins/ios-on-linux'],
    ['guilda-panel', './plugins/guilda-panel'],
  ]);
});

test('allowCrossMarketplaceDependenciesOn has the marketplace of each dependency (S17)', () => {
  const allowed = readJson('.claude-plugin/marketplace.json').allowCrossMarketplaceDependenciesOn;
  for (const dep of readJson(EXT).dependencies) {
    const mk = typeof dep === 'string' ? dep.split('@')[1] : dep.marketplace;
    assert.ok(allowed.includes(mk), `${mk} is allowed`);
  }
});

test('four manifests have one version, and .version-bump.json lists each of them (S45, S33)', () => {
  const version = readJson(CORE).version;
  assert.equal(readJson(EXT).version, version);
  assert.equal(readJson(IOS).version, version);
  assert.equal(readJson(PANEL).version, version);
  const listed = readJson('.version-bump.json').files.map((f) => f.path);
  for (const p of [CORE, EXT, IOS, PANEL]) assert.ok(listed.includes(p), `${p} is listed`);
});

// S44: THIRD-PARTY-NOTICES.md and the 16 copies of section 3f.
const NOTICES = 'THIRD-PARTY-NOTICES.md';
const COPIES = [
  'skills/report/references/redaction-policy.md',
  'skills/report/prompts/scrub.md',
  'skills/report/prompts/scrub-audit.md',
  'skills/report/templates/issue.md',
  '.github/ISSUE_TEMPLATE/report-improvement.md',
  '.github/ISSUE_TEMPLATE/report-bug.md',
  '.github/ISSUE_TEMPLATE/report-feature.md',
  '.github/ISSUE_TEMPLATE/report-other.md',
  'skills/report/templates/case.md',
  'skills/lab/templates/report.md',
  'skills/architect/scripts/task-brief',
  'skills/architect/scripts/review-package',
  'skills/architect/scripts/sdd-workspace',
  'skills/architect/scripts/task-start',
  'skills/architect/scripts/task-done',
  'scripts/bump-version.mjs',
];
const readText = (p) => fs.readFileSync(new URL(p, root), 'utf8').replace(/\r\n/g, '\n');

/** The paths of the "Files copied or adapted" list: one path in backquotes on each list line. */
function listedPaths() {
  const text = readText(NOTICES);
  const start = text.indexOf('Files copied or adapted');
  assert.ok(start >= 0, 'the notices file has the list');
  return [...text.slice(start).matchAll(/^- `([^`]+)`\s*$/gm)].map((m) => m[1]);
}

test('S44: the notices file has the MIT text and the copyright line', () => {
  const text = readText(NOTICES);
  assert.match(text, /^## superpowers/m);
  assert.match(text, /https:\/\/github\.com\/obra\/superpowers/);
  assert.match(text, /7\.0\.0/);
  assert.match(text, /^MIT License$/m);
  assert.match(text, /^Copyright \(c\) 2025 Jesse Vincent$/m);
  assert.match(text, /Permission is hereby granted, free of charge/);
  assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test('S44: its list is equal to the 16 paths of section 3f', () => {
  assert.equal(COPIES.length, 16);
  assert.deepEqual([...listedPaths()].sort(), [...COPIES].sort());
});

test('S44: each listed file exists', () => {
  for (const p of listedPaths()) assert.ok(fs.existsSync(new URL(p, root)), p);
});

test('S44: each listed file names superpowers in a credit line', () => {
  for (const p of listedPaths()) assert.match(readText(p), /superpowers/i, p);
});

// S31: the user skills. P3: a skill is hidden from the user menu by `user-invocable: false`.
const hidden = (file) => /^user-invocable:\s*false\s*$/m.test(readText(file).match(/^---\n([\s\S]*?)\n---/)[1]);

test('S31: the user skills of the core are architect, init, update and report', () => {
  const dir = new URL('skills/', root);
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const user = names.filter((n) => !hidden(`skills/${n}/SKILL.md`)).sort();
  assert.deepEqual(user, ['architect', 'init', 'report', 'update']);
});

test('S31: the extension has no user skill', () => {
  // plugins/guilda-skills/skills/ may be absent (no domain skill exists yet): then the loop runs over none.
  const dir = new URL('plugins/guilda-skills/skills/', root);
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  for (const n of names) assert.ok(hidden(`plugins/guilda-skills/skills/${n}/SKILL.md`), n);
});

// T32: the 0.2.0 release texts.
const changelogText = () => readText('CHANGELOG.md');
const entry = (version) => {
  const text = changelogText();
  const start = text.indexOf(`## [${version}] - `);
  assert.ok(start >= 0, `the ${version} entry exists`);
  const next = text.indexOf('\n## [', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
};

test('T32: the three manifests have the version 0.2.0', () => {
  for (const p of [CORE, EXT, IOS]) assert.equal(readJson(p).version, '0.2.0', p);
});

test('T32: the 0.2.0 entry has the headings Added, Changed and Fixed, and names its rule IDs', () => {
  const e = entry('0.2.0');
  for (const h of ['### Added', '### Changed', '### Fixed']) assert.ok(e.includes(h), h);
  for (const id of ['R4', 'R11', 'R13', 'R24', 'ARC1', 'EXE2', 'R26', 'R27', 'R28']) {
    assert.match(e, new RegExp(`\\b${id}\\b`), id);
  }
});

test('T32: the entry names R29 only when core/rules.md has R29, and the same for R30', () => {
  const rules = readText('core/rules.md');
  const e = entry('0.2.0');
  for (const id of ['R29', 'R30']) {
    const has = new RegExp(`^### ${id} `, 'm').test(rules);
    const inAdded = e.slice(e.indexOf('### Added'), e.indexOf('### Changed')).match(new RegExp(`\\b${id}\\b`));
    assert.equal(Boolean(inAdded), has, `${id} in Added iff core/rules.md has it`);
  }
});

test('T32: the changelog has an empty Unreleased entry and the 0.2.0 link references', () => {
  const text = changelogText();
  assert.match(text, /^## \[Unreleased\]\n\n## \[0\.2\.0\] - \d{4}-\d{2}-\d{2}$/m);
  assert.match(text, /^\[unreleased\]: .*compare\/guilda--v0\.2\.0\.\.\.HEAD$/m);
  assert.match(text, /^\[0\.2\.0\]: .*compare\/guilda--v0\.1\.1\.\.\.guilda--v0\.2\.0$/m);
});

test('T32: node scripts/changelog.mjs reads the changes from 0.1.1 to 0.2.0', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['scripts/changelog.mjs', '0.1.1', '0.2.0'], { encoding: 'utf8', cwd: new URL('./', root) });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /R26/);
  assert.match(r.stdout, /ARC1/);
  assert.doesNotMatch(r.stdout, /^## \[0\.1\.1\]/m);
});
