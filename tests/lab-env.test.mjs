import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lab-env.mjs');

// Each run gets its own empty TMPDIR and cwd, so a test can see each file that the script makes. Never removed.
function runPreset(args = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda lab-env tmp '));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda lab-env cwd '));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tmp },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', tmp, cwd };
}

/** The tasks (threads) of the current user, which RLIMIT_NPROC counts. */
function userTasks() {
  const uid = process.getuid();
  let n = 0;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      if (fs.statSync(path.join('/proc', pid)).uid !== uid) continue;
      n += fs.readdirSync(path.join('/proc', pid, 'task')).length;
    } catch {
      // The process ended.
    }
  }
  return n;
}

test('prints a PATH line with a gettext stub that works', () => {
  const r = runPreset();
  assert.equal(r.code, 0, r.stderr);
  const pathLine = r.stdout.split('\n').find((l) => l.startsWith('export PATH='));
  assert.ok(pathLine, r.stdout);
  const m = /^export PATH="(.+):\$PATH"$/.exec(pathLine);
  assert.ok(m, pathLine);
  const dir = m[1];
  assert.ok(path.dirname(dir) === r.tmp, `${dir} is not in TMPDIR ${r.tmp}`);
  // The stub prints its last argument, as gettext prints the message ID with no translation.
  const sh = spawnSync('sh', ['-c', `${pathLine}\ngettext -d somedomain "Hello lab"`], { encoding: 'utf8' });
  assert.equal(sh.status, 0, sh.stderr);
  assert.equal(sh.stdout, 'Hello lab');
  const which = spawnSync('sh', ['-c', `${pathLine}\ncommand -v gettext`], { encoding: 'utf8' });
  assert.equal(which.stdout.trim(), path.join(dir, 'gettext'));
});

test('prints ulimit -u above the current process count', () => {
  const before = userTasks();
  const r = runPreset();
  assert.equal(r.code, 0, r.stderr);
  const line = r.stdout.split('\n').find((l) => l.startsWith('ulimit -u '));
  assert.ok(line, r.stdout);
  const n = Number(/^ulimit -u (\d+)$/.exec(line)[1]);
  assert.ok(n > before, `${n} <= ${before}`);
  assert.ok(n >= 256 + 1, String(n));
  const json = runPreset(['--json']);
  assert.equal(json.code, 0, json.stderr);
  const obj = JSON.parse(json.stdout);
  assert.equal(typeof obj.ulimitU, 'number');
  assert.equal(obj.ulimitU, obj.processes + 256);
  assert.ok(obj.processes > 0);
  assert.equal(obj.gettext, path.join(obj.dir, 'gettext'));
  assert.ok(obj.lines.includes(`export PATH="${obj.dir}:$PATH"`), JSON.stringify(obj.lines));
  assert.ok(obj.lines.includes(`ulimit -u ${obj.ulimitU}`), JSON.stringify(obj.lines));
});

test('creates files only in its own mktemp folder', () => {
  for (const args of [[], ['--json']]) {
    const r = runPreset(args);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(r.cwd), [], 'the cwd stays empty');
    const made = fs.readdirSync(r.tmp);
    assert.equal(made.length, 1, JSON.stringify(made));
    const dir = path.join(r.tmp, made[0]);
    assert.ok(fs.statSync(dir).isDirectory());
    assert.deepEqual(fs.readdirSync(dir), ['gettext']);
    assert.ok(r.stdout.includes(dir), 'the output names the folder');
  }
});
