import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT, MINIMAL_CONFIG } from './helpers.mjs';
import { loadConfig } from '../scripts/lib/project.mjs';
import { installedVersion } from '../scripts/lib/version.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'config-write.mjs');

const { guildaVersion, ...base } = MINIMAL_CONFIG;
const ANSWERS = { ...base, process: 'full', explain: 'full' };

/** Write an answers file in its own temp dir (outside the project). */
function answersFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test '));
  const file = path.join(dir, 'answers.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

function configWrite(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('config-write writes a valid config with the installed version', () => {
  const dir = tempProject();
  const r = configWrite(dir, answersFile({ ...ANSWERS, guildaVersion: '9.9.9' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const loaded = loadConfig(dir);
  assert.equal(loaded?.ok, true, loaded?.reason);
  assert.equal(loaded.config.guildaVersion, installedVersion(REPO_ROOT));
  assert.deepEqual(loaded.config.tiers, ANSWERS.tiers);
  const ignore = fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8');
  assert.match(ignore, /^violations\.jsonl$/m);
});

const DEFAULT_TIERS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8'));

test('config-write fills missing tiers from core/tiers.json', () => {
  const dir = tempProject();
  const { tiers, ...noTiers } = ANSWERS;
  const r = configWrite(dir, answersFile(noTiers));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(loadConfig(dir).config.tiers, DEFAULT_TIERS);
});

test('config-write fills placeholder tiers and keeps a real tier value', () => {
  const dir = tempProject();
  const tiers = { master: 'my-model', journeyman: '<model for journeyman>', apprentice: '' };
  const r = configWrite(dir, answersFile({ ...ANSWERS, tiers }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(loadConfig(dir).config.tiers, {
    master: 'my-model',
    journeyman: DEFAULT_TIERS.journeyman,
    apprentice: DEFAULT_TIERS.apprentice,
  });
});

test('config-write rejects a placeholder check command and writes nothing', () => {
  const dir = tempProject();
  const checks = [{ name: 'test', command: '<a command that you ran in this project>' }];
  const r = configWrite(dir, answersFile({ ...ANSWERS, checks }));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /checks\[0\]\.command is still a placeholder/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('config-write rejects answers that fail the schema and writes nothing', () => {
  const dir = tempProject();
  const { languages, ...noLanguages } = ANSWERS;
  const r = configWrite(dir, answersFile(noLanguages));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /languages/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('config-write rejects an answers file that is not JSON', () => {
  const dir = tempProject();
  const r = configWrite(dir, answersFile('{ not json'));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /JSON/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('config-write refuses to overwrite without --replace', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const file = path.join(dir, '.guilda', 'config.json');
  const before = fs.readFileSync(file, 'utf8');
  const answers = answersFile({ ...ANSWERS, languages: { replies: 'pt-BR', docs: 'pt-BR' } });

  const refused = configWrite(dir, answers);
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /--replace/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const replaced = configWrite(dir, answers, '--replace');
  assert.equal(replaced.code, 0, replaced.stdout + replaced.stderr);
  assert.equal(loadConfig(dir).config.languages.replies, 'pt-BR');
});

test('config-write prints usage and exits 1 without arguments', () => {
  const r = configWrite();
  assert.equal(r.code, 1);
  assert.match(r.stdout, /usage/);
});

const CHECK = path.join(REPO_ROOT, 'scripts', 'config-check.mjs');
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const configFile = (dir) => path.join(dir, '.guilda', 'config.json');

test('process medium is refused with exit 1 (S1)', () => {
  const dir = tempProject();
  const r = configWrite(dir, answersFile({ ...ANSWERS, process: 'medium' }));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /process must be light or full/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('explain loud is refused (S30)', () => {
  const dir = tempProject();
  const r = configWrite(dir, answersFile({ ...ANSWERS, explain: 'loud' }));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /explain must be brief or full/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('brief and full are accepted (S30)', () => {
  for (const explain of ['brief', 'full']) {
    const dir = tempProject();
    const r = configWrite(dir, answersFile({ ...ANSWERS, process: 'light', explain }));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const { config } = loadConfig(dir);
    assert.equal(config.explain, explain);
    assert.equal(config.process, 'light');
  }
});

test('a new config has schemaVersion 2 (S43)', () => {
  const dir = tempProject();
  const r = configWrite(dir, answersFile({ ...ANSWERS, schemaVersion: 1 }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(loadConfig(dir).config.schemaVersion, 2);
});

test('answers with no process are refused', () => {
  const dir = tempProject();
  const { process: _p, ...noProcess } = ANSWERS;
  const r = configWrite(dir, answersFile(noProcess));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /config not written: process is missing/);
  const { explain: _e, ...noExplain } = ANSWERS;
  const r2 = configWrite(dir, answersFile(noExplain));
  assert.equal(r2.code, 1);
  assert.match(r2.stdout, /config not written: explain is missing/);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('config-check refuses process medium and accepts light', () => {
  const bad = tempProject({ config: { ...MINIMAL_CONFIG, process: 'medium' } });
  const r = run(CHECK, bad);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /process must be light or full/);
  const good = tempProject({ config: { ...MINIMAL_CONFIG, process: 'light' } });
  const ok = run(CHECK, good);
  assert.equal(ok.code, 0, ok.stdout);
  assert.equal(ok.stdout.trim(), 'ok');
});

test('S43: a 0.1.0 fixture gets schemaVersion 2, process full, explain full and the installed guildaVersion; each other key is equal', () => {
  const old = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'compat', '0.1.0', 'config.json'), 'utf8'));
  const dir = tempProject({ config: old });
  const r = run(SCRIPT, dir, '--migrate');
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const version = installedVersion(REPO_ROOT);
  assert.equal(r.stdout.trim(), `migrated .guilda/config.json (guildaVersion ${version}, schemaVersion 2)`);
  const text = fs.readFileSync(configFile(dir), 'utf8');
  assert.ok(text.endsWith('}\n'));
  const got = JSON.parse(text);
  assert.equal(got.schemaVersion, 2);
  assert.equal(got.process, 'full');
  assert.equal(got.explain, 'full');
  assert.equal(got.guildaVersion, version);
  const { guildaVersion: _g, ...oldRest } = old;
  const { guildaVersion: _h, schemaVersion: _s, process: _p, explain: _x, ...gotRest } = got;
  assert.deepEqual(gotRest, oldRest);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', '.gitignore')), false, 'migrate changes no other file');
});

test('S43: a second --migrate changes no byte', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.equal(run(SCRIPT, dir, '--migrate').code, 0);
  const before = fs.readFileSync(configFile(dir));
  const r = run(SCRIPT, dir, '--migrate');
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), 'already migrated');
  assert.deepEqual(fs.readFileSync(configFile(dir)), before);
});

test('S43: --migrate refuses { not json, process medium and schemaVersion 3; each prints migrate refused: and changes no byte', () => {
  const cases = [
    '{ not json',
    JSON.stringify({ ...MINIMAL_CONFIG, process: 'medium' }, null, 2),
    JSON.stringify({ ...MINIMAL_CONFIG, schemaVersion: 3 }, null, 2),
  ];
  const expected = [/Run guilda:init to fix \.guilda\/config\.json/, /invalid process value/, /schemaVersion 3 is newer than this guilda/];
  cases.forEach((text, i) => {
    const dir = tempProject({ config: text });
    const r = run(SCRIPT, dir, '--migrate');
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stderr, /^migrate refused: /);
    assert.match(r.stderr, expected[i]);
    assert.equal(r.stderr.trim().split('\n').length, 1);
    assert.equal(fs.readFileSync(configFile(dir), 'utf8'), text);
    assert.equal(fs.existsSync(path.join(dir, '.guilda', '.gitignore')), false);
  });
});
