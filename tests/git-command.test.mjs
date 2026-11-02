import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { findGitCommits, parseAddedLines } from '../scripts/lib/git-command.mjs';

const CWD = path.resolve('/work');
const commits = (command) => findGitCommits(command, CWD).commits;

test('a plain commit is found in the start directory', () => {
  const r = findGitCommits('git commit -m x', CWD);
  assert.equal(r.commits.length, 1);
  assert.equal(r.commits[0].cwd, CWD);
  assert.equal(r.addBeforeCommit, false);
});

test('commands that only mention a commit are not commits', () => {
  for (const cmd of ['echo "git commit"', "echo 'git commit -m x'", 'git status', 'git log --grep commit', '# git commit']) {
    assert.deepEqual(commits(cmd), [], cmd);
  }
});

test('a commit message with shell words does not start a command', () => {
  const r = findGitCommits('git commit -m "first line\n\ngit add is fine; git commit too && more"', CWD);
  assert.equal(r.commits.length, 1);
  assert.equal(r.addBeforeCommit, false);
});

test('a heredoc message inside double quotes is one word', () => {
  const r = findGitCommits(`git commit -m "$(cat <<'EOF'\ngit add x\nEOF\n)"`, CWD);
  assert.equal(r.commits.length, 1);
  assert.equal(r.addBeforeCommit, false);
});

test('global options before commit are read, with separate values', () => {
  for (const cmd of [
    'git -C . commit',
    'git -c a=b commit',
    'git --no-pager commit',
    'git --work-tree . commit',
    'git --git-dir .git commit',
    'git --namespace x commit',
    'git --git-dir=.git commit',
    '"git" commit',
    '/usr/bin/git commit',
  ]) {
    assert.equal(commits(cmd).length, 1, cmd);
  }
});

test('--git-dir and --work-tree are forwarded to the scan', () => {
  assert.deepEqual(commits('git --git-dir x --work-tree=y commit')[0].gitArgs, ['--git-dir=x', '--work-tree=y']);
});

test('-C and cd move the directory, in order', () => {
  assert.equal(commits('git -C sub commit')[0].cwd, path.join(CWD, 'sub'));
  assert.equal(commits('git -C "a b" -C c commit')[0].cwd, path.join(CWD, 'a b', 'c'));
  assert.equal(commits('cd wt && git commit')[0].cwd, path.join(CWD, 'wt'));
  assert.equal(commits('cd a; cd b && git -C c commit')[0].cwd, path.join(CWD, 'a', 'b', 'c'));
  assert.equal(commits('(cd wt && git commit)')[0].cwd, path.join(CWD, 'wt'));
});

test('every commit in a chain is found', () => {
  const found = commits('git commit --allow-empty -m a && git -C sub commit -m b');
  assert.deepEqual(found.map((c) => c.cwd), [CWD, path.join(CWD, 'sub')]);
});

test('wrappers and nested shells do not hide a commit', () => {
  for (const cmd of [
    'FOO=1 git commit',
    'command git commit',
    'env -i git commit',
    'sudo git commit',
    'time git commit',
    'bash -c "git commit -m x"',
    "sh -lc 'git commit'",
    'eval "git commit"',
    'if true; then git commit; fi',
    '{ git commit; }',
  ]) {
    assert.equal(commits(cmd).length, 1, cmd);
  }
});

test('GIT_ variables before git are forwarded to the scan', () => {
  assert.deepEqual(commits('GIT_DIR=x FOO=1 git commit')[0].env, { GIT_DIR: 'x' });
});

test('git add or git stage before a commit is reported', () => {
  for (const cmd of [
    'git add a && git commit',
    'git add -A; git commit',
    'git stage a && git commit',
    'git -C sub add a && git -C sub commit',
    'git add a\ngit commit',
  ]) {
    assert.equal(findGitCommits(cmd, CWD).addBeforeCommit, true, cmd);
  }
});

test('git add alone or after the commit is not reported', () => {
  assert.equal(findGitCommits('git add a', CWD).addBeforeCommit, false);
  assert.equal(findGitCommits('git commit && git add a', CWD).addBeforeCommit, false);
});

test('a file descriptor redirect does not split the command', () => {
  assert.equal(commits('git commit -m x 2>&1').length, 1);
});

test('a long option list takes no visible time', () => {
  const start = Date.now();
  assert.equal(commits(`git ${'--a '.repeat(5000)}status`).length, 0);
  assert.ok(Date.now() - start < 1000);
});

const diff = (...body) => ['diff --git a/f.txt b/f.txt', '--- a/f.txt', '+++ b/f.txt', ...body].join('\n');

test('parseAddedLines reads files, lines and numbers', () => {
  assert.deepEqual(parseAddedLines(diff('@@ -0,0 +3,2 @@', '+one', '+two')), [
    { file: 'f.txt', lines: [{ line: 3, text: 'one' }, { line: 4, text: 'two' }] },
  ]);
});

test('an added line that looks like a file header stays content', () => {
  const [f, extra] = parseAddedLines(diff('@@ -0,0 +1,3 @@', '+++ /dev/null', '+secret', '+++ b/tests/x'));
  assert.equal(extra, undefined);
  assert.equal(f.file, 'f.txt');
  assert.deepEqual(f.lines.map((l) => l.text), ['++ /dev/null', 'secret', '++ b/tests/x']);
});

test('removed and context lines count in the hunk and are not added', () => {
  const [f] = parseAddedLines(diff('@@ -1,2 +1,2 @@', ' same', '-old', '+new', '\\ No newline at end of file'));
  assert.deepEqual(f.lines, [{ line: 2, text: 'new' }]);
});

test('a hunk header with no counts means one line', () => {
  const [f] = parseAddedLines(diff('@@ -1 +1 @@', '-a', '+b'));
  assert.deepEqual(f.lines, [{ line: 1, text: 'b' }]);
});

test('a quoted file name is read', () => {
  const text = ['diff --git "a/x\\ty" "b/x\\ty"', '+++ "b/x\\ty"', '@@ -0,0 +1 @@', '+a'].join('\n');
  assert.equal(parseAddedLines(text)[0].file, 'x\\ty');
});

test('a deleted file gives no entry', () => {
  assert.deepEqual(parseAddedLines(['--- a/f', '+++ /dev/null', '@@ -1 +0,0 @@', '-a'].join('\n')), []);
});
