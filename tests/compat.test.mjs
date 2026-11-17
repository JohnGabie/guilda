import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projectState, checkStrict } from '../scripts/lib/project.mjs';
import { changesBetween } from '../scripts/changelog.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tempProject, runHook, REPO_ROOT } from './helpers.mjs';

// The config that guilda:init of each published version wrote, and the CHANGELOG of that version (S19).
// The eight lines of section 3d that the session start adds to .guilda/.gitignore.
const NEW_IGNORE = ['queue/', 'audit.jsonl', 'transcripts/', 'trace/', 'status.md', 'logs/', '.doctor-last.json', '.init-progress.json'];
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

  test(`${version}: the session start runs on the fixture of each published version with exit 0 and a Process line`, () => {
    const dir = tempProject({ config: fs.readFileSync(fixture(version, 'config.json'), 'utf8') });
    const r = runHook('scripts/hooks/session-start.mjs', { hook_event_name: 'SessionStart', source: 'startup', cwd: dir }, dir);
    assert.equal(r.code, 0);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /^Process: full\. Explain: full\.$/m);
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

// S31: a 0.2.0 project layer works with 0.3.0 (D40).
test('a 0.2.0 project layer works with 0.3.0', () => {

  const dir = tempProject({ config: fs.readFileSync(fixture('0.2.0', 'config.json'), 'utf8'), git: true });
  const run = (cmd, ...args) => execFileSync('git', [cmd, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const plan = path.join('docs', 'superpowers', 'specs', 'old.plan.md');
  fs.mkdirSync(path.join(dir, path.dirname(plan)), { recursive: true });
  fs.copyFileSync(fixture('0.2.0', 'old.plan.md'), path.join(dir, plan));
  run('add', '--', plan, '.guilda/config.json');
  run('commit', '-q', '-m', 'plan of 0.2.0');
  const base = run('rev-parse', 'HEAD');
  // guilda:update sets the version.
  const config = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'config.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), JSON.stringify({ ...config, guildaVersion: '0.3.0' }, null, 2));
  run('add', '--', '.guilda/config.json');
  run('commit', '-q', '-m', 'guilda 0.3.0');
  const briefText = fs.readFileSync(fixture('0.2.0', 'brief.md'), 'utf8').replace('__BASE__', base);
  fs.writeFileSync(path.join(dir, 'brief.md'), briefText);
  assert.ok(!fs.existsSync(path.join(dir, '.guilda', 'queue')));
  assert.ok(!fs.existsSync(path.join(dir, '.guilda', 'trace')));
  const configBefore = fs.readFileSync(path.join(dir, '.guilda', 'config.json'));

  // The session start: no new notice, the eight lines in .guilda/.gitignore.
  const s = runHook('scripts/hooks/session-start.mjs', { hook_event_name: 'SessionStart', source: 'startup', cwd: dir }, dir);
  assert.equal(s.code, 0, s.stderr);
  const ctx = JSON.parse(s.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^Process: full\. Explain: full\.$/m);
  assert.doesNotMatch(ctx, /guilda:init|guilda:update|new guilda version|no queue|notice/i, ctx);
  // The only message the run may carry is the extension-plugin notice of the test host, never a project-layer notice.
  const message = JSON.parse(s.stdout).systemMessage ?? '';
  assert.doesNotMatch(message, /guilda:init|guilda:update|no queue|schema|migrat|new guilda version/i, message);
  const ignore = fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').split(/\r?\n/);
  for (const line of NEW_IGNORE) assert.ok(ignore.includes(line), `missing ignore line ${line}`);

  // status.
  const st = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'status.mjs'), dir], { encoding: 'utf8' });
  assert.equal(st.status, 0, st.stderr);
  assert.equal(st.stdout, 'guilda status: no queue yet\n');

  // trace check: one LEGACY line for each plan task, exit 0, no NO-USES.
  const tr = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'trace.mjs'), dir, 'check'], { encoding: 'utf8' });
  assert.equal(tr.status, 0, tr.stdout + tr.stderr);
  const out = tr.stdout.split('\n');
  assert.deepEqual(out.filter((l) => l.startsWith('LEGACY')).sort(), ['LEGACY old.plan#T1', 'LEGACY old.plan#T2']);
  assert.doesNotMatch(tr.stdout, /NO-USES/);
  assert.ok(fs.existsSync(path.join(dir, '.guilda', 'trace', 'index.json')));

  // The dispatch with the brief file is not refused.
  const d = runHook('scripts/hooks/pre-agent.mjs', { tool_name: 'Agent', tool_input: { subagent_type: 'guilda:executor', prompt: 'Do the task.\nBrief file: brief.md\n' } }, dir);
  assert.equal(d.code, 0, d.stderr);
  assert.equal(d.stdout, '');

  assert.deepEqual(fs.readFileSync(path.join(dir, '.guilda', 'config.json')), configBefore);
});
