import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, readProjectRules } from '../scripts/lib/project.mjs';
import { tempProject, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

test('loadConfig returns null without config', () => {
  assert.equal(loadConfig(tempProject()), null);
});

test('loadConfig rejects invalid JSON with a reason', () => {
  const r = loadConfig(tempProject({ config: '{ not json' }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /not valid JSON/);
});

test('loadConfig rejects a missing tiers.master', () => {
  const config = structuredClone(MINIMAL_CONFIG);
  delete config.tiers.master;
  const r = loadConfig(tempProject({ config }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /tiers\.master/);
});

test('loadConfig accepts the minimal valid config', () => {
  const r = loadConfig(tempProject({ config: MINIMAL_CONFIG }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, MINIMAL_CONFIG);
});

test('loadConfig validates the optional scan.ignore', () => {
  const ok = loadConfig(tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } } }));
  assert.equal(ok.ok, true);
  const bad = loadConfig(tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: 'x' } } }));
  assert.equal(bad.ok, false);
});

test('readProjectRules returns content or empty string', () => {
  assert.equal(readProjectRules(tempProject()), '');
  assert.equal(readProjectRules(tempProject({ rules: 'P1 rule\n' })), 'P1 rule\n');
});

test('config-check prints ok or the reason', () => {
  const script = path.join(REPO_ROOT, 'scripts', 'config-check.mjs');
  const good = spawnSync(process.execPath, [script, tempProject({ config: MINIMAL_CONFIG })], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.equal(good.stdout.trim(), 'ok');
  const bad = spawnSync(process.execPath, [script, tempProject({ config: '{' })], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /not valid JSON/);
});
