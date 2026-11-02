import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'journal-skeleton.mjs');

function skeleton(dir, reason = 'manual') {
  const r = spawnSync(process.execPath, [SCRIPT, reason], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  return { code: r.status, file: r.stdout.trim(), stderr: r.stderr };
}

test('skeleton has the 11 sections with markers', () => {
  const dir = tempProject({ git: true });
  const r = skeleton(dir);
  assert.equal(r.code, 0);
  const text = fs.readFileSync(r.file, 'utf8');
  const sections = text.split('\n').filter((l) => /^### \d+\. /.test(l));
  assert.equal(sections.length, 11);
  for (const l of sections) assert.match(l, /<!-- TODO-CONTEXT -->/);
  assert.match(text, /Branch:/);
  assert.match(text, /Last 5 commits/);
});

test('skeleton name matches the pattern and lives in .journal of the project', () => {
  const dir = tempProject({ git: true });
  const r = skeleton(dir, 'before-refactor');
  assert.equal(path.dirname(path.resolve(r.file)), path.join(dir, '.journal'));
  assert.match(path.basename(r.file), /^\d{4}-\d{2}-\d{2}-\d{6}-before-refactor\.md$/);
});

test('skeleton works outside a git repository and never edits .gitignore', () => {
  const dir = tempProject();
  const r = skeleton(dir);
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(r.file));
  assert.equal(fs.existsSync(path.join(dir, '.gitignore')), false);
});
