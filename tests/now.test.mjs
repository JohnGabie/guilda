import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'now.mjs');
const USAGE = 'usage: node scripts/now.mjs [--date]';
const run = (args = [], env = {}) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

test('the form', () => {
  const r = run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n$/);
});

test('the time is within 5 seconds of the test clock', () => {
  // TZ is set to a zone 14 hours ahead of UTC, so a local-time output would fail here.
  const before = Date.now();
  const r = run([], { TZ: 'Pacific/Kiritimati' });
  const after = Date.now();
  assert.equal(r.code, 0, r.stderr);
  const printed = Date.parse(r.stdout.trim());
  assert.ok(Number.isFinite(printed), `not a time: ${r.stdout}`);
  assert.ok(printed >= before - 5000 && printed <= after + 5000, `printed ${r.stdout.trim()}`);
});

test('--date', () => {
  const before = new Date().toISOString().slice(0, 10);
  const r = run(['--date']);
  const after = new Date().toISOString().slice(0, 10);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^\d{4}-\d{2}-\d{2}\n$/);
  assert.ok(r.stdout.trim() === before || r.stdout.trim() === after, `printed ${r.stdout.trim()}`);
});

test('a bad argument exits 1', () => {
  const r = run(['--bogus']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes(USAGE), r.stderr);
});
