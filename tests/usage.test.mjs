import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readUsage } from '../scripts/lib/usage.mjs';
import { paceOf } from '../scripts/lib/pace.mjs';

const CFG = { usage: { source: 'cswap' } };
const EMAIL = 'a@b.example';
// Built in code so this file holds no literal token.
const TOKEN = 'sk-ant-' + 'T'.repeat(24);
const ORG = 'Secret Org Name';

const stub = () => ({
  schemaVersion: 1,
  status: 'ok',
  fetchedAt: '2026-11-22T20:17:17Z',
  advice: 'ok',
  reason: `the account ${EMAIL} is fine`,
  token: TOKEN,
  fleet: { accounts: 2, capacityUnits: 6, remainingUnits: 3, usableNow: 2, nextUsableAt: '2026-11-23T08:00:00Z', extra: 'x' },
  resets: [{ at: '2026-11-23T08:00:00Z', expiringUnits: 1 }],
  accounts: [
    {
      id: EMAIL, email: EMAIL, org: ORG, token: TOKEN, plan: 'max', provider: 'claude',
      fiveHour: { usedPercent: 5, resetsAt: '2026-11-23T00:40:00Z', pct: 5 },
      sevenDay: { usedPercent: 89, resetsAt: '2026-11-23T08:00:00Z', pct: 89 },
    },
    { id: 'work', org: ORG, plan: 'pro', fiveHour: { usedPercent: 0, resetsAt: null }, sevenDay: { usedPercent: 6, resetsAt: '2026-11-28T12:59:59Z' } },
  ],
});

test('S5-13: the budget keeps only the listed fields and no file holds the account data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda usage '));
  const u = readUsage(CFG, { run: () => ({ status: 0, stdout: JSON.stringify(stub()) }) });
  assert.equal(u.state, 'ok');
  assert.deepEqual(Object.keys(u.budget).sort(), ['accounts', 'advice', 'fetchedAt', 'fleet', 'resets', 'schemaVersion', 'status']);
  assert.deepEqual(Object.keys(u.budget.fleet).sort(), ['accounts', 'capacityUnits', 'nextUsableAt', 'remainingUnits', 'usableNow']);
  assert.deepEqual(u.budget.resets, [{ at: '2026-11-23T08:00:00Z' }]);
  assert.deepEqual(u.budget.accounts[0], {
    id: 'account-1', plan: 'max',
    fiveHour: { usedPercent: 5, resetsAt: '2026-11-23T00:40:00Z' },
    sevenDay: { usedPercent: 89, resetsAt: '2026-11-23T08:00:00Z' },
  });
  assert.equal(u.budget.accounts[1].id, 'work');
  assert.equal(u.notices.length, 1);
  const text = JSON.stringify(u);
  for (const s of [EMAIL, TOKEN, ORG]) assert.ok(!text.includes(s), s);
  // The adapter writes nothing: a grep of the temp project finds neither string.
  const files = fs.readdirSync(dir, { recursive: true });
  assert.deepEqual(files, []);
});

test('typed guard: a kept field is a finite number or a short string with no @', () => {
  const s = stub();
  s.status = { nested: 'x' };
  s.fetchedAt = 'x'.repeat(65);
  s.fleet.capacityUnits = 'a@b.example';
  s.fleet.remainingUnits = 1e999;
  s.fleet.usableNow = ['list'];
  s.accounts[1].plan = { org: ORG };
  s.accounts[1].fiveHour.usedPercent = 'a@b';
  s.accounts[1].sevenDay.resetsAt = null;
  const u = readUsage(CFG, { run: () => ({ status: 0, stdout: JSON.stringify(s).replace('null', '1e999') }) });
  assert.equal(u.state, 'ok');
  assert.equal(u.budget.status, undefined);
  assert.equal(u.budget.fetchedAt, undefined);
  assert.deepEqual(Object.keys(u.budget.fleet).sort(), ['accounts', 'nextUsableAt']);
  assert.deepEqual(u.budget.accounts[1], { id: 'work', fiveHour: {}, sevenDay: { usedPercent: 6 } });
  assert.ok(!JSON.stringify(u).includes(ORG));
});

test('a bad JSON gives the fixed reason with no parser text', () => {
  const u = readUsage(CFG, { run: () => ({ status: 0, stdout: `{"token": "${TOKEN}" oops` }) });
  assert.deepEqual(u, { state: 'error', reason: 'bad JSON' });
});

test('an advice word that is not known reads as unknown', () => {
  const s = stub();
  s.advice = 'go_wild';
  const u = readUsage(CFG, { run: () => ({ status: 0, stdout: JSON.stringify(s) }) });
  assert.equal(u.budget.advice, 'unknown');
});

test('exit codes 2, 3, 4 and others give off with a notice', () => {
  const want = { 2: 'no accounts', 3: 'usage source unavailable', 4: 'usage command error' };
  for (const [code, notice] of Object.entries(want)) {
    assert.deepEqual(readUsage(CFG, { run: () => ({ status: Number(code), stdout: TOKEN }) }), { state: 'off', notice });
  }
  const u = readUsage(CFG, { run: () => ({ status: 7, stdout: '' }) });
  assert.equal(u.state, 'off');
  assert.match(u.notice, /7/);
  for (const state of [u, { state: 'error', reason: 'x' }]) {
    assert.deepEqual(paceOf(state, { planSlots: 4 }), { slots: 4, lowTier: false, why: 'off', resumeAt: null });
  }
});
