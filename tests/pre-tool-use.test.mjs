import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/pre-tool-use.mjs';
// Fake secrets are built in code so this file holds no literal token.
const GH = 'ghp_' + 'A'.repeat(36);

const bash = (dir, command) =>
  runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: dir }, dir);
const file = (dir, tool, file_path) =>
  runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path }, cwd: dir }, dir);

const violations = (dir) => {
  try {
    return fs
      .readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const stage = (dir, rel, content) => {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  spawnSync('git', ['add', rel], { cwd: dir, stdio: 'ignore' });
};
const assertAllow = (r) => {
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
};
const assertDeny = (r) => {
  assert.equal(r.code, 0);
  const d = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(d.hookEventName, 'PreToolUse');
  assert.equal(d.permissionDecision, 'deny');
  return d.permissionDecisionReason;
};

test('no config: allow, nothing written', () => {
  const dir = tempProject({ git: true });
  stage(dir, 'a.txt', GH);
  assertAllow(bash(dir, 'git commit -m x'));
  assertAllow(file(dir, 'Write', path.join(dir, 'docs/superpowers/plans/new.md')));
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('invalid config: allow silently', () => {
  const dir = tempProject({ config: '{ nope', git: true });
  stage(dir, 'a.txt', GH);
  assertAllow(bash(dir, 'git commit -m x'));
});

test('git commit with a staged fake ghp_ token: deny, one R19 record, reason holds no secret', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'src/a.txt', `ok\n${GH}\n`);
  const r = bash(dir, 'git commit -m "add"');
  const reason = assertDeny(r);
  assert.equal(reason, 'R19: secret in src/a.txt:2 — remove it before commit');
  assert.ok(!r.stdout.includes(GH));
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R19');
  assert.equal(v[0].level, 'law');
  assert.equal(v[0].source, 'pre-tool-use');
  assert.ok(!JSON.stringify(v[0]).includes(GH));
});

test('a commit chained after other commands is scanned', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', GH);
  assertDeny(bash(dir, 'git add -A && git commit -m x'));
});

test('ignored path: allow', () => {
  const dir = tempProject({
    config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } },
    git: true,
  });
  stage(dir, 'tests/fixture.txt', GH);
  assertAllow(bash(dir, 'git commit -m x'));
  assert.equal(violations(dir).length, 0);
});

test('ignore skips only the matching file', () => {
  const dir = tempProject({
    config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } },
    git: true,
  });
  stage(dir, 'tests/fixture.txt', GH);
  stage(dir, 'src/b.txt', GH);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /src\/b\.txt:1/);
});

test('an absolute Windows path in a staged file: deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'notes.md', 'see ' + 'C:' + '\\Users\\name\\x\n');
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19: abs-path in notes\.md:1 /);
});

test('only added lines are scanned', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  fs.writeFileSync(path.join(dir, 'old.txt'), GH + '\n');
  spawnSync('git', ['add', 'old.txt'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'seed', '--no-verify'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'old.txt'), 'clean\n');
  spawnSync('git', ['add', 'old.txt'], { cwd: dir });
  assertAllow(bash(dir, 'git commit -m x'));
});

test('not a git repository: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assertAllow(bash(dir, 'git commit -m x'));
});

test('nothing staged: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  assertAllow(bash(dir, 'git commit -m x'));
});

test('git status: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', GH);
  assertAllow(bash(dir, 'git status'));
  assert.equal(violations(dir).length, 0);
});

test('Write of a new file in docs/superpowers/plans: deny, one R4 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const reason = assertDeny(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'plans', 'new.md')));
  assert.equal(reason, 'R4: plans are a "## Plan: Part N" section of the feature MD');
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R4');
});

test('a relative path and backslashes are resolved against the project', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assertDeny(file(dir, 'Write', 'docs\\superpowers\\plans\\new.md'));
  assertDeny(file(dir, 'Write', 'docs/superpowers/plans/sub/new.md'));
});

test('Edit of an existing plan file: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const p = path.join(dir, 'docs', 'superpowers', 'plans', 'old.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x');
  assertAllow(file(dir, 'Edit', p));
  assert.equal(violations(dir).length, 0);
});

test('Write elsewhere: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  assertAllow(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'specs', 'new.md')));
  assertAllow(file(dir, 'Write', 'src/a.js'));
});
