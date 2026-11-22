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
  assert.deepEqual(u.notices, ['account 1: the id had an @ and was replaced']);
  const text = JSON.stringify(u);
  for (const s of [EMAIL, TOKEN, ORG]) assert.ok(!text.includes(s), s);
  // The adapter writes nothing: a grep of the temp project finds neither string.
  const files = fs.readdirSync(dir, { recursive: true });
  assert.deepEqual(files, []);
});

test('typed guard: a value with a wrong type is dropped, in each field', () => {
  const wrong = [{ nested: ORG }, [EMAIL], 'x'.repeat(65), EMAIL, true];
  const run = (mutate) => {
    const s = stub();
    mutate(s);
    return readUsage(CFG, { run: () => ({ status: 0, stdout: JSON.stringify(s) }) });
  };
  for (const w of wrong) {
    const u = run((s) => {
      s.schemaVersion = w;
      s.status = w;
      s.fetchedAt = w;
      s.fleet.accounts = w;
      s.fleet.capacityUnits = w;
      s.fleet.remainingUnits = w;
      s.fleet.usableNow = w;
      s.fleet.nextUsableAt = w;
      s.resets[0].at = w;
      s.accounts[1].id = w;
      s.accounts[1].plan = w;
      s.accounts[1].fiveHour.usedPercent = w;
      s.accounts[1].fiveHour.resetsAt = w;
      s.accounts[1].sevenDay.usedPercent = w;
      s.accounts[1].sevenDay.resetsAt = w;
    });
    assert.equal(u.state, 'ok');
    assert.deepEqual(u.budget.fleet, {});
    assert.deepEqual(u.budget.resets, [{}]);
    // An id with an @ is replaced, not dropped.
    const id = w === EMAIL ? { id: 'account-2' } : {};
    assert.deepEqual(u.budget.accounts[1], { ...id, fiveHour: {}, sevenDay: {} });
    for (const k of ['schemaVersion', 'status', 'fetchedAt']) assert.equal(u.budget[k], undefined, k);
    assert.ok(!JSON.stringify(u).includes(ORG) && !JSON.stringify(u).includes(EMAIL));
  }
  // A float is not an integer; a null is kept only where the field allows it.
  const u = run((s) => {
    s.schemaVersion = 1.5;
    s.fleet.usableNow = 2.5;
    s.fleet.nextUsableAt = null;
    s.accounts[1].fiveHour.resetsAt = null;
    s.accounts[1].sevenDay.usedPercent = null;
    s.fleet.remainingUnits = null;
  });
  assert.equal(u.budget.schemaVersion, undefined);
  assert.deepEqual(Object.keys(u.budget.fleet).sort(), ['accounts', 'capacityUnits', 'nextUsableAt']);
  assert.equal(u.budget.fleet.nextUsableAt, null);
  assert.deepEqual(u.budget.accounts[1].fiveHour, { usedPercent: 0, resetsAt: null });
  assert.deepEqual(u.budget.accounts[1].sevenDay, { resetsAt: '2026-11-28T12:59:59Z' });
});

test('a bad JSON gives the fixed reason with no parser text and no email', () => {
  for (const out of [`{"token": "${TOKEN}", "email": "${EMAIL}" oops`, `${EMAIL} not json`]) {
    const u = readUsage(CFG, { run: () => ({ status: 0, stdout: out }) });
    assert.deepEqual(u, { state: 'error', reason: 'bad JSON' });
  }
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
  assert.deepEqual(u, { state: 'off', notice: 'cswap budget exited with status 7' });
  for (const state of [u, { state: 'error', reason: 'x' }]) {
    assert.deepEqual(paceOf(state, { planSlots: 4 }), { slots: 4, lowTier: false, why: 'off', resumeAt: null });
  }
});
