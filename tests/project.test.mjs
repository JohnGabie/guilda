import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig,
  readProjectRules,
  projectState,
  checkSchema,
  checkStrict,
  migrateConfig,
  normalizeRepo,
  SAFE_DEFAULTS,
  SCHEMA_VERSION,
} from '../scripts/lib/project.mjs';
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

test('projectState: no .guilda folder -> none', () => {
  assert.deepEqual(projectState(tempProject()), { state: 'none' });
});

test('projectState: .guilda is a file -> none', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, '.guilda'), 'not a directory');
  assert.deepEqual(projectState(dir), { state: 'none' });
});

test('projectState: .guilda without config.json -> broken, reason .guilda/config.json is missing, safe defaults', () => {
  const r = projectState(tempProject({ rules: '' }));
  assert.equal(r.state, 'broken');
  assert.equal(r.reason, '.guilda/config.json is missing');
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: invalid JSON -> broken', () => {
  const r = projectState(tempProject({ config: '{ not json' }));
  assert.equal(r.state, 'broken');
  assert.match(r.reason, /^\.guilda\/config\.json is not valid JSON: /);
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: JSON with no tiers -> broken', () => {
  const config = structuredClone(MINIMAL_CONFIG);
  delete config.tiers;
  const r = projectState(tempProject({ config }));
  assert.equal(r.state, 'broken');
  assert.match(r.reason, /tiers must be an object/);
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: valid config -> valid', () => {
  const r = projectState(tempProject({ config: MINIMAL_CONFIG }));
  assert.equal(r.state, 'valid');
  assert.deepEqual(r.config, migrateConfig(MINIMAL_CONFIG));
  assert.deepEqual(r.notices, []);
});

const TIERS_JSON = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8'));
const invalidNotice = (field) =>
  `guilda: .guilda/config.json has an invalid ${field} value; guilda uses full. Run guilda:update.`;

test('a 0.1.x config reads process full, explain full and schemaVersion 2 (S18)', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const file = path.join(dir, '.guilda', 'config.json');
  const before = fs.readFileSync(file);
  const r = projectState(dir);
  assert.equal(r.state, 'valid');
  assert.equal(r.config.process, 'full');
  assert.equal(r.config.explain, 'full');
  assert.equal(r.config.schemaVersion, 2);
  assert.equal(SCHEMA_VERSION, 2);
  assert.deepEqual(r.notices, []);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('process light stays light', () => {
  const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, process: 'light', explain: 'brief' } }));
  assert.equal(r.state, 'valid');
  assert.equal(r.config.process, 'light');
  assert.equal(r.config.explain, 'brief');
  assert.deepEqual(r.notices, []);
});

test('an invalid process reads as full with one notice', () => {
  for (const value of ['medium', 'Light', 1]) {
    const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, process: value } }));
    assert.equal(r.state, 'valid', `process ${JSON.stringify(value)}`);
    assert.equal(r.config.process, 'full');
    assert.deepEqual(r.notices, [invalidNotice('process')]);
  }
});

test('an invalid explain reads as full with one notice', () => {
  for (const value of ['loud', 'Brief', 1]) {
    const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, explain: value } }));
    assert.equal(r.state, 'valid', `explain ${JSON.stringify(value)}`);
    assert.equal(r.config.explain, 'full');
    assert.deepEqual(r.notices, [invalidNotice('explain')]);
  }
});

test('schemaVersion 99 is valid with the newer notice (S18)', () => {
  const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, schemaVersion: 99 } }));
  assert.equal(r.state, 'valid');
  assert.equal(r.config.schemaVersion, 99);
  assert.deepEqual(r.notices, [
    'guilda: .guilda/config.json has schemaVersion 99, newer than this guilda knows. Run guilda:update.',
  ]);
});

test('checkStrict refuses process medium, explain loud, report.repo "x", schemaVersion 0', () => {
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, process: 'medium' }), 'process must be light or full');
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, explain: 'loud' }), 'explain must be brief or full');
  assert.equal(
    checkStrict({ ...MINIMAL_CONFIG, report: { repo: 'x' } }),
    'report.repo must be owner/name or a GitHub URL',
  );
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, schemaVersion: 0 }), 'schemaVersion must be a positive integer');
});

test('checkStrict returns the checkSchema reason first', () => {
  const config = { ...MINIMAL_CONFIG, process: 'medium' };
  delete config.checks;
  assert.equal(checkStrict(config), checkSchema(config));
  assert.equal(checkStrict(config), 'checks must be an array');
});

test('checkStrict accepts a 0.1.x config', () => {
  assert.equal(checkStrict(MINIMAL_CONFIG), null);
  assert.equal(
    checkStrict({
      ...MINIMAL_CONFIG,
      process: 'light',
      explain: 'brief',
      schemaVersion: 2,
      report: { repo: 'https://github.com/acme/tools' },
    }),
    null,
  );
});

test('checkSchema still accepts process medium', () => {
  assert.equal(checkSchema({ ...MINIMAL_CONFIG, process: 'medium' }), null);
});

test('migrateConfig changes no other key and is safe to run again', () => {
  const c = structuredClone(MINIMAL_CONFIG);
  const once = migrateConfig(c);
  assert.deepEqual(c, MINIMAL_CONFIG);
  assert.notEqual(once, c);
  assert.deepEqual(migrateConfig(once), once);
  assert.deepEqual(Object.keys(once), [...Object.keys(MINIMAL_CONFIG), 'process', 'explain', 'schemaVersion']);
  for (const key of Object.keys(MINIMAL_CONFIG)) assert.deepEqual(once[key], MINIMAL_CONFIG[key]);
  assert.equal(once.process, 'full');
  assert.equal(once.explain, 'full');
  assert.equal(once.schemaVersion, 2);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, schemaVersion: 1 }).schemaVersion, 2);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, schemaVersion: 99 }).schemaVersion, 99);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, process: 'light' }).process, 'light');
});

test('normalizeRepo', () => {
  for (const value of [
    'acme/tools',
    'https://github.com/acme/tools',
    'https://github.com/acme/tools/',
    'https://github.com/acme/tools.git',
  ]) {
    assert.equal(normalizeRepo(value), 'acme/tools', value);
  }
  for (const value of ['x', '', 'https://example.com/a/b']) assert.equal(normalizeRepo(value), null, value);
  for (const value of ['../..', 'a/.', 'a/..', '-x/-y', 'acme/-tools', '.acme/tools', 'https://github.com/../..']) {
    assert.equal(normalizeRepo(value), null, value);
  }
  assert.equal(normalizeRepo('acme/.github'), 'acme/.github');
});

test('the safe defaults are complete (S16)', () => {
  const r = projectState(tempProject({ config: '{ not json' }));
  assert.equal(r.state, 'broken');
  assert.deepEqual(r.notices, []);
  assert.deepEqual(r.config.tiers, TIERS_JSON);
  assert.equal(r.config.languages.replies, 'en');
  assert.equal(r.config.languages.docs, 'en');
  assert.equal(r.config.process, 'full');
  assert.equal(r.config.explain, 'full');
  assert.equal(r.config.security.enabled, true);
  assert.deepEqual(r.config.security.riskAreas, []);
  assert.deepEqual(r.config.scan, { ignore: [] });
  assert.deepEqual(r.config.writing, { free: [], exceptions: [] });
  assert.deepEqual(r.config.checks, []);
  assert.ok(Object.isFrozen(SAFE_DEFAULTS));
  assert.ok(Object.isFrozen(SAFE_DEFAULTS.tiers));
  assert.ok(Object.isFrozen(SAFE_DEFAULTS.security.riskAreas));
});

test('checkStrict: dispatch.agentTypes is a list of non-empty strings', () => {
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: { agentTypes: ['a', 'plugin:b'] } }), null);
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: {} }), null);
  for (const bad of [{ agentTypes: 'a' }, { agentTypes: [''] }, { agentTypes: [1] }, 'x']) {
    assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: bad }), 'dispatch.agentTypes must be a list of agent type names');
  }
});

test('dispatchAgentTypes reads a list in lower case and treats a bad value as empty', async () => {
  const { dispatchAgentTypes } = await import('../scripts/lib/project.mjs');
  assert.deepEqual(dispatchAgentTypes({ dispatch: { agentTypes: [' A ', 'b', '', 3] } }), ['a', 'b']);
  for (const c of [{}, { dispatch: 'x' }, { dispatch: { agentTypes: 'a' } }, null]) assert.deepEqual(dispatchAgentTypes(c), []);
});
