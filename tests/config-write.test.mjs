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

const { guildaVersion, ...ANSWERS } = MINIMAL_CONFIG;

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

test('config-write rejects answers without tiers and writes nothing', () => {
  const dir = tempProject();
  const { tiers, ...noTiers } = ANSWERS;
  const r = configWrite(dir, answersFile(noTiers));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tiers/);
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
