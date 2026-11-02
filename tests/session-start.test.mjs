import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
).version;
const SCRIPT = 'scripts/hooks/session-start.mjs';
const run = (dir, source = 'startup') =>
  runHook(SCRIPT, { hook_event_name: 'SessionStart', source, cwd: dir }, dir);
const context = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;

test('no config: empty stdout, exit 0', () => {
  const r = run(tempProject());
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('invalid config: one notice line and no rules', () => {
  const r = run(tempProject({ config: '{ not json' }));
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SessionStart');
  assert.match(out.additionalContext, /^guilda: /);
  assert.equal(out.additionalContext.split('\n').length, 1);
  assert.doesNotMatch(out.additionalContext, /R1\b/);
});

test('valid config: context has R1, R25 and the project rule P1', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, rules: '# Project rules\n\nP1. Use tabs.\n' });
  const ctx = context(run(dir));
  assert.match(ctx, /^guilda 0\.1\.0 active/);
  assert.match(ctx, /### R1 /);
  assert.match(ctx, /### R25 /);
  assert.match(ctx, /P1\. Use tabs/);
  assert.match(ctx, /journal-skeleton\.mjs/);
  assert.ok(ctx.includes(REPO_ROOT.split(path.sep).join('/') + '/core/glossary.md'));
  assert.match(ctx, /replies/);
  assert.match(ctx, /master/);
});

test('compact: context has the newest diary', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.journal'));
  fs.writeFileSync(path.join(dir, '.journal', '2026-01-01.md'), 'OLD ENTRY\n');
  fs.writeFileSync(path.join(dir, '.journal', '2026-02-01.md'), 'NEW ENTRY\n');
  const ctx = context(run(dir, 'compact'));
  assert.match(ctx, /NEW ENTRY/);
  assert.doesNotMatch(ctx, /OLD ENTRY/);
  assert.doesNotMatch(context(run(dir, 'startup')), /NEW ENTRY/);
});

test('version notice for 0.1.0 to 0.2.0', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: '0.0.1' } });
  const ctx = context(run(dir));
  assert.match(ctx, /guilda updated 0\.0\.1 → 0\.1\.0; run guilda:init to review the project layer/);
});

test('major notice', () => {
  // installed is 0.1.0, so a config newer than 0.1.0 is not an update; use a fake plugin root.
  const root = tempProject();
  fs.mkdirSync(path.join(root, '.claude-plugin'));
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), '{"version":"1.0.0"}');
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: '0.9.0' } });
  const r = runHookWithRoot(dir, root);
  assert.match(context(r), /guilda:init is required/);
});

test('no notice when versions are equal', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assert.doesNotMatch(context(run(dir)), /guilda updated/);
});

test('escalation line for a rule with 2 violations', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const rec = (rule) => JSON.stringify({ ts: 't', rule, level: 'gate', source: 's', action: 'a', branch: 'b' });
  fs.writeFileSync(path.join(dir, '.guilda', 'violations.jsonl'),
    [rec('R7'), rec('R7'), rec('R9')].join('\n') + '\n');
  const ctx = context(run(dir));
  assert.match(ctx, /R7: 2 violations — propose a stronger check \(design 6\.13\)/);
  assert.doesNotMatch(ctx, /R9: 1 violations/);
});

test('context has 150 non-blank lines or fewer with a 20-line project rules file', () => {
  const rules = Array.from({ length: 20 }, (_, i) => `P${i + 1}. Rule number ${i + 1}.`).join('\n');
  const ctx = context(run(tempProject({ config: MINIMAL_CONFIG, rules })));
  const lines = ctx.split('\n').filter((l) => l.trim() !== '');
  assert.ok(lines.length <= 150, `got ${lines.length} lines`);
});

import { spawnSync } from 'node:child_process';
function runHookWithRoot(dir, root) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: JSON.stringify({ source: 'startup', cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: root },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
