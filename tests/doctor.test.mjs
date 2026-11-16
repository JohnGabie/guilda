import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, MINIMAL_CONFIG, tempProject } from './helpers.mjs';
import { installedVersion } from '../scripts/lib/version.mjs';
import { SCHEMA_VERSION } from '../scripts/lib/project.mjs';

const DOCTOR = path.join(REPO_ROOT, 'scripts', 'doctor.mjs');
const INSTALLED = installedVersion(REPO_ROOT);
const NAMES = ['core plugin loaded', 'hooks live', 'guilda:* agents present', 'extension plugin loaded', 'project files present', 'version'];
const AGENTS = fs.readdirSync(path.join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md')).map((f) => `guilda:${f.slice(0, -3)}`).join(',');
const AT = '2026-11-10T00:00:00.000Z';

const goodConfig = (extra = {}) => ({ ...MINIMAL_CONFIG, guildaVersion: INSTALLED, schemaVersion: SCHEMA_VERSION, ...extra });

function project({ config = goodConfig(), hooks = 's1', ext, rules = '# rules\n' } = {}) {
  const dir = tempProject({ config, rules });
  if (hooks) fs.writeFileSync(path.join(dir, '.guilda', '.hooks-live.json'), JSON.stringify({ sessionId: hooks, version: INSTALLED, at: AT }));
  if (ext) fs.writeFileSync(path.join(dir, '.guilda', '.extension-live.json'), JSON.stringify({ sessionId: ext, at: AT }));
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [DOCTOR, dir, ...args], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(Boolean);
  const by = {};
  for (const l of lines) by[l.split(': ')[0]] = l;
  return { code: r.status, lines, by };
}

const status = (r, name) => r.by[name].split(': ')[1].split(' ')[0];

test('six lines in the fixed order, each with a status and evidence', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1', '--agents', AGENTS);
  assert.equal(r.lines.length, 6);
  r.lines.forEach((l, i) => {
    assert.match(l, new RegExp(`^${NAMES[i].replace('*', '\\*')}: (PASS|FAIL|UNKNOWN) — .+`));
  });
});

test('--session s1 and each agent name: hooks PASS, agents PASS, core PASS with version', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1', '--agents', AGENTS);
  assert.equal(status(r, 'hooks live'), 'PASS');
  assert.equal(status(r, 'guilda:* agents present'), 'PASS');
  assert.equal(status(r, 'core plugin loaded'), 'PASS');
  assert.match(r.by['core plugin loaded'], new RegExp(INSTALLED.replace(/\./g, '\\.')));
  assert.equal(status(r, 'project files present'), 'PASS');
  assert.equal(status(r, 'version'), 'PASS');
  assert.equal(r.code, 0);
});

test('--session s2: hooks UNKNOWN with the marker time', () => {
  const r = run(project({ ext: 's2' }), '--session', 's2', '--agents', AGENTS);
  assert.equal(status(r, 'hooks live'), 'UNKNOWN');
  assert.match(r.by['hooks live'], /2026-11-10T00:00:00\.000Z/);
});

test('no marker: hooks FAIL, exit 1', () => {
  const r = run(project({ hooks: null, ext: 's1' }), '--session', 's1', '--agents', AGENTS);
  assert.equal(status(r, 'hooks live'), 'FAIL');
  assert.equal(r.code, 1);
});

test('no marker and --new-project: hooks UNKNOWN; exit 0 with no other FAIL', () => {
  const r = run(project({ hooks: null }), '--session', 's1', '--agents', AGENTS, '--new-project');
  assert.equal(status(r, 'hooks live'), 'UNKNOWN');
  assert.equal(status(r, 'extension plugin loaded'), 'UNKNOWN');
  assert.match(r.by['hooks live'], /no marker yet; the session start writes it in the next session/);
  assert.equal(r.code, 0);
});

test('--new-project with no extension marker: extension UNKNOWN, exit 0', () => {
  const r = run(project({ hooks: 's1' }), '--session', 's1', '--agents', AGENTS, '--new-project');
  assert.equal(status(r, 'extension plugin loaded'), 'UNKNOWN');
  assert.match(r.by['extension plugin loaded'], /no marker yet; the session start writes it in the next session/);
  assert.equal(r.code, 0);
});

test('without --new-project the missing extension marker stays FAIL', () => {
  const r = run(project({ hooks: 's1' }), '--session', 's1', '--agents', AGENTS);
  assert.equal(status(r, 'extension plugin loaded'), 'FAIL');
});

test('a usage error exits 2 with one line on standard error', () => {
  for (const args of [['--bogus'], ['--session'], ['--agents']]) {
    const r = spawnSync(process.execPath, [DOCTOR, project(), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
    assert.equal(r.stderr.trim().split('\n').length, 1);
  }
});

test('--agents executor (no prefix): agents FAIL', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1', '--agents', 'executor');
  assert.equal(status(r, 'guilda:* agents present'), 'FAIL');
  assert.match(r.by['guilda:* agents present'], /executor/);
  assert.equal(r.code, 1);
});

test('a missing agent is named in the FAIL line', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1', '--agents', 'guilda:executor');
  assert.equal(status(r, 'guilda:* agents present'), 'FAIL');
  assert.match(r.by['guilda:* agents present'], /reviewer/);
});

test('no --agents: agents UNKNOWN', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1');
  assert.equal(status(r, 'guilda:* agents present'), 'UNKNOWN');
});

test('guildaVersion 0.1.0: version UNKNOWN with Run guilda:update', () => {
  const r = run(project({ config: goodConfig({ guildaVersion: '0.1.0' }) }), '--session', 's1');
  assert.equal(status(r, 'version'), 'UNKNOWN');
  assert.match(r.by.version, /Run guilda:update/);
});

test('a hand-edited config with the new guildaVersion and no schemaVersion: version UNKNOWN', () => {
  const cfg = goodConfig();
  delete cfg.schemaVersion;
  const r = run(project({ config: cfg }), '--session', 's1');
  assert.equal(status(r, 'version'), 'UNKNOWN');
  assert.match(r.by.version, /Run guilda:update/);
});

test('{ not json: version UNKNOWN with no config to compare, project files FAIL', () => {
  const r = run(project({ config: '{ not json' }), '--session', 's1');
  assert.equal(status(r, 'version'), 'UNKNOWN');
  assert.match(r.by.version, /no config to compare/);
  assert.equal(status(r, 'project files present'), 'FAIL');
  assert.equal(r.code, 1);
});

test('no .guilda folder: project files FAIL, hooks UNKNOWN', () => {
  const r = run(tempProject(), '--session', 's1');
  assert.equal(status(r, 'project files present'), 'FAIL');
  assert.equal(status(r, 'hooks live'), 'UNKNOWN');
  assert.equal(status(r, 'extension plugin loaded'), 'UNKNOWN');
  assert.equal(status(r, 'version'), 'UNKNOWN');
});

test('extension loaded: PASS with session and time', () => {
  const r = run(project({ ext: 's1' }), '--session', 's1');
  assert.equal(status(r, 'extension plugin loaded'), 'PASS');
  assert.match(r.by['extension plugin loaded'], /\.guilda\/\.extension-live\.json has this session \(s1, 2026-11-10T00:00:00\.000Z\)/);
});

test('extension did not load: FAIL, exit 1', () => {
  const r = run(project(), '--session', 's1', '--agents', AGENTS);
  assert.equal(status(r, 'extension plugin loaded'), 'FAIL');
  assert.match(r.by['extension plugin loaded'], /the extension guilda-skills did not load\. Check skill-creator and superpowers and their marketplaces/);
  assert.equal(r.code, 1);
});

test('extension marker of an older session: FAIL', () => {
  const r = run(project({ ext: 's0' }), '--session', 's1');
  assert.equal(status(r, 'extension plugin loaded'), 'FAIL');
});

test('no --session: the reference is the hooks marker session', () => {
  const r = run(project({ ext: 's1' }));
  assert.equal(status(r, 'extension plugin loaded'), 'PASS');
  assert.match(r.by['extension plugin loaded'], /\(s1,/);
});

test('no --session and no hooks marker: extension UNKNOWN with the marker time', () => {
  const r = run(project({ hooks: null, ext: 's1' }));
  assert.equal(status(r, 'extension plugin loaded'), 'UNKNOWN');
  assert.match(r.by['extension plugin loaded'], /no session to compare; marker time 2026-11-10T00:00:00\.000Z/);
});

test('the script writes no file', () => {
  const dir = project({ ext: 's1' });
  const list = () => fs.readdirSync(path.join(dir, '.guilda')).sort().join(',');
  const before = list();
  run(dir, '--session', 's1', '--agents', AGENTS);
  assert.equal(list(), before);
});
