import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject } from './helpers.mjs';
import { findCreatedFiles } from '../scripts/lib/shell-writes.mjs';

const START = tempProject();
const PLAN = 'docs/superpowers/plans/x.md';
const paths = (command, cwd = START) => findCreatedFiles(command, cwd).map((e) => e.path);

test('a redirection with > returns its target', () => {
  assert.deepEqual(findCreatedFiles(`cat > ${PLAN}`, START), [{ path: PLAN, cwd: START }]);
});

test('a redirection with >> returns its target', () => {
  assert.deepEqual(paths(`echo text >> ${PLAN}`), [PLAN]);
});

test('a redirection with &> and &>> returns its target', () => {
  assert.deepEqual(paths(`make &> ${PLAN}`), [PLAN]);
  assert.deepEqual(paths(`make &>>${PLAN}`), [PLAN]);
});

test('a redirection with a file descriptor number returns its target', () => {
  assert.deepEqual(paths(`make 2> ${PLAN}`), [PLAN]);
  assert.deepEqual(paths(`make 2>>${PLAN}`), [PLAN]);
});

test('a redirection to a file descriptor returns no file', () => {
  assert.deepEqual(paths('make 2>&1 >&2'), []);
});

test('a redirection with no space', () => {
  assert.deepEqual(paths(`echo x >${PLAN}`), [PLAN]);
  assert.deepEqual(paths(`echo x>${PLAN}`), [PLAN]);
});

test('tee returns each argument that is not an option', () => {
  assert.deepEqual(paths(`echo text | tee -a ${PLAN} other.md`), [PLAN, 'other.md']);
});

test('touch returns each argument', () => {
  assert.deepEqual(paths(`touch a.md ${PLAN}`), ['a.md', PLAN]);
});

test('cp returns its last argument', () => {
  assert.deepEqual(paths(`cp -f notes.md ${PLAN}`), [PLAN]);
});

test('mv returns its last argument', () => {
  assert.deepEqual(paths(`mv notes.md ${PLAN}`), [PLAN]);
});

test('cp to an existing folder returns the folder plus the base name of each source', () => {
  const dir = tempProject();
  fs.mkdirSync(path.join(dir, 'docs', 'superpowers', 'plans'), { recursive: true });
  assert.deepEqual(paths('cp src/a.md b.md docs/superpowers/plans', dir), [
    path.join('docs/superpowers/plans', 'a.md'),
    path.join('docs/superpowers/plans', 'b.md'),
  ]);
});

test('cd with a literal target moves the directory', () => {
  const found = findCreatedFiles('cd docs/superpowers && touch plans/x.md', START);
  assert.deepEqual(found, [{ path: 'plans/x.md', cwd: path.resolve(START, 'docs/superpowers') }]);
  const pushed = findCreatedFiles('pushd docs; touch y.md', START);
  assert.deepEqual(pushed, [{ path: 'y.md', cwd: path.resolve(START, 'docs') }]);
});

test('cd "$DOCS" does not move it', () => {
  assert.deepEqual(findCreatedFiles('cd "$DOCS" && touch plans/x.md', START), [{ path: 'plans/x.md', cwd: START }]);
  assert.deepEqual(findCreatedFiles('cd "$(dirname x)" && touch plans/x.md', START), [{ path: 'plans/x.md', cwd: START }]);
});

test('a path from a variable is not returned', () => {
  assert.deepEqual(paths(`P=${PLAN}; cat > "$P"`), []);
  assert.deepEqual(paths('touch "$(echo x)" `echo y` ${Z}'), []);
});

test('a quoted path with a space', () => {
  assert.deepEqual(paths('touch "docs/superpowers/plans/my plan.md"'), ['docs/superpowers/plans/my plan.md']);
  assert.deepEqual(paths("echo x > 'docs/superpowers/plans/my plan.md'"), ['docs/superpowers/plans/my plan.md']);
});

test('cat file returns []', () => {
  assert.deepEqual(paths(`cat ${PLAN}`), []);
  assert.deepEqual(paths(`cat < ${PLAN}`), []);
});

test('a broken quote returns [] and does not throw', () => {
  assert.deepEqual(paths(`touch "${PLAN}`), []);
  assert.deepEqual(paths(`echo 'x > ${PLAN}`), []);
});

test('a text that is not a string returns []', () => {
  assert.deepEqual(findCreatedFiles(undefined, START), []);
  assert.deepEqual(findCreatedFiles(null, START), []);
});

test('a quoted > is not a redirection', () => {
  assert.deepEqual(paths('git commit -m "docs: plan -> login.plan.md"'), []);
  assert.deepEqual(paths(`echo "a>${PLAN}"`), []);
  assert.deepEqual(paths(`echo "see > ${PLAN}"`), []);
  assert.deepEqual(paths(`echo 'see > ${PLAN}'`), []);
  assert.deepEqual(paths(`echo "a>b" > ${PLAN}`), [PLAN]);
});
