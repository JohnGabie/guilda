import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projectState, checkStrict } from '../scripts/lib/project.mjs';
import { changesBetween } from '../scripts/changelog.mjs';
import { tempProject, REPO_ROOT } from './helpers.mjs';

// The config that guilda:init of each published version wrote, and the CHANGELOG of that version (S19).
const VERSIONS = ['0.1.0', '0.1.1'];
// Each version with the version before it.
const PREVIOUS = { '0.1.0': '0.0.0', '0.1.1': '0.1.0' };
const fixture = (version, name) => path.join(REPO_ROOT, 'tests', 'fixtures', 'compat', version, name);
const readConfig = (version) => JSON.parse(fs.readFileSync(fixture(version, 'config.json'), 'utf8'));

for (const version of VERSIONS) {
  test(`${version}: the config reads as valid with the defaults (S19)`, () => {
    const config = readConfig(version);
    assert.equal(config.guildaVersion, version);
    assert.equal(config.process, undefined);
    assert.equal(config.schemaVersion, undefined);
    const dir = tempProject({ config: fs.readFileSync(fixture(version, 'config.json'), 'utf8') });
    const before = fs.readFileSync(path.join(dir, '.guilda', 'config.json'));
    const r = projectState(dir);
    assert.equal(r.state, 'valid');
    assert.deepEqual(r.notices, []);
    assert.equal(r.config.process, 'full');
    assert.equal(r.config.explain, 'full');
    assert.equal(r.config.schemaVersion, 2);
    assert.deepEqual(r.config.scan, { ignore: [] });
    assert.equal(r.config.guildaVersion, version);
    assert.equal(checkStrict(config), null);
    assert.deepEqual(fs.readFileSync(path.join(dir, '.guilda', 'config.json')), before);
  });

  test(`${version}: an unknown field is ignored`, () => {
    const config = { ...readConfig(version), futureField: { any: 'value' } };
    const r = projectState(tempProject({ config }));
    assert.equal(r.state, 'valid');
    assert.deepEqual(r.notices, []);
    assert.equal(r.config.process, 'full');
  });

  test(`${version}: a missing required field gives the broken project layer`, () => {
    const config = readConfig(version);
    delete config.tiers;
    const r = projectState(tempProject({ config }));
    assert.equal(r.state, 'broken');
    assert.match(r.reason, /tiers must be an object/);
    assert.deepEqual(r.notices, []);
  });

  test(`${version}: changesBetween reads the CHANGELOG`, () => {
    const text = fs.readFileSync(fixture(version, 'CHANGELOG.md'), 'utf8');
    let out;
    assert.doesNotThrow(() => {
      out = changesBetween(text, '0.0.0', version);
    });
    assert.ok(out.startsWith(`## ${version} `), out);
    const entry = changesBetween(text, PREVIOUS[version], version);
    assert.ok(entry.startsWith(`## ${version} `), entry);
    assert.ok(entry.split('\n').slice(1).join('\n').trim().length > 0, `the ${version} entry has text`);
  });
}
