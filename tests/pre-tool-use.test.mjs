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
