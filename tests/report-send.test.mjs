import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'report-send.mjs');
const DEFAULT_REPO = 'JohnGabie/guilda';
const TOKEN = 'ghp_' + 'A'.repeat(36);
const ISSUE_URL = 'https://github.com/example/repo/issues/7';

/** A folder with a link to node only, so the real gh is never on the PATH. */
function nodeOnlyDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda node '));
  fs.symlinkSync(process.execPath, path.join(dir, 'node'));
  return dir;
}

/** A stub gh that records its arguments and standard input. Behaviour comes from the environment. */
function stubDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda stub '));
  const script = `#!/bin/sh
out="$STUB_OUT"
if [ "$1" = "auth" ]; then
  if [ -n "$STUB_AUTH_FAIL" ]; then exit 1; fi
  exit 0
fi
: > "$out/calls"
for a in "$@"; do printf '%s\\n' "$a" >> "$out/calls"; done
: > "$out/stdin"
while IFS= read -r line || [ -n "$line" ]; do printf '%s\\n' "$line" >> "$out/stdin"; done
if [ -n "$STUB_CREATE_FAIL" ]; then exit 1; fi
echo "${ISSUE_URL}"
`;
  const file = path.join(dir, 'gh');
  fs.writeFileSync(file, script, { mode: 0o755 });
  return dir;
}

function setup({ config = MINIMAL_CONFIG, noLayer = false, report = '# Slow start\n\nIt is slow.\n', withStub = true, env = {} } = {}) {
  // noLayer: a second temporary project that never had a .guilda folder (no test deletes a file).
  const project = noLayer ? tempProject() : tempProject({ config });
  const reportFile = path.join(project, 'draft.md');
  fs.writeFileSync(reportFile, report);
  const nodeDir = nodeOnlyDir();
  const stub = withStub ? stubDir() : null;
  const PATH = [stub, nodeDir].filter(Boolean).join(path.delimiter);
  return { project, reportFile, stub, PATH, env };
}

function run(ctx, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ctx.project, ctx.reportFile, ...args], {
    encoding: 'utf8',
    env: { PATH: ctx.PATH, STUB_OUT: ctx.stub ?? '', ...ctx.env },
  });
  return { code: r.status, lines: r.stdout.split('\n').filter(Boolean), stdout: r.stdout, stderr: r.stderr };
}

const calls = (ctx) => {
  try {
    return fs.readFileSync(path.join(ctx.stub, 'calls'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }
};
const stdinOf = (ctx) => fs.readFileSync(path.join(ctx.stub, 'stdin'), 'utf8');
const arg = (list, flag) => list[list.indexOf(flag) + 1];

test('S4: a report with a planted token is refused, names the hit and exits 1; the stub was not called', () => {
  const ctx = setup({ report: `# Slow start\n\nfine\nthe token is ${TOKEN}\n` });
  const r = run(ctx, ['--type', 'bug']);
  assert.equal(r.code, 1);
  assert.equal(r.lines[0], 'refused: R19 secret in line 4');
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
  assert.equal(calls(ctx), null);
  assert.ok(!fs.existsSync(path.join(ctx.project, '.guilda', 'reports')));
});

test('S6: a token in the title gives refused: R19 secret in line 1', () => {
  const ctx = setup({ report: `# Leak ${TOKEN}\n\nbody\n` });
  const r = run(ctx, ['--type', 'bug']);
  assert.equal(r.code, 1);
  assert.equal(r.lines[0], 'refused: R19 secret in line 1');
});

test('S5: no gh on the PATH: saved, the path printed, nothing sent, .guilda/.gitignore has reports/', () => {
  const ctx = setup({ withStub: false });
  const r = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  assert.equal(r.code, 0);
  const saved = path.join(ctx.project, '.guilda', 'reports', '2026-11-10-bug-slow-start.md');
  assert.equal(r.lines[0], `saved: ${saved}`);
  assert.equal(fs.readFileSync(saved, 'utf8'), '# Slow start\n\nIt is slow.\n');
  const ignore = fs.readFileSync(path.join(ctx.project, '.guilda', '.gitignore'), 'utf8').split('\n');
  assert.ok(ignore.includes('reports/'));
});

test('S5: gh auth status fails: saved', () => {
  const ctx = setup({ env: { STUB_AUTH_FAIL: '1' } });
  const r = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /^saved: /);
  assert.equal(calls(ctx), null);
});

test('S5: gh issue create fails: saved', () => {
  const ctx = setup({ env: { STUB_CREATE_FAIL: '1' } });
  const r = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /^saved: /);
});

test('S5: no .guilda folder: refused: guilda is not set up, exit 1, no folder', () => {
  const ctx = setup({ noLayer: true });
  const r = run(ctx, ['--type', 'bug']);
  assert.equal(r.code, 1);
  assert.equal(r.lines[0], 'refused: guilda is not set up');
  assert.ok(r.lines[1].startsWith('guilda is installed but not set up'));
  assert.ok(!fs.existsSync(path.join(ctx.project, '.guilda')));
  assert.equal(calls(ctx), null);
});

for (const type of ['improvement', 'bug', 'feature', 'other']) {
  test(`S6: type ${type} gives its label with the default repository`, () => {
    const ctx = setup();
    const r = run(ctx, ['--type', type]);
    assert.equal(r.code, 0);
    assert.deepEqual(r.lines, [`sent: ${ISSUE_URL}`]);
    const c = calls(ctx);
    assert.equal(arg(c, '--label'), `report-${type}`);
    assert.equal(arg(c, '--repo'), DEFAULT_REPO);
  });
}

test('S6: report.repo https://github.com/acme/tools.git gives --repo acme/tools, no --label, and the note line', () => {
  const ctx = setup({ config: { ...MINIMAL_CONFIG, report: { repo: 'https://github.com/acme/tools.git' } } });
  const r = run(ctx, ['--type', 'bug']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [
    `sent: ${ISSUE_URL}`,
    'note: sent without a label, because acme/tools is not the default repository',
  ]);
  const c = calls(ctx);
  assert.equal(arg(c, '--repo'), 'acme/tools');
  assert.ok(!c.includes('--label'));
});

test('--repo wins over report.repo', () => {
  const ctx = setup({ config: { ...MINIMAL_CONFIG, report: { repo: 'acme/tools' } } });
  run(ctx, ['--type', 'bug', '--repo', 'other/place']);
  assert.equal(arg(calls(ctx), '--repo'), 'other/place');
});

test('S6: the title is Slow start and the body does not have the title line', () => {
  const ctx = setup();
  run(ctx, ['--type', 'bug']);
  const c = calls(ctx);
  assert.equal(arg(c, '--title'), 'Slow start');
  assert.equal(arg(c, '--body-file'), '-');
  assert.equal(stdinOf(ctx), 'It is slow.\n');
});

test('S6: saved as 2026-11-10-bug-slow-start.md with --date 2026-11-10; the second save is -2.md', () => {
  const ctx = setup({ withStub: false, report: '# Slow start!\n\nbody\n' });
  const a = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  const b = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  const dir = path.join(ctx.project, '.guilda', 'reports');
  assert.equal(a.lines[0], `saved: ${path.join(dir, '2026-11-10-bug-slow-start.md')}`);
  assert.equal(b.lines[0], `saved: ${path.join(dir, '2026-11-10-bug-slow-start-2.md')}`);
  const c = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  assert.equal(c.lines[0], `saved: ${path.join(dir, '2026-11-10-bug-slow-start-3.md')}`);
});

test('a title of ¿¡ gives the slug report', () => {
  const ctx = setup({ withStub: false, report: '# ¿¡\n\nbody\n' });
  const r = run(ctx, ['--type', 'other', '--date', '2026-11-10']);
  assert.ok(r.lines[0].endsWith('2026-11-10-other-report.md'), r.lines[0]);
});

test('a title of 60 letters gives a slug of 40', () => {
  const ctx = setup({ withStub: false, report: `# ${'a'.repeat(60)}\n\nbody\n` });
  const r = run(ctx, ['--type', 'other', '--date', '2026-11-10']);
  assert.ok(r.lines[0].endsWith(`2026-11-10-other-${'a'.repeat(40)}.md`), r.lines[0]);
});

test('a slug cut at 40 has no - at its end', () => {
  const ctx = setup({ withStub: false, report: `# ${'a'.repeat(39)} bbb\n\nbody\n` });
  const r = run(ctx, ['--type', 'other', '--date', '2026-11-10']);
  assert.ok(r.lines[0].endsWith(`2026-11-10-other-${'a'.repeat(39)}.md`), r.lines[0]);
});

test('the date defaults to the UTC date', () => {
  const ctx = setup({ withStub: false });
  const r = run(ctx, ['--type', 'bug']);
  assert.ok(r.lines[0].includes(`${new Date().toISOString().slice(0, 10)}-bug-slow-start`));
});

test('an invalid report.repo: saved, nothing sent', () => {
  const ctx = setup({ config: { ...MINIMAL_CONFIG, report: { repo: 'not a repo' } } });
  const r = run(ctx, ['--type', 'bug', '--date', '2026-11-10']);
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /^saved: /);
  assert.equal(calls(ctx), null);
});

test('a wrong --type, no --type, a file with no title line, an invalid --repo: exit 1', () => {
  const ctx = setup();
  assert.equal(run(ctx, ['--type', 'nope']).code, 1);
  assert.equal(run(ctx, []).code, 1);
  assert.equal(run(ctx, ['--type', 'bug', '--repo', 'bad repo']).code, 1);
  fs.writeFileSync(ctx.reportFile, 'no title here\n');
  const r = run(ctx, ['--type', 'bug']);
  assert.equal(r.code, 1);
  assert.equal(r.lines.length, 1);
  assert.equal(calls(ctx), null);
});

test('the four issue templates have the label and one credit comment', () => {
  for (const type of ['improvement', 'bug', 'feature', 'other']) {
    const text = fs.readFileSync(path.join(REPO_ROOT, '.github', 'ISSUE_TEMPLATE', `report-${type}.md`), 'utf8');
    assert.match(text, /^---\nname: /);
    assert.match(text, new RegExp(`\\nlabels: report-${type}\\n`));
    assert.match(text, /\nabout: /);
    assert.equal((text.match(/<!--/g) || []).length, 1);
    assert.match(text, /superpowers 7\.0\.0/);
    assert.match(text, /MIT/);
  }
});
