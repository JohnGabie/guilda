import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';
import { loadConfig, SETUP_NOTICE } from '../scripts/lib/project.mjs';

const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
).version;
const VERSION_RE = PLUGIN_VERSION.replace(/\./g, '\\.');
const SCRIPT = 'scripts/hooks/session-start.mjs';
const run = (dir, source = 'startup') =>
  runHook(SCRIPT, { hook_event_name: 'SessionStart', source, cwd: dir }, dir);
const context = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;

const NOTICE = SETUP_NOTICE;

for (const source of ['startup', 'clear']) {
  test(`S41: no .guilda folder at ${source}: additionalContext and systemMessage are the R28 notice`, () => {
    const dir = tempProject();
    const r = run(dir, source);
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.equal(out.hookSpecificOutput.additionalContext, NOTICE);
    assert.equal(out.systemMessage, NOTICE);
  });
}

test('S41: at compact and resume: empty stdout', () => {
  const dir = tempProject();
  for (const source of ['compact', 'resume']) {
    const r = run(dir, source);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
});

test('S41: no .guilda folder after the runs', () => {
  const dir = tempProject();
  for (const source of ['startup', 'clear', 'compact', 'resume']) run(dir, source);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

const BROKEN_TAIL = '. guilda runs with safe defaults. Run guilda:init to fix .guilda/config.json.';
const CORE_TEXT = fs.readFileSync(path.join(REPO_ROOT, 'core', 'rules.md'), 'utf8').replace(/\r\n/g, '\n');
const HEADINGS = [...CORE_TEXT.matchAll(/^### (\S+) — (.*)$/gm)];
const TIERS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8'));

test('S16: { not json at startup: the rules, safe defaults and the notice', () => {
  const dir = tempProject({ config: '{ not json' });
  const r = run(dir);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SessionStart');
  const ctx = out.additionalContext;
  const first = HEADINGS[0];
  const last = HEADINGS[HEADINGS.length - 1];
  assert.ok(ctx.includes(`### ${first[1]} — ${first[2]}`));
  assert.ok(ctx.includes(`### ${last[1]} — ${last[2]}`));
  assert.match(ctx, /Languages: replies en, docs en\./);
  assert.ok(ctx.includes(`Tiers: master ${TIERS.master}, journeyman ${TIERS.journeyman}, apprentice ${TIERS.apprentice}`));
  assert.match(ctx, /^Process: full\. Explain: full\.$/m);
  assert.ok(ctx.includes('Full rule blocks: '));
  assert.ok(ctx.includes('guilda: ' + loadConfig(dir).reason + BROKEN_TAIL));
  assert.doesNotMatch(ctx, /guilda updated/);
});

test('S16: the broken-layer context has the R28 heading', () => {
  const dir = tempProject({ config: '{ not json' });
  const ctx = context(run(dir));
  assert.ok(HEADINGS.some((h) => h[1] === 'R28'));
  assert.ok(ctx.includes('### R28 — Tell the user when guilda is not set up'));
});

test('broken project layer: compact and resume give the rules and no notice (S15)', () => {
  const dir = tempProject({ config: '{ not json' });
  for (const source of ['compact', 'resume']) {
    const r = run(dir, source);
    assert.equal(r.code, 0);
    const ctx = context(r);
    assert.match(ctx, /### R1 /);
    assert.doesNotMatch(ctx, /safe defaults/);
    assert.doesNotMatch(ctx, /guilda: /);
  }
});

test('broken layer at compact: the rules, no notice', () => {
  const dir = tempProject({ config: '{ not json', rules: 'P1. Keep it.\n' });
  const ctx = context(run(dir, 'compact'));
  assert.match(ctx, /### R25 /);
  assert.match(ctx, /P1\. Keep it/);
  assert.doesNotMatch(ctx, /Run guilda:init/);
});

test('broken project layer: clear gives the notice', () => {
  const dir = tempProject({ config: '{ not json' });
  const expected = 'guilda: ' + loadConfig(dir).reason + BROKEN_TAIL;
  assert.ok(context(run(dir, 'clear')).includes(expected));
  assert.ok(context(run(dir, 'startup')).includes(expected));
});

test('.guilda without config.json: notice with the reason .guilda/config.json is missing (S15)', () => {
  const dir = tempProject({ rules: '# Project rules\n' });
  assert.ok(context(run(dir)).includes('guilda: .guilda/config.json is missing' + BROKEN_TAIL));
  const compact = context(run(dir, 'compact'));
  assert.match(compact, /### R1 /);
  assert.doesNotMatch(compact, /config\.json is missing/);
});

test('valid config: context has R1, R25 and the project rule P1', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, rules: '# Project rules\n\nP1. Use tabs.\n' });
  const ctx = context(run(dir));
  assert.match(ctx, new RegExp('^guilda ' + VERSION_RE + ' active'));
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

const UPDATE_TEXT = (from, to) =>
  `guilda updated ${from} → ${to}. The project layer works as it is. Run guilda:update to see the changes and to save the new version.`;

test('S42: 0.1.0 to 0.2.0 and 0.1.0 to 1.0.0 give the one text, and no notice line has guilda:init', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: '0.0.1' } });
  const ctx = context(run(dir));
  assert.ok(ctx.includes(UPDATE_TEXT('0.0.1', PLUGIN_VERSION)));
  const root = tempProject();
  fs.mkdirSync(path.join(root, '.claude-plugin'));
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), '{"version":"1.0.0"}');
  const dir2 = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: '0.1.0' } });
  const ctx2 = context(runHookWithRoot(dir2, root));
  assert.ok(ctx2.includes(UPDATE_TEXT('0.1.0', '1.0.0')));
  for (const c of [ctx, ctx2]) {
    for (const line of c.split('\n')) {
      if (line.includes('guilda updated')) assert.doesNotMatch(line, /guilda:init/);
    }
  }
});

test('S18: a 0.1.0 fixture gives the line Process: full. Explain: full.', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'compat', '0.1.0', 'config.json'), 'utf8');
  const ctx = context(run(tempProject({ config: text })));
  assert.match(ctx, /^Process: full\. Explain: full\.$/m);
  const lines = ctx.split('\n');
  const i = lines.findIndex((l) => l.startsWith('Languages: '));
  assert.equal(lines[i + 1] === '' ? lines[i + 2] : lines[i + 1], 'Process: full. Explain: full.');
});

test('process light gives Process: light.', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, process: 'light', explain: 'brief' } });
  assert.match(context(run(dir)), /^Process: light\. Explain: brief\.$/m);
});

test('S18: the bytes of config.json do not change', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const file = path.join(dir, '.guilda', 'config.json');
  const before = fs.readFileSync(file);
  run(dir);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('S18: .guilda/.gitignore gets .hooks-live.json, and a second run does not change its bytes', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  run(dir);
  const file = path.join(dir, '.guilda', '.gitignore');
  const first = fs.readFileSync(file);
  assert.ok(first.toString().split('\n').includes('.hooks-live.json'));
  run(dir);
  assert.deepEqual(fs.readFileSync(file), first);
});

test('the marker has the session ID, the version and a time', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  runHook(SCRIPT, { hook_event_name: 'SessionStart', source: 'startup', cwd: dir, session_id: 'sess-1' }, dir);
  const m = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', '.hooks-live.json'), 'utf8'));
  assert.equal(m.sessionId, 'sess-1');
  assert.equal(m.version, PLUGIN_VERSION);
  assert.ok(!Number.isNaN(Date.parse(m.at)));
  assert.equal(new Date(m.at).toISOString(), m.at);
});

test('no .guilda folder: no marker and no folder', () => {
  const dir = tempProject();
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('a .gitignore that cannot be written: context printed, no marker, exit 0', { skip: process.platform === 'win32' }, () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  // A directory in place of the file makes ensureIgnored throw, even for a root user.
  fs.mkdirSync(path.join(dir, '.guilda', '.gitignore'));
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.match(context(r), /### R1 /);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', '.hooks-live.json')), false);
});

test('schemaVersion 99 gives the newer notice (S18)', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, schemaVersion: 99 } });
  assert.match(context(run(dir)), /schemaVersion 99, newer than this guilda knows/);
});

test('an invalid process gives its notice at startup and not at compact', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, process: 'bogus' } });
  const start = context(run(dir));
  assert.match(start, /invalid process value/);
  assert.match(start, /^Process: full\./m);
  assert.doesNotMatch(context(run(dir, 'compact')), /invalid process value/);
});

test('no notice when versions are equal', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: PLUGIN_VERSION } });
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

import { spawn, spawnSync } from 'node:child_process';
function runHookWithRoot(dir, root) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: JSON.stringify({ source: 'startup', cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: root },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// S47: the context has the short form of each core rule (section 3h).
const CORE_RULES = fs.readFileSync(path.join(REPO_ROOT, 'core', 'rules.md'), 'utf8').replace(/\r\n/g, '\n');
const RULE_BLOCKS = [...CORE_RULES.matchAll(/^### (\S+) — (.*)\nRule: (.*)\nWhy: .*\nCheck: (\w+) — .*$/gm)]
  .map((m) => ({ id: m[1], title: m[2], rule: `Rule: ${m[3]}`, level: m[4] }));
const ctxOf = (rules) => context(run(tempProject({ config: MINIMAL_CONFIG, rules })));

test('the context has the R19 law line and no Rule: line of a law rule', () => {
  const ctx = ctxOf('# Project rules\n');
  const lines = ctx.split('\n');
  assert.ok(lines.includes('### R19 — No secrets or absolute paths in commits (law — enforced by a hook)'));
  const laws = RULE_BLOCKS.filter((b) => b.level === 'law');
  assert.ok(laws.length >= 3);
  for (const b of laws) assert.ok(!lines.includes(b.rule), b.id);
});

test('the context has the R1 heading with (gate) and the Rule: line of R1 under it', () => {
  const lines = ctxOf('# Project rules\n').split('\n');
  const i = lines.indexOf('### R1 — Source of truth (gate)');
  assert.ok(i >= 0);
  assert.equal(lines[i + 1], RULE_BLOCKS.find((b) => b.id === 'R1').rule);
});

test('no context line starts with Why: or Check:', () => {
  for (const l of ctxOf('# Project rules\n').split('\n')) assert.doesNotMatch(l, /^(Why|Check):/);
});

test('the context has the Full rule blocks: line with the path of core/rules.md', () => {
  const lines = ctxOf('# Project rules\n').split('\n');
  assert.ok(lines.includes('Full rule blocks: ' + REPO_ROOT.split(path.sep).join('/') + '/core/rules.md'));
});

test('context has 110 non-blank lines or fewer with a 20-line project rules file and a version notice', () => {
  const rules = Array.from({ length: 20 }, (_, i) => `P${i + 1}. Rule number ${i + 1}.`).join('\n');
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, guildaVersion: '0.0.1' }, rules });
  const ctx = context(run(dir));
  assert.match(ctx, /guilda updated/);
  const n = ctx.split('\n').filter((l) => l.trim() !== '').length;
  assert.ok(n <= 110, `got ${n} lines`);
});

// S13: the extension plugin did not load (section 3c, method of L4: the marker file).
const EXT_NOTICE =
  'guilda: the extension plugin guilda-skills did not load. Its skills are off; the core laws are on. ' +
  'Check its two dependencies, skill-creator and superpowers, and their marketplaces.';
const runWithSession = (dir, source, sessionId) =>
  runHook(SCRIPT, { hook_event_name: 'SessionStart', source, cwd: dir, session_id: sessionId }, dir);
const writeLive = (dir, sessionId) =>
  fs.writeFileSync(
    path.join(dir, '.guilda', '.extension-live.json'),
    JSON.stringify({ sessionId, at: '2026-11-10T00:00:00.000Z' }) + '\n',
  );
const countOf = (text, needle) => text.split(needle).length - 1;

test('S13: the extension did not load: one notice with skill-creator and superpowers, and it does not say which one is missing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = runWithSession(dir, 'startup', 's1');
  const out = JSON.parse(r.stdout);
  assert.equal(countOf(out.hookSpecificOutput.additionalContext, EXT_NOTICE), 1);
  assert.equal(out.systemMessage, EXT_NOTICE);
  assert.match(EXT_NOTICE, /skill-creator/);
  assert.match(EXT_NOTICE, /superpowers/);
  // At clear too, and a stale marker (another session) means not loaded.
  writeLive(dir, 's0');
  const clear = JSON.parse(runWithSession(dir, 'clear', 's1').stdout);
  assert.equal(countOf(clear.hookSpecificOutput.additionalContext, EXT_NOTICE), 1);
  assert.equal(clear.systemMessage, EXT_NOTICE);
});

test('S13: a broken project layer also gets the notice when the extension did not load', () => {
  const dir = tempProject({ config: '{ not json' });
  const out = JSON.parse(runWithSession(dir, 'startup', 's1').stdout);
  assert.equal(countOf(out.hookSpecificOutput.additionalContext, EXT_NOTICE), 1);
  assert.equal(out.systemMessage, EXT_NOTICE);
});

test('the extension loaded: no notice', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeLive(dir, 's1');
  for (const source of ['startup', 'clear']) {
    const out = JSON.parse(runWithSession(dir, source, 's1').stdout);
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /guilda-skills did not load/);
    assert.equal(out.systemMessage, undefined);
  }
});

test('no notice at compact and resume, and no wait', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const source of ['compact', 'resume']) {
    const t0 = Date.now();
    const out = JSON.parse(runWithSession(dir, source, 's1').stdout);
    assert.ok(Date.now() - t0 < 280, 'the hook waited');
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /guilda-skills did not load/);
    assert.equal(out.systemMessage, undefined);
  }
});

test('no .guilda folder: only the R28 notice', () => {
  const dir = tempProject();
  const out = JSON.parse(runWithSession(dir, 'startup', 's1').stdout);
  assert.equal(out.hookSpecificOutput.additionalContext, SETUP_NOTICE);
  assert.equal(out.systemMessage, SETUP_NOTICE);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('a marker that parses with the right session ID written late (within the limit) counts as loaded', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const script = `setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],JSON.stringify({sessionId:'s1',at:'x'})),100)`;
  const child = spawn(process.execPath, ['-e', script, path.join(dir, '.guilda', '.extension-live.json')], { stdio: 'ignore' });
  const out = JSON.parse(runWithSession(dir, 'startup', 's1').stdout);
  child.kill();
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /guilda-skills did not load/);
});

test('a marker with a parse error means not yet, then not loaded', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.writeFileSync(path.join(dir, '.guilda', '.extension-live.json'), '{ nope');
  const out = JSON.parse(runWithSession(dir, 'startup', 's1').stdout);
  assert.equal(out.systemMessage, EXT_NOTICE);
});

test('the session start writes .extension-live.json into .gitignore', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  run(dir);
  assert.ok(fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').split('\n').includes('.extension-live.json'));
});
