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

test('the marketplace lists three plugins with their sources (S17)', () => {
  const got = readJson('.claude-plugin/marketplace.json').plugins.map((p) => [p.name, p.source]);
  assert.deepEqual(got, [
    ['guilda', './'],
    ['guilda-skills', './plugins/guilda-skills'],
    ['ios-on-linux', './plugins/ios-on-linux'],
  ]);
});

test('allowCrossMarketplaceDependenciesOn has the marketplace of each dependency (S17)', () => {
  const allowed = readJson('.claude-plugin/marketplace.json').allowCrossMarketplaceDependenciesOn;
  for (const dep of readJson(EXT).dependencies) {
    const mk = typeof dep === 'string' ? dep.split('@')[1] : dep.marketplace;
    assert.ok(allowed.includes(mk), `${mk} is allowed`);
  }
});

test('the three manifests have one version, and .version-bump.json lists each of them (S45)', () => {
  const version = readJson(CORE).version;
  assert.equal(readJson(EXT).version, version);
  assert.equal(readJson(IOS).version, version);
  const listed = readJson('.version-bump.json').files.map((f) => f.path);
  for (const p of [CORE, EXT, IOS]) assert.ok(listed.includes(p), `${p} is listed`);
});
