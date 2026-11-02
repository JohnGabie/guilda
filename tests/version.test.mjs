import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSemver, installedVersion } from '../scripts/lib/version.mjs';
import { REPO_ROOT } from './helpers.mjs';

test('compareSemver orders versions', () => {
  assert.equal(compareSemver('0.1.0', '0.2.0'), -1);
  assert.equal(compareSemver('1.0.0', '0.9.9'), 1);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('0.10.0', '0.9.0'), 1);
});

test('installedVersion reads plugin.json', () => {
  assert.match(installedVersion(REPO_ROOT), /^\d+\.\d+\.\d+/);
});

test('installedVersion returns 0.0.0 when plugin.json is missing', () => {
  assert.equal(installedVersion(new URL('.', import.meta.url).pathname + 'nope'), '0.0.0');
});
