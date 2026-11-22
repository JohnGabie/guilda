import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/pre-tool-use.mjs';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
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

// A config that fails checkSchema: MINIMAL_CONFIG without tiers.
const { tiers: _tiers, ...NO_TIERS } = MINIMAL_CONFIG;

/** A git project with a .guilda folder. `config` is a string, an object, or undefined for no config.json. */
const brokenProject = (config) => {
  const dir = tempProject({ git: true });
  fs.mkdirSync(path.join(dir, '.guilda'));
  if (config !== undefined) {
    const text = typeof config === 'string' ? config : JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), text);
  }
  return dir;
};

test('broken project layer: a staged token is refused with R19 (S9)', () => {
  for (const [name, config] of [
    ['no config.json', undefined],
    ['not JSON', '{ not json'],
    ['no tiers', NO_TIERS],
  ]) {
    const dir = brokenProject(config);
    stage(dir, 'a.txt', GH);
    assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19:/, name);
    const v = violations(dir);
    assert.equal(v.length, 1, name);
    assert.equal(v[0].rule, 'R19', name);
  }
});

test('broken project layer: a new plan file is refused with R4 (S10)', () => {
  const dir = brokenProject('{ not json');
  assert.match(assertDeny(file(dir, 'Write', path.join(dir, 'docs/superpowers/plans/new.md'))), /^R4:/);
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R4');
});

test('broken project layer: the scan.ignore of a broken config is not used', () => {
  const dir = brokenProject({ ...NO_TIERS, scan: { ignore: ['**'] } });
  stage(dir, 'a.txt', GH);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19:/);
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
  assertDeny(bash(dir, 'git status && git commit -m x'));
});

test('git add chained before a commit: deny with a reason, no R19 record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  fs.writeFileSync(path.join(dir, 'new.txt'), GH);
  for (const cmd of ['git add new.txt && git commit -m x', 'git add -A; git commit -m x']) {
    assert.match(assertDeny(bash(dir, cmd)), /^R19: run git add in its own command/);
  }
  assert.equal(violations(dir).length, 0);
});

test('a staged token passes no scan after the working file is cleaned', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  seed(dir, 'a.txt', 'clean\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), `${GH}\n`);
  spawnSync('git', ['add', 'a.txt'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'clean\n');
  assertDeny(bash(dir, 'git commit -m x'));
});

test('a new staged file that is gone from the working tree: deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  seed(dir, 'a.txt', 'clean\n');
  stage(dir, 'b.txt', GH);
  fs.rmSync(path.join(dir, 'b.txt'));
  assertDeny(bash(dir, 'git commit -m x'));
});

test('no commits yet and an unstaged tracked token: deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', 'clean\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), GH);
  assertDeny(bash(dir, 'git commit -am x'));
});

test('cd before a commit scans that directory', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const wt = path.join(dir, 'wt dir');
  fs.mkdirSync(wt);
  spawnSync('git', ['init'], { cwd: wt, stdio: 'ignore' });
  stage(wt, 'a.txt', GH);
  assertDeny(bash(dir, 'cd "wt dir" && git commit -m x'));
});

test('the session cwd is the start of the scan, the config stays in the project', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const wt = path.join(dir, 'wt');
  fs.mkdirSync(wt);
  spawnSync('git', ['init'], { cwd: wt, stdio: 'ignore' });
  stage(wt, 'a.txt', GH);
  const r = runHook(
    SCRIPT,
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: wt },
    dir,
  );
  assertDeny(r);
  assert.equal(violations(dir).length, 1);
});

test('the second commit of a chain is scanned', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, 'clean'));
  fs.mkdirSync(path.join(dir, 'dirty'));
  spawnSync('git', ['init'], { cwd: path.join(dir, 'clean'), stdio: 'ignore' });
  spawnSync('git', ['init'], { cwd: path.join(dir, 'dirty'), stdio: 'ignore' });
  stage(path.join(dir, 'dirty'), 'a.txt', GH);
  assertDeny(bash(dir, 'git -C clean commit -m a && git -C dirty commit -m b'));
});

test('an added line that looks like a file header does not hide the next line', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', `++ /dev/null\n${GH}\n`);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /a\.txt:2/);
});

test('an added line that names an ignored path does not move later lines there', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } }, git: true });
  stage(dir, 'a.txt', `++ b/tests/x\n${GH}\n`);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /a\.txt:2/);
});

test('git config cannot change what the scan reads', () => {
  for (const [key, value] of [
    ['diff.external', 'true'],
    ['diff.noprefix', 'true'],
    ['diff.relative', 'true'],
    ['color.ui', 'always'],
  ]) {
    const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
    spawnSync('git', ['config', key, value], { cwd: dir });
    stage(dir, 'a.txt', GH);
    assert.match(assertDeny(bash(dir, 'git commit -m x')), /in a\.txt:1/, key);
  }
});

test('a textconv filter cannot hide a token', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  spawnSync('git', ['config', 'diff.hide.textconv', 'true'], { cwd: dir });
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.txt diff=hide\n');
  stage(dir, 'a.txt', GH);
  assertDeny(bash(dir, 'git commit -m x'));
});

test('diff.mnemonicPrefix does not break an ignored path', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } }, git: true });
  spawnSync('git', ['config', 'diff.mnemonicPrefix', 'true'], { cwd: dir });
  seed(dir, 'a.txt', 'clean\n');
  stage(dir, 'tests/f.txt', GH);
  assertAllow(bash(dir, 'git commit -m x'));
});

test('a commit message that holds shell words: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', 'clean\n');
  assertAllow(bash(dir, 'git commit -m "git add x && git commit y"'));
});

test('echo of a commit command: scanned, fail closed', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  assertAllow(bash(dir, 'echo "git commit -m x"'));
  stage(dir, 'a.txt', GH);
  assertDeny(bash(dir, 'echo "git commit -m x"'));
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
  assert.equal(reason, 'R4: plans are a "## Plan: Part N" section of the feature MD, or <feature>.plan.md next to it');
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

const seed = (dir, rel, content) => {
  fs.writeFileSync(path.join(dir, rel), content);
  spawnSync('git', ['add', rel], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir, stdio: 'ignore' });
};

test('git commit -am with an unstaged tracked token: deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  seed(dir, 'a.txt', 'clean\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), `clean\n${GH}\n`);
  assert.match(assertDeny(bash(dir, 'git commit -am x')), /^R19: secret in a\.txt:2 /);
  assertDeny(bash(dir, 'git commit -a -m x'));
});

test('git commit with a pathspec and an unstaged tracked token: deny', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  seed(dir, 'a.txt', 'clean\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), `clean\n${GH}\n`);
  assertDeny(bash(dir, 'git commit -m x a.txt'));
});

test('global git options before commit do not skip the scan', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', GH);
  for (const cmd of [
    'git -C . commit -m x',
    'git -c core.x=y commit -m x',
    'git --no-pager commit -m x',
    'git -C "." -c a=b --no-pager commit -m x',
  ]) {
    assertDeny(bash(dir, cmd));
  }
});

test('-C runs the scan in that directory', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const sub = path.join(dir, 'sub dir');
  fs.mkdirSync(sub);
  spawnSync('git', ['init'], { cwd: sub, stdio: 'ignore' });
  stage(sub, 'a.txt', GH);
  assertDeny(bash(dir, 'git -C "sub dir" commit -m x'));
});

test('a repository with no commits and a staged token: deny (cached fallback)', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'a.txt', GH);
  assertDeny(bash(dir, 'git commit -m x'));
});

test('a tracked change that is clean: allow with -a', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  seed(dir, 'a.txt', 'clean\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'still clean\n');
  assertAllow(bash(dir, 'git commit -am x'));
});

test('forms that the reader cannot resolve still scan: deny', () => {
  for (const cmd of [
    'true && \\\n  git commit -m x',
    'cd "$PWD" && git commit -m x',
    'cd $(git rev-parse --show-toplevel) && git commit -m x',
    'git -C "$PWD" commit -m x',
    'git --git-dir="$PWD/.git" commit -m x',
    'cd /no/such/place; git commit -m x',
    'timeout 30 git commit -m x',
    'echo x | xargs git commit -m',
    'out="$(git commit -m x)"',
    "cat >f <<'E'\nit's\nE\ngit commit -m x",
  ]) {
    const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
    stage(dir, 'a.txt', GH);
    assert.match(assertDeny(bash(dir, cmd)), /^R19: secret/, cmd);
  }
});

test('a subshell or popd cannot move the scan away from the session directory', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const other = tempProject({ git: true });
  stage(dir, 'a.txt', GH);
  assertDeny(bash(dir, `(cd "${other}" && git status); git commit -m x`));
  assertDeny(bash(dir, `pushd "${other}"; popd; git commit -m x`));
});

test('a heredoc that writes a script with git commands: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  assertAllow(bash(dir, "cat > d.sh <<'EOF'\ngit add .\ngit commit -m release\nEOF"));
});

test('attributes and config cannot make a text file binary for the scan', () => {
  const setups = [
    (d) => fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt -diff\n'),
    (d) => fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt binary\n'),
    (d) => fs.writeFileSync(path.join(d, '.git', 'info', 'attributes'), '*.txt -diff\n'),
  ];
  for (const setup of setups) {
    const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
    setup(dir);
    stage(dir, 'a.txt', GH);
    assertDeny(bash(dir, 'git commit -m x'));
  }
  const nul = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(nul, 'a.txt', `x\0y\n${GH}\n`);
  assertDeny(bash(nul, 'git commit -m x'));
});

test('diff.orderFile cannot stop the scan', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  spawnSync('git', ['config', 'diff.orderFile', '/no/such/file'], { cwd: dir });
  stage(dir, 'a.txt', GH);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19: secret/);
});

test('blank context lines cannot move a token to an ignored file', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: ['f.txt'] } }, git: true });
  spawnSync('git', ['config', 'diff.suppressBlankEmpty', 'true'], { cwd: dir });
  spawnSync('git', ['config', 'diff.interHunkContext', '5'], { cwd: dir });
  seed(dir, 'f.txt', 'a\n\nb\n');
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n\ny\n');
  stage(dir, 'z.txt', `${GH}\n`);
  spawnSync('git', ['add', 'f.txt'], { cwd: dir });
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /z\.txt:1/);
});

test('a repository whose diff git cannot read: deny, no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  spawnSync('git', ['config', 'diff.algorithm', 'nonsense'], { cwd: dir });
  stage(dir, 'a.txt', 'clean\n');
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19: the scan cannot read the diff/);
  assert.equal(violations(dir).length, 0);
});

test('a lone git add of a file named for commits: allow', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  assertAllow(bash(dir, 'git add .pre-commit-config.yaml'));
});

test('a text mention in another directory names that directory and records nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const wt = tempProject({ git: true });
  stage(dir, 'a.txt', GH);
  const r = runHook(
    SCRIPT,
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'gh pr create --body "git commit done"' }, cwd: wt },
    dir,
  );
  const reason = assertDeny(r);
  assert.ok(reason.includes(dir), reason);
  assert.equal(violations(dir).length, 0);
});

test('a worktree commit with the session directory form ignores a dirty main project', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const wt = tempProject({ git: true });
  stage(dir, 'a.txt', GH);
  stage(wt, 'b.txt', 'clean\n');
  for (const command of ['cd "$(git rev-parse --show-toplevel)" && git commit -m y', 'git -C "$PWD" commit -m y']) {
    const r = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: wt }, dir);
    assertAllow(r);
  }
});

test('a session directory form after a cd to another repository scans that repository', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  const other = tempProject({ git: true });
  stage(other, 'k.txt', GH);
  for (const command of [
    `cd "${other}" && cd "$(git rev-parse --show-toplevel)" && git commit -m x`,
    `cd "${other}" && cd "$PWD" && git commit -m x`,
  ]) {
    const r = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: dir }, dir);
    assertDeny(r);
  }
});

test('a NUL byte in a target does not throw, and the session directory is still scanned', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  stage(dir, 'k.txt', GH);
  for (const command of ['cd \u0000 && git commit -m x', 'GIT_DIR=\u0000 git commit -m x']) {
    const r = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: dir }, dir);
    assertDeny(r);
    assert.doesNotMatch(r.stderr, /options\.cwd|null bytes/, command);
  }
});

const PLANS_TEXT = 'R4: plans are a "## Plan: Part N" section of the feature MD, or <feature>.plan.md next to it';
const ORPHAN_TEXT = 'R4: <name>.plan.md needs <name>.md in the same folder';

/** A project with a .guilda folder and docs/superpowers/specs/login.md, but no billing.md and no plan file. */
const specProject = (config = MINIMAL_CONFIG, opts = {}) => {
  const dir = tempProject({ config, ...opts });
  fs.mkdirSync(path.join(dir, 'docs', 'superpowers', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'superpowers', 'specs', 'login.md'), '# login\n');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'notes\n');
  return dir;
};

test('S11: login.plan.md next to login.md passes; docs/superpowers/plans/login.md is refused; billing.plan.md with no billing.md is refused', () => {
  const dir = specProject();
  assertAllow(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'specs', 'login.plan.md')));
  assert.equal(violations(dir).length, 0);
  assert.match(assertDeny(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'plans', 'login.md'))), /^R4:/);
  assert.equal(assertDeny(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'specs', 'billing.plan.md'))), ORPHAN_TEXT);
  const v = violations(dir);
  assert.equal(v.length, 2);
  assert.deepEqual(
    v.map((r) => [r.rule, r.level, r.source, r.action]),
    [
      ['R4', 'law', 'pre-tool-use', 'new file refused in docs/superpowers/plans'],
      ['R4', 'law', 'pre-tool-use', 'orphan plan file refused'],
    ],
  );
});

test('S11: an existing orphan plan file can be edited', () => {
  const dir = specProject();
  const p = path.join(dir, 'docs', 'superpowers', 'specs', 'billing.plan.md');
  fs.writeFileSync(p, 'x');
  assertAllow(file(dir, 'Edit', p));
  assert.equal(violations(dir).length, 0);
});

// The commands of S46 and the result of each: a deny text, or null for a pass.
const S46 = [
  ['cat > docs/superpowers/plans/x.md', PLANS_TEXT],
  ['echo text | tee docs/superpowers/plans/x.md', PLANS_TEXT],
  ['echo text >> docs/superpowers/plans/x.md', PLANS_TEXT],
  ['cp notes.md docs/superpowers/plans/x.md', PLANS_TEXT],
  ['touch docs/superpowers/specs/billing.plan.md', ORPHAN_TEXT],
  ['echo text > docs/superpowers/specs/login.plan.md', null],
  ['cat docs/superpowers/plans/x.md', null],
  ['P=docs/superpowers/plans/x.md; cat > "$P"', null],
  ['mv notes.md docs/superpowers/plans/x.md', PLANS_TEXT],
  ['cd docs/superpowers && touch plans/x.md', PLANS_TEXT],
  ['cd "$DOCS" && touch plans/x.md', null],
];

S46.forEach(([command, expected], i) => {
  test(`S46 command ${i + 1}: ${command} -> ${expected ? 'refused with R4' : 'passes'}`, () => {
    const dir = specProject();
    const r = bash(dir, command);
    if (expected) assert.equal(assertDeny(r), expected);
    else {
      assertAllow(r);
      assert.equal(violations(dir).length, 0);
    }
  });
});

test('S46: each refusal adds one R4 record', () => {
  const dir = specProject();
  let refused = 0;
  for (const [command, expected] of S46) {
    const r = bash(dir, command);
    if (!expected) continue;
    assertDeny(r);
    refused += 1;
    const v = violations(dir);
    assert.equal(v.length, refused, command);
    const last = v[v.length - 1];
    assert.equal(last.rule, 'R4', command);
    assert.equal(last.level, 'law', command);
    assert.equal(last.source, 'pre-tool-use', command);
    const action = expected === ORPHAN_TEXT ? 'orphan plan file refused' : 'new file refused in docs/superpowers/plans';
    assert.equal(last.action, action, command);
  }
  assert.equal(refused, 7);
});

test('S46: a cd that the session started in a subfolder is followed from the hook cwd', () => {
  const dir = specProject();
  const cwd = path.join(dir, 'docs', 'superpowers');
  const r = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'touch plans/x.md' }, cwd }, dir);
  assert.equal(assertDeny(r), PLANS_TEXT);
});

test('S46: a redirection with no space and a quoted path with a space are refused', () => {
  const dir = specProject();
  assert.equal(assertDeny(bash(dir, 'echo x >docs/superpowers/plans/x.md')), PLANS_TEXT);
  assert.equal(assertDeny(bash(dir, 'touch "docs/superpowers/plans/my plan.md"')), PLANS_TEXT);
});

test('the R19 scan still runs after the R4 check', () => {
  const dir = specProject(MINIMAL_CONFIG, { git: true });
  stage(dir, 'a.txt', GH);
  assert.match(assertDeny(bash(dir, 'echo text > notes.txt && git commit -m x')), /^R19:/);
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R19');
});

test('S2: the R4 and R19 cases with process light', () => {
  const light = { ...MINIMAL_CONFIG, process: 'light' };
  const dir = specProject(light, { git: true });
  assert.match(assertDeny(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'plans', 'new.md'))), /^R4:/);
  stage(dir, 'a.txt', GH);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19:/);
  assert.deepEqual(
    violations(dir).map((r) => [r.rule, r.level]),
    [
      ['R4', 'law'],
      ['R19', 'law'],
    ],
  );
});

test('no .guilda folder: command 1 passes', () => {
  const dir = tempProject();
  assertAllow(bash(dir, 'cat > docs/superpowers/plans/x.md'));
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('S46: a quoted > in a commit message or an echo passes with no R4 record', () => {
  const dir = specProject();
  for (const command of ['git commit -m "docs: plan -> login.plan.md"', 'echo "a>docs/superpowers/plans/x.md"']) {
    assertAllow(bash(dir, command));
  }
  assert.equal(violations(dir).length, 0);
});

// R32 (S16): the queue files and the queue script calls.
const queueProject = () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  return dir;
};
const call = (dir, tool, toolInput, extra = {}) =>
  runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, cwd: dir, ...extra }, dir);
const rawHook = (dir, text) =>
  spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: text,
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
  });
const queuePath = (dir, name) => path.join(dir, '.guilda', 'queue', name);

// Each case of S16: a run of the hook, and the deny text (true for any R32 text) or null for a pass.
// The writer role (0.4.1, the 0.3.0 row of X2 after the L4-1 NO-GO): the Architect in the main session, with no agent_id.
const ARC = {};
const S16 = [
  ['1 Write of journal.jsonl, no agent_id', (d) => call(d, 'Write', { file_path: queuePath(d, 'journal.jsonl'), content: 'x' }), true],
  ['2 Edit of state.json', (d) => call(d, 'Edit', { file_path: queuePath(d, 'state.json') }), true],
  ['3 echo >> journal.jsonl', (d) => call(d, 'Bash', { command: 'echo x >> .guilda/queue/journal.jsonl' }), true],
  ['4 rm lock', (d) => call(d, 'Bash', { command: 'rm .guilda/queue/lock' }), true],
  ['5 queue sync from a subagent', (d) => call(d, 'Bash', { command: 'node scripts/queue.mjs . sync' }, { agent_id: 'a1', session_id: 's1' }), true],
  ['6 queue sync with its own --session', (d) => call(d, 'Bash', { command: 'node scripts/queue.mjs . sync --session s1' }, { session_id: 's1', ...ARC }), null],
  ['7 signal call from a subagent', (d) => call(d, 'Bash', { command: 'node scripts/signal.mjs . started T1 1' }, { agent_id: 'a1', session_id: 's1' }), null],
  ['8 cat journal.jsonl', (d) => call(d, 'Bash', { command: 'cat .guilda/queue/journal.jsonl' }), null],
  ['9 a path from a variable (the stated limit)', (d) => call(d, 'Bash', { command: 'P=.guilda/queue/journal.jsonl; echo x >> "$P"' }), null],
  ['10 --session of another session', (d) => call(d, 'Bash', { command: 'node scripts/queue.mjs . sync --session s2' }, { session_id: 's1', ...ARC }), true],
  ['11 Write of writer.json', (d) => call(d, 'Write', { file_path: queuePath(d, 'writer.json'), content: '{}' }), true],
  ['12 a hook input that is not JSON', (d) => {
    const r = rawHook(d, '{ not json');
    return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }, 'R32: cannot read the hook input'],
  ['13 queue sync with no --session', (d) => call(d, 'Bash', { command: 'node scripts/queue.mjs . sync' }, { session_id: 's1', ...ARC }), 'R32: no --session'],
];

S16.forEach(([name, run, expected]) => {
  test(`S16 case ${name}: ${expected ? 'refused with R32' : 'passes'}`, () => {
    const dir = queueProject();
    const r = run(dir);
    if (expected === null) {
      assertAllow(r);
      assert.equal(violations(dir).length, 0);
    } else if (expected === true) assert.match(assertDeny(r), /^R32: /);
    else assert.equal(assertDeny(r), expected);
  });
});

test('S16: each refusal adds one R32 record with no command text', () => {
  const dir = queueProject();
  let refused = 0;
  for (const [name, run, expected] of S16) {
    const r = run(dir);
    if (expected === null) continue;
    assertDeny(r);
    refused += 1;
    const v = violations(dir);
    assert.equal(v.length, refused, name);
    const last = v[v.length - 1];
    assert.equal(last.rule, 'R32', name);
    assert.equal(last.level, 'law', name);
    assert.equal(last.source, 'pre-tool-use', name);
    assert.equal(typeof last.action, 'string', name);
    for (const text of ['echo', '.guilda/queue', 'scripts/queue.mjs', 'sync', 's2', 'not json']) {
      assert.equal(last.action.includes(text), false, `${name}: the action holds ${text}`);
    }
  }
  assert.equal(refused, 9);
});

test('S16: no .guilda folder: nothing refused', () => {
  const dir = tempProject();
  for (const [name, run] of S16) {
    if (name.startsWith('12')) {
      const r = rawHook(dir, '{ not json');
      assert.equal(r.status, 0, name);
      assert.equal(r.stdout, '', name);
      continue;
    }
    assertAllow(run(dir));
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('S16: the R4 and R19 checks still run with the R32 check', () => {
  const dir = specProject(MINIMAL_CONFIG, { git: true });
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  assert.equal(assertDeny(bash(dir, 'touch docs/superpowers/plans/x.md')), PLANS_TEXT);
  assert.equal(assertDeny(file(dir, 'Write', path.join(dir, 'docs', 'superpowers', 'plans', 'new.md'))), PLANS_TEXT);
  stage(dir, 'a.txt', GH);
  assert.match(assertDeny(bash(dir, 'git commit -m x')), /^R19:/);
  assert.deepEqual(violations(dir).map((r) => r.rule), ['R4', 'R4', 'R19']);
});

test('R32: a queue script call by a short path or run directly is refused for a subagent', () => {
  const dir = queueProject();
  fs.mkdirSync(path.join(dir, 'scripts'));
  const sub = { agent_id: 'a1', session_id: 's1' };
  const cases = [
    ['cd scripts && node queue.mjs . sync', dir],
    ['(cd scripts; node queue.mjs . sync)', dir],
    ['node ./queue.mjs .. sync', path.join(dir, 'scripts')],
    ['./scripts/queue.mjs . sync', dir],
  ];
  for (const [command, cwd] of cases) {
    const r = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd, ...sub }, dir);
    assert.match(assertDeny(r), /^R32: /, command);
  }
  assert.equal(violations(dir).length, cases.length);
});

test('R32: an error in the check refuses the call with one record (fail closed)', () => {
  const dir = queueProject();
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT, GUILDA_TEST_HOOK_THROW: '1' },
  });
  assert.equal(assertDeny({ code: r.status, stdout: r.stdout }), 'R32: cannot check the call');
  const v = violations(dir);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'R32');
  assert.equal(v[0].action.includes('ls'), false);
});

// R34 (S4-14): the bus law. A project with T3-exe-7f2a bound to the agent ID a-7.
const BOUND = 'T3-exe-7f2a';
const BUS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'bus.mjs');
const NO_BINDING = 'R34: no address is bound to this agent yet. Report to your controller in your reply.';
const NO_READ = 'R34: cannot read the bindings';
const KEY_TEXT = 'R34: the key folder of guilda is not readable by tools';
function busProject() {
  const dir = queueProject();
  const evs = [
    { type: 'task', task: 'T3', work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
    { type: 'dispatch', task: 'T3', attempt: 1, address: BOUND, role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master' },
    { type: 'agent', task: 'T3', attempt: 1, address: BOUND, agentId: 'a-7', agentType: 'guilda:executor', parentSession: 's1', parentAgent: null },
  ];
  const t0 = Date.parse('2026-11-17T10:00:00.000Z');
  const text = evs.map((e, i) => JSON.stringify({ seq: i + 1, t: new Date(t0 + i * 1000).toISOString(), ...e })).join('\n');
  fs.writeFileSync(queuePath(dir, 'journal.jsonl'), `${text}\n`);
  return dir;
}
const sendCmd = (from) => `node "${BUS_SCRIPT}" . send --from ${from} --to architect --type notice --text "hi > there"`;
/** Run the hook with exactly this entry point value ('none': no value) and this GUILDA_ADDRESS ('none': no value). */
function hookEnv(dir, input, { entry = 'cli', address, env = {}, raw } = {}) {
  const e = { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT };
  delete e.GUILDA_ADDRESS;
  if (address !== undefined) e.GUILDA_ADDRESS = address;
  if (entry === 'none') delete e.CLAUDE_CODE_ENTRYPOINT;
  else e.CLAUDE_CODE_ENTRYPOINT = entry;
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, SCRIPT)], {
    input: raw ?? JSON.stringify(input),
    encoding: 'utf8',
    cwd: dir,
    env: e,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const sub = (dir, toolName, toolInput, extra = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: toolName,
  tool_input: toolInput,
  cwd: dir,
  session_id: 's1',
  agent_id: 'a-7',
  agent_type: 'guilda:executor',
  ...extra,
});

const R34_CASES = [
  ['1 Write to a mailbox', (d) => hookEnv(d, sub(d, 'Write', { file_path: path.join(d, '.guilda', 'bus', 'architect.jsonl'), content: 'x' })), /^R34: /],
  ['2 echo >> a mailbox', (d) => hookEnv(d, sub(d, 'Bash', { command: 'echo x >> .guilda/bus/architect.jsonl' })), /^R34: /],
  ['3 send --from main from a subagent', (d) => hookEnv(d, sub(d, 'Bash', { command: sendCmd('main') })), `R34: --from main is not your address (${BOUND})`],
  ['4 send --from its own address', (d) => hookEnv(d, sub(d, 'Bash', { command: sendCmd(BOUND) })), null],
  ['5 send from an agent ID with no binding', (d) => hookEnv(d, sub(d, 'Bash', { command: sendCmd(BOUND) }, { agent_id: 'a-9' })), NO_BINDING],
  ['6 a guilda:architect agent cannot send --from architect', (d) => hookEnv(d, sub(d, 'Bash', { command: sendCmd('architect') }, { agent_id: 'a-9', agent_type: 'guilda:architect' })), NO_BINDING],
  ['7 an input that is not JSON', (d) => hookEnv(d, null, { raw: `{"tool_name":"Bash","tool_input":{"command":${JSON.stringify(sendCmd(BOUND))}}` }), NO_READ],
  ['8 a state.json that cannot be read', (d) => {
    fs.writeFileSync(queuePath(d, 'state.json'), '{}');
    fs.chmodSync(queuePath(d, 'state.json'), 0o000);
    return hookEnv(d, sub(d, 'Bash', { command: sendCmd(BOUND) }));
  }, NO_READ],
];

test('R34', () => {
  for (const [name, run, expected] of R34_CASES) {
    if (name.startsWith('8') && isRoot) continue;
    const dir = busProject();
    const r = run(dir);
    if (expected === null) {
      assertAllow(r);
      assert.equal(violations(dir).length, 0, name);
      continue;
    }
    const reason = assertDeny(r);
    if (expected instanceof RegExp) assert.match(reason, expected, name);
    else assert.equal(reason, expected, name);
    const v = violations(dir);
    assert.equal(v.length, 1, name);
    assert.deepEqual([v[0].rule, v[0].level, v[0].source], ['R34', 'law', 'pre-tool-use'], name);
    for (const text of ['echo', 'bus.mjs', 'architect.jsonl', 'hi > there', '--from', BOUND]) {
      assert.equal(v[0].action.includes(text), false, `${name}: the action holds ${text}`);
    }
  }
});

test('R34: the caller of the main session, print mode and GUILDA_ADDRESS', () => {
  const dir = busProject();
  const main = (command, opts) => hookEnv(dir, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: dir, session_id: 's1' }, opts);
  assertAllow(main(sendCmd('main')));
  assert.equal(assertDeny(main(sendCmd('architect'))), 'R34: --from architect is not your address (main)');
  assert.equal(assertDeny(main(sendCmd('main'), { entry: 'sdk-cli' })), 'R34: this print-mode session has no address');
  assert.equal(assertDeny(main(sendCmd('main'), { entry: 'none' })), 'R34: this print-mode session has no address');
  assertAllow(main(sendCmd('T5-exe-1a2b'), { entry: 'sdk-cli', address: 'T5-exe-1a2b' }));
  assert.equal(assertDeny(main(sendCmd('main'), { entry: 'sdk-cli', address: 'T5-exe-1a2b' })), 'R34: --from main is not your address (T5-exe-1a2b)');
});

test('R34: the --from value comes from the command text, not from a variable', () => {
  const dir = busProject();
  const run = (command) => hookEnv(dir, sub(dir, 'Bash', { command }), { env: { X: BOUND } });
  assert.match(assertDeny(run(`node "${BUS_SCRIPT}" . send --from "$X" --to architect --type notice --text hi`)), /^R34: --from \$X is not your address/);
  assert.match(assertDeny(run(`X=${BOUND}; node scripts/bus.mjs . send --from $X --to main --type notice --text hi`)), /^R34: /);
  assert.match(assertDeny(run(`node scripts/bus.mjs . send --to main --type notice --text hi`)), /^R34: /);
  assert.match(assertDeny(run(`F=--from; node scripts/bus.mjs . send $F main --from ${BOUND} --to main --type notice --text hi`)), /^R34: --from \(none\) /);
  assert.match(assertDeny(run(`node scripts/bus.mjs . send --from ${BOUND} --from main --to main --type notice --text hi`)), /^R34: --from main /);
  assert.match(assertDeny(run(`sh -c "node scripts/bus.mjs . send --from main --to main --type notice --text hi"`)), /^R34: /);
  assert.match(assertDeny(run(`true && node scripts/bus.mjs . send --from main --to main --type notice --text hi`)), /^R34: /);
  assertAllow(run(`node scripts/bus.mjs . pending --address ${BOUND}`));
  assertAllow(run(`cat .guilda/bus/${BOUND}.jsonl`));
});

test('R34: a bus write from the main session is refused too, and the bus script call is not a write', () => {
  const dir = busProject();
  const main = (toolName, toolInput) => hookEnv(dir, { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd: dir, session_id: 's1' });
  assert.match(assertDeny(main('Edit', { file_path: '.guilda/bus/user.jsonl' })), /^R34: /);
  assert.match(assertDeny(main('Bash', { command: 'tee -a .guilda/bus/user.jsonl < x' })), /^R34: /);
  assert.match(assertDeny(main('Bash', { command: 'cd .guilda && touch bus/main.jsonl' })), /^R34: /);
  assertAllow(main('Bash', { command: sendCmd('main') }));
  assertAllow(main('Write', { file_path: path.join(dir, '.guilda', 'busy.txt'), content: 'x' }));
});

// S4-35: no agent reads the key.
test('key folder', () => {
  const dir = busProject();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state '));
  const keys = path.join(state, 'guilda', 'keys');
  fs.mkdirSync(keys, { recursive: true, mode: 0o700 });
  const keyFile = path.join(keys, '0123456789abcdef.key');
  fs.writeFileSync(keyFile, Buffer.alloc(32, 1), { mode: 0o600 });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda home '));
  const env = { XDG_STATE_HOME: state, HOME: home };
  const calls = [
    ['Read', { file_path: keyFile }],
    ['Grep', { pattern: '.', path: keys }],
    ['Glob', { pattern: '*.key', path: keys }],
    ['Bash', { command: `cat ${keyFile}` }],
    ['Glob', { pattern: `${keys}/*` }],
    ['Bash', { command: 'cat ~/.local/state/guilda/keys/*.key' }],
    ['Read', { file_path: path.relative(dir, keyFile) }],
  ];
  for (const [toolName, toolInput] of calls) {
    for (const extra of [{}, { agent_id: undefined, agent_type: undefined }]) {
      const r = hookEnv(dir, sub(dir, toolName, toolInput, extra), { env });
      assert.equal(assertDeny(r), KEY_TEXT, `${toolName} ${JSON.stringify(toolInput)}`);
      assert.equal(r.stdout.includes(Buffer.alloc(32, 1).toString('hex')), false);
    }
  }
  const v = violations(dir);
  assert.equal(v.length, calls.length * 2);
  assert.ok(v.every((x) => x.rule === 'R34' && !x.action.includes(keys) && !x.action.includes('cat')));
  assertAllow(hookEnv(dir, sub(dir, 'Read', { file_path: path.join(dir, 'a.txt') }), { env }));
  assertAllow(hookEnv(dir, sub(dir, 'Grep', { pattern: 'x', path: dir }), { env }));
});

// S4-40 after the L4-1 NO-GO: the writer row is the main session. An agent_id is always refused.
const AGENT_REASON = 'R32: only the writer role calls the queue script; that is the Architect in the main session, never an agent';
const queueCall = (dir, command, extra) => call(dir, 'Bash', { command }, { session_id: 's1', ...extra });
const SYNC = 'node scripts/queue.mjs . sync --session s1';

test('the main session with no agent_id and its own --session runs queue.mjs', () => {
  const dir = queueProject();
  assertAllow(queueCall(dir, SYNC, {}));
  assertAllow(queueCall(dir, SYNC, { agent_type: undefined, agent_id: undefined }));
  assert.equal(violations(dir).length, 0);
});

test('an agent with agent_type guilda:architect is refused', () => {
  const dir = queueProject();
  assert.equal(assertDeny(queueCall(dir, SYNC, { agent_type: 'guilda:architect', agent_id: 'a-9' })), AGENT_REASON);
  assert.deepEqual(violations(dir).map((x) => x.rule), ['R32']);
});

test('any other agent is refused', () => {
  const dir = queueProject();
  assert.equal(assertDeny(queueCall(dir, SYNC, { agent_type: 'guilda:executor', agent_id: 'a-7' })), AGENT_REASON);
  assert.equal(assertDeny(queueCall(dir, SYNC, { agent_id: 'a-8' })), AGENT_REASON);
  assert.deepEqual(violations(dir).map((x) => x.rule), ['R32', 'R32']);
});

test('the main session with no --session is refused (noSession)', () => {
  const dir = queueProject();
  assert.equal(assertDeny(queueCall(dir, 'node scripts/queue.mjs . sync', {})), 'R32: no --session');
});

test('the main session with the --session of another session is refused (session)', () => {
  const dir = queueProject();
  assert.match(assertDeny(queueCall(dir, 'node scripts/queue.mjs . sync --session s2', {})), /^R32: the --session value is not the session of this call/);
});

// S4-35, the robust forms (Security, round 1): other quoting, a cd, a walk of a parent, a search in a parent.
test('key folder: other quoting, a cd, a walk of a parent and a search in a parent', () => {
  const dir = busProject();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda home '));
  const state = path.join(home, '.local', 'state');
  const keys = path.join(state, 'guilda', 'keys');
  fs.mkdirSync(keys, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(keys, '0123456789abcdef.key'), Buffer.alloc(32, 2), { mode: 0o600 });
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda xdg '));
  for (const env of [{ HOME: home }, { HOME: home, XDG_STATE_HOME: other }]) {
    const refused = [
      ['Bash', { command: `cd "${state}/guilda"; cat keys/*` }],
      ['Bash', { command: 'cd ~/.local/state/guilda && cat keys/*' }],
      ['Bash', { command: "cat ~/.local/state/guil'da/keys'/x.key" }],
      ['Bash', { command: 'cat ~/.local/state/gui\\lda/ke\\ys/x.key' }],
      ['Bash', { command: "find ~/.local/state -name '*.key'" }],
      ['Bash', { command: `find "${home}"` }],
      ['Bash', { command: 'grep -r . "$HOME/.local"' }],
      ['Bash', { command: `rg -a . "${state}"` }],
      ['Bash', { command: `ls -R "${state}"` }],
      ['Bash', { command: `tar -czf x.tgz "${path.join(state, 'guilda')}"` }],
      ['Bash', { command: `cp -r "${state}" ./copy` }],
      ['Bash', { command: `cd "${state}/guilda/keys" && cat ./*` }],
      ['Grep', { pattern: '.', path: path.join(state, 'guilda') }],
      ['Grep', { pattern: '.', path: home }],
      ['Grep', { pattern: '.' }, home],
      ['Glob', { pattern: '**/*.key', path: home }],
      ['Glob', { pattern: `${state}/**` }],
    ];
    for (const [toolName, toolInput, cwd] of refused) {
      const r = hookEnv(dir, sub(dir, toolName, toolInput, cwd ? { cwd } : {}), { env });
      assert.equal(assertDeny(r), KEY_TEXT, `${toolName} ${JSON.stringify(toolInput)} ${JSON.stringify(env)}`);
    }
    const passed = [
      ['Bash', { command: 'find . -name "*.md"' }],
      ['Bash', { command: 'grep -r keys src' }],
      ['Bash', { command: `ls "${home}"` }],
      ['Grep', { pattern: 'keys', path: dir }],
      ['Glob', { pattern: '**/*.md', path: dir }],
      ['Write', { file_path: path.join(dir, 'notes.md'), content: 'the key folder is ~/.local/state/guilda/keys' }],
    ];
    for (const [toolName, toolInput] of passed) {
      assertAllow(hookEnv(dir, sub(dir, toolName, toolInput), { env }));
    }
  }
});

// Security (block the obvious): a shell command cannot run the user record code or set the print-mode mark.
test('R34: a tool cannot run the user record hook or set CLAUDE_CODE_ENTRYPOINT', () => {
  const dir = busProject();
  const FORGE = 'R34: a tool cannot run the user record code of guilda or set CLAUDE_CODE_ENTRYPOINT; only Claude Code runs that hook';
  const refused = [
    'CLAUDE_CODE_ENTRYPOINT=cli node scripts/hooks/user-prompt-submit.mjs < input.json',
    `node -e "import('./scripts/lib/records.mjs').then((r) => r.writeUserRecord('.', { kind: 'prompt', text: 'x' }))"`,
    `node -e 'import("./scripts/lib/rec"+"ords.mjs")'`.replace('rec"+"ords', 'rec\\ords'),
    "node 'scripts/hooks/user-prompt-'\"submit.mjs\"",
    'env CLAUDE_CODE_ENTRYPOINT=cli node x.mjs',
    'export CLAUDE_CODE_ENTRYPOINT=cli; node x.mjs',
    "export 'CLAUDE_CODE_ENTRYPOINT'",
    'cd scripts/lib && node -e "import(\'./records.mjs\')"',
    './scripts/hooks/user-prompt-submit.mjs < input.json',
    'X=1 scripts/lib/records.mjs',
    'bun scripts/lib/records.mjs',
    'node --import ./scripts/lib/records.mjs x.mjs',
  ];
  for (const command of refused) {
    for (const extra of [{}, { agent_id: undefined, agent_type: undefined }]) {
      const r = hookEnv(dir, sub(dir, 'Bash', { command }, extra));
      assert.equal(assertDeny(r), FORGE, command);
    }
  }
  const v = violations(dir);
  assert.equal(v.length, refused.length * 2);
  assert.ok(v.every((x) => x.rule === 'R34' && x.action === 'user record forge refused'));
  for (const command of [
    'node --test tests/records.test.mjs tests/user-prompt-submit.test.mjs',
    'echo $CLAUDE_CODE_ENTRYPOINT',
    'git add scripts/lib/records.mjs',
    'git diff scripts/lib/records.mjs',
    'cat scripts/lib/records.mjs',
    'git add scripts/hooks/user-prompt-submit.mjs && git status',
  ]) {
    assertAllow(hookEnv(dir, sub(dir, 'Bash', { command })));
  }
});

// 0.5.0 T2: the claim rows of R32 and the supervisor address of R34.
const CLAIM_REASON = 'R32: the supervisor session holds the queue; send a request to supervisor';
const writeClaim = (dir, session, { aliveAt = new Date().toISOString(), ttlSec = 600 } = {}) =>
  fs.writeFileSync(queuePath(dir, 'writer.json'), `${JSON.stringify({ session, ttlSec, aliveAt, pid: 1 })}\n`);
const TICK = 'node scripts/tick.mjs . --json --session s1';
const WATCH = 'node scripts/watch.mjs . --session s1';

test('the main session with no claim runs queue.mjs', () => {
  const dir = queueProject();
  assertAllow(queueCall(dir, SYNC, {}));
  assert.equal(violations(dir).length, 0);
  // A claim past its ttl is no claim.
  writeClaim(dir, 's9', { aliveAt: '2020-01-01T00:00:00.000Z' });
  assertAllow(queueCall(dir, SYNC, {}));
});

test('an Architect-type agent is refused', () => {
  const dir = queueProject();
  writeClaim(dir, 's1');
  assert.equal(assertDeny(queueCall(dir, SYNC, { agent_type: 'guilda:architect', agent_id: 'a-9' })), AGENT_REASON);
});

test('the main session is refused while another session holds the claim', () => {
  const dir = queueProject();
  writeClaim(dir, 's9');
  assert.equal(assertDeny(queueCall(dir, SYNC, {})), CLAIM_REASON);
  assert.equal(assertDeny(queueCall(dir, TICK, {})), CLAIM_REASON);
  const v = violations(dir);
  assert.deepEqual(v.map((x) => x.rule), ['R32', 'R32']);
  assert.ok(v.every((x) => !x.action.includes('sync') && !x.action.includes('tick')));
});

test('claim passes while another session holds the claim', () => {
  const dir = queueProject();
  writeClaim(dir, 's9');
  assertAllow(queueCall(dir, 'node scripts/queue.mjs . claim --session s1', {}));
  assertAllow(queueCall(dir, 'node scripts/queue.mjs . claim --ttl 300 --session s1', {}));
  // A claim joined to another queue command is not exempt.
  assert.equal(assertDeny(queueCall(dir, 'node scripts/queue.mjs . claim --session s1 && node scripts/queue.mjs . sync --session s1', {})), CLAIM_REASON);
  // An agent is still refused for claim.
  assert.equal(assertDeny(queueCall(dir, 'node scripts/queue.mjs . claim --session s1', { agent_id: 'a-7' })), AGENT_REASON);
});

test('the claim session runs queue.mjs, tick.mjs and watch.mjs', () => {
  const dir = queueProject();
  writeClaim(dir, 's1');
  assertAllow(queueCall(dir, SYNC, {}));
  assertAllow(queueCall(dir, TICK, {}));
  assertAllow(queueCall(dir, WATCH, {}));
  assert.equal(violations(dir).length, 0);
  assert.equal(assertDeny(queueCall(dir, 'node scripts/tick.mjs . --json', {})), 'R32: no --session');
});

test('a bad writer.json refuses the queue call', () => {
  const dir = queueProject();
  fs.writeFileSync(queuePath(dir, 'writer.json'), '{ not json');
  assert.equal(assertDeny(queueCall(dir, SYNC, {})), 'R32: cannot check the call');
  assert.equal(violations(dir).at(-1).rule, 'R32');
});

test('the claim session sends --from supervisor', () => {
  const dir = busProject();
  writeClaim(dir, 's1');
  assertAllow(hookEnv(dir, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: sendCmd('supervisor') }, cwd: dir, session_id: 's1' }));
});

test('the claim session cannot send --from main', () => {
  const dir = busProject();
  writeClaim(dir, 's1');
  const r = hookEnv(dir, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: sendCmd('main') }, cwd: dir, session_id: 's1' });
  assert.equal(assertDeny(r), 'R34: --from main is not your address (supervisor)');
  // Another session has no such address.
  const other = hookEnv(dir, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: sendCmd('supervisor') }, cwd: dir, session_id: 's2' });
  assert.equal(assertDeny(other), 'R34: --from supervisor is not your address (main)');
});

// T2 review: the claim exemption bypasses.
test('--now in a queue script call is refused for each script', () => {
  const dir = queueProject();
  const NOW = 'R32: --now is for tests only';
  for (const c of [
    'node scripts/queue.mjs . claim --now 2099-01-01T00:00:00.000Z --session s1',
    'node scripts/queue.mjs . sync --session s1 --now 2099-01-01T00:00:00.000Z',
    'node scripts/tick.mjs . --now 2099-01-01T00:00:00.000Z --session s1',
    'node scripts/watch.mjs . --now 2099-01-01T00:00:00.000Z --session s1',
  ]) {
    assert.equal(assertDeny(queueCall(dir, c, {})), NOW, c);
  }
  writeClaim(dir, 's9');
  assert.equal(assertDeny(queueCall(dir, 'node scripts/queue.mjs . claim --now 2099-01-01T00:00:00.000Z --session s2', { session_id: 's2' })), NOW);
});

test('a bad writer.json refuses a claim call too', () => {
  const dir = queueProject();
  fs.writeFileSync(queuePath(dir, 'writer.json'), '{ not json');
  assert.equal(assertDeny(queueCall(dir, 'node scripts/queue.mjs . claim --session s1', {})), 'R32: cannot check the call');
});

test('a claim call hidden next to a sync in a substitution is refused during another live claim', () => {
  const dir = queueProject();
  writeClaim(dir, 's9');
  const command = `node scripts/que''ue.mjs . claim --session s1; echo "$(node scripts/queue.mjs . sync --session s1)"`;
  assert.equal(assertDeny(queueCall(dir, command, {})), CLAIM_REASON);
});

// T2 review 2: the claim exemption is for literal words only.
test('a claim call with a variable word is refused during another live claim', () => {
  const dir = queueProject();
  writeClaim(dir, 's9');
  for (const command of [
    `X='--now 2099-01-01T00:00:00Z'; node scripts/queue.mjs . claim $X --session s1`,
    'node scripts/queue.mjs . claim "$(echo --ttl) 300" --session s1',
    'node scripts/queue.mjs . cl* --session s1',
    'echo . | xargs node scripts/queue.mjs claim --session s1',
    'env node scripts/queue.mjs . claim --session s1',
    'echo sync | /usr/bin/xargs -I claim node scripts/queue.mjs . claim --session s1',
    'echo sync | parallel node scripts/queue.mjs . {} --session s1',
    'echo x | node scripts/queue.mjs . claim --session s1',
    'command node scripts/queue.mjs . claim --session s1',
    'FOO=1 node scripts/queue.mjs . claim --session s1',
    'node scripts/queue.mjs . claim --session s1 & node scripts/queue.mjs . claim --session s1',
  ]) {
    assert.equal(assertDeny(queueCall(dir, command, {})), CLAIM_REASON, command);
  }
  // A literal claim call still passes.
  assertAllow(queueCall(dir, 'node scripts/queue.mjs . claim --session s1', {}));
  assertAllow(queueCall(dir, `node ${REPO_ROOT}/scripts/queue.mjs ${os.tmpdir()}/proj claim --ttl 600 --session s1`, {}));
});

// R38 (S5-14): a session and an agent read usage only; no cswap switch and no cswap list.
const R38_REASON = 'R38: read usage only (cswap budget or the cswap MCP tools); never switch or list accounts';

test('S5-14: cswap switch and cswap list are refused with R38; cswap budget passes', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const refused = [
    'cswap switch 2',
    'cswap list --json',
    '/usr/local/bin/cswap list',
    'bash -c "cswap switch 1"',
    'x && cswap list',
    'echo hi; cswap switch 3',
    'cat f | cswap list',
    'FOO=1 cswap switch 2',
  ];
  for (const command of refused) assert.equal(assertDeny(bash(dir, command)), R38_REASON, command);
  const recs = violations(dir).filter((v) => v.rule === 'R38');
  assert.equal(recs.length, refused.length);
  for (const rec of recs) {
    assert.equal(rec.level, 'law');
    assert.ok(!JSON.stringify(rec).includes('cswap'), 'no command text');
  }
  for (const command of ['cswap budget --json', 'cswap budget', 'echo cswap switch']) assertAllow(bash(dir, command));
  // An agent is refused the same way.
  const agent = runHook(SCRIPT, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cswap list' }, cwd: dir, agent_id: 'a-1', agent_type: 'guilda:executor' }, dir);
  assert.equal(assertDeny(agent), R38_REASON);
});
