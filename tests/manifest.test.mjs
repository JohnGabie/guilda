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

test('plugin requires skill-creator from the official marketplace', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  assert.ok(Array.isArray(plugin.dependencies), 'plugin.json has a dependencies list');
  assert.ok(plugin.dependencies.includes('skill-creator@claude-plugins-official'));
});

test('marketplace allows dependencies from the official marketplace', () => {
  const market = readJson('.claude-plugin/marketplace.json');
  assert.ok(Array.isArray(market.allowCrossMarketplaceDependenciesOn));
  assert.ok(market.allowCrossMarketplaceDependenciesOn.includes('claude-plugins-official'));
});
