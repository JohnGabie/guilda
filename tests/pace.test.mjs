import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readUsage } from '../scripts/lib/usage.mjs';
import { paceOf } from '../scripts/lib/pace.mjs';
import { REPO_ROOT } from './helpers.mjs';

const fx = (name) => fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'budget', name), 'utf8');
const ok = (patch = {}) => {
  const budget = JSON.parse(fx('ok.json'));
  Object.assign(budget, patch);
  return { state: 'ok', budget };
};
const NOW = new Date('2026-11-22T12:00:00Z');
const pace = (usage, extra = {}) => paceOf(usage, { planSlots: 4, now: NOW, ...extra });

test('rule 1: off or error gives the plan slots', () => {
  for (const u of [{ state: 'off' }, { state: 'error', reason: 'x' }]) {
    assert.deepEqual(pace(u), { slots: 4, lowTier: false, why: 'off', resumeAt: null });
  }
});

test('rule 2: at the floor the pace is 0 until the first reset', () => {
  const budget = JSON.parse(fx('floor.json'));
  const r = pace({ state: 'ok', budget });
  assert.deepEqual(r, { slots: 0, lowTier: false, why: 'floor', resumeAt: budget.resets[0].at });
  const exact = JSON.parse(fx('ok.json'));
  exact.fleet.remainingUnits = 0.5;
  assert.equal(pace({ state: 'ok', budget: exact }).why, 'floor');
});

test('rule 3: blocked gives 0 and the next usable time, else the first reset', () => {
  const budget = JSON.parse(fx('blocked.json'));
  assert.notEqual(budget.fleet.nextUsableAt, budget.resets[0].at);
  const r = pace({ state: 'ok', budget });
  assert.deepEqual(r, { slots: 0, lowTier: false, why: 'blocked', resumeAt: budget.fleet.nextUsableAt });
  budget.fleet.nextUsableAt = null;
  assert.equal(pace({ state: 'ok', budget }).resumeAt, budget.resets[0].at);
});

test('rule 4: slow_down 1 with lowTier, ok 2, can_speed_up 3', () => {
  assert.deepEqual(pace(ok({ advice: 'slow_down' })), { slots: 1, lowTier: true, why: 'slow_down', resumeAt: null });
  assert.deepEqual(pace(ok({ advice: 'ok' })), { slots: 2, lowTier: false, why: 'ok', resumeAt: null });
  assert.deepEqual(pace(ok({ advice: 'can_speed_up' })), { slots: 3, lowTier: false, why: 'can_speed_up', resumeAt: null });
});

test('rule 5: another advice word gives the plan slots', () => {
  assert.deepEqual(pace(ok({ advice: 'unknown' })), { slots: 4, lowTier: false, why: 'unknown', resumeAt: null });
});

test('rule 6: slots 0 with no resumeAt gives now + 30 min', () => {
  const budget = JSON.parse(fx('blocked.json'));
  budget.fleet.nextUsableAt = null;
  budget.resets = [];
  const r = pace({ state: 'ok', budget });
  assert.equal(r.slots, 0);
  assert.equal(r.resumeAt, new Date(NOW.getTime() + 30 * 60000).toISOString());
});

test('max 1 limits can_speed_up to 1', () => {
  assert.equal(pace(ok({ advice: 'can_speed_up' }), { max: 1 }).slots, 1);
});

test('usage.source off runs nothing', () => {
  let called = 0;
  const run = () => { called++; return { status: 0, stdout: fx('ok.json') }; };
  assert.deepEqual(readUsage({ usage: { source: 'off' } }, { run }), { state: 'off' });
  assert.deepEqual(readUsage({}, { run }), { state: 'off' });
  assert.equal(called, 0);
});

test('cswap source runs exactly cswap budget --json and parses the output', () => {
  const calls = [];
  const run = (file, args, opts) => { calls.push([file, args, opts]); return { status: 0, stdout: fx('ok.json') }; };
  const u = readUsage({ usage: { source: 'cswap' } }, { run });
  assert.equal(u.state, 'ok');
  assert.equal(u.budget.advice, 'ok');
  assert.equal(calls[0][0], 'cswap');
  assert.deepEqual(calls[0][1], ['budget', '--json']);
  assert.equal(calls[0][2].timeout, 10000);
});

test('exit 3, a timeout and bad JSON give error, not slots 0', () => {
  const cfg = { usage: { source: 'cswap' } };
  const cases = [
    () => ({ status: 3, stdout: '' }),
    () => ({ status: 3, stdout: fx('ok.json') }),
    () => { throw Object.assign(new Error('spawnSync cswap ETIMEDOUT'), { code: 'ETIMEDOUT' }); },
    () => { throw Object.assign(new Error('spawn cswap ENOENT'), { code: 'ENOENT' }); },
    () => ({ status: 0, stdout: fx('bad.txt') }),
  ];
  for (const run of cases) {
    const u = readUsage(cfg, { run });
    assert.equal(u.state, 'error');
    assert.equal(typeof u.reason, 'string');
    assert.equal(pace(u).slots, 4);
  }
});

test('pace.mjs --json prints the result and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda pace '));
  fs.mkdirSync(path.join(dir, '.guilda'));
  const cfg = {
    guildaVersion: '0.5.0',
    languages: { replies: 'en', docs: 'en' },
    tiers: { master: 'opus', journeyman: 'sonnet', apprentice: 'haiku' },
    writing: { free: [], exceptions: [] },
    security: { enabled: false, riskAreas: [] },
    checks: [],
    usage: { source: 'off' },
  };
  fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), JSON.stringify(cfg));
  const snap = () => JSON.stringify(fs.readdirSync(dir, { recursive: true }).sort().map((f) => [f, fs.statSync(path.join(dir, f)).mtimeMs]));
  const before = snap();
  const script = path.join(REPO_ROOT, 'scripts', 'pace.mjs');
  const r = spawnSync(process.execPath, [script, dir, '--json', '--plan-slots', '2'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { slots: 2, lowTier: false, why: 'off', resumeAt: null, source: 'off', fetchedAt: null });
  assert.equal(snap(), before);
  const bad = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /usage/i);
});

test('the default run calls cswap with exactly budget --json and no shell', () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda fake cswap '));
  const fake = path.join(bin, 'cswap');
  const body = `#!/usr/bin/env node
const b = ${fx('ok.json').trim()};
b.fakeArgs = process.argv.slice(2);
b.fakeParentIsTest = process.ppid === Number(process.env.TEST_PID);
process.stdout.write(JSON.stringify(b));
`;
  fs.writeFileSync(fake, body, { mode: 0o755 });
  const saved = { PATH: process.env.PATH, TEST_PID: process.env.TEST_PID };
  process.env.PATH = bin + path.delimiter + saved.PATH;
  process.env.TEST_PID = String(process.pid);
  try {
    const u = readUsage({ usage: { source: 'cswap' } });
    assert.equal(u.state, 'ok', u.reason);
    assert.deepEqual(u.budget.fakeArgs, ['budget', '--json']);
    assert.equal(u.budget.fakeParentIsTest, true);
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.TEST_PID === undefined) delete process.env.TEST_PID;
    else process.env.TEST_PID = saved.TEST_PID;
  }
});

test('pace.mjs with no --plan-slots flag uses plan slots 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda pace '));
  fs.mkdirSync(path.join(dir, '.guilda'));
  const cfg = {
    guildaVersion: '0.5.0',
    languages: { replies: 'en', docs: 'en' },
    tiers: { master: 'opus', journeyman: 'sonnet', apprentice: 'haiku' },
    writing: { free: [], exceptions: [] },
    security: { enabled: false, riskAreas: [] },
    checks: [],
    usage: { source: 'off' },
  };
  fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), JSON.stringify(cfg));
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'pace.mjs'), dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).slots, 1);
});
