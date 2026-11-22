import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { readClaim, touchClaim, readJournal, runWriter } from '../scripts/lib/queue.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const T0 = Date.parse('2026-11-20T10:00:00.000Z');
const MIN = 60000;
const at = (min) => new Date(T0 + min * MIN).toISOString();

function q(dir, min, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args, '--now', at(min)], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const writerFile = (dir) => path.join(dir, '.guilda', 'queue', 'writer.json');
const readWriter = (dir) => JSON.parse(fs.readFileSync(writerFile(dir), 'utf8'));
const project = () => tempProject({ config: MINIMAL_CONFIG });

test('claim writes writer.json and a claim event', () => {
  const dir = project();
  const r = q(dir, 0, 'claim', '--session', 's1');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readWriter(dir), { session: 's1', ttlSec: 600, aliveAt: at(0), pid: null });
  const ev = readJournal(dir).events.filter((e) => e.type === 'claim');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].session, 's1');
  assert.equal(ev[0].ttlSec, 600);
  assert.equal(ev[0].takeover, false);
  const c = readClaim(dir, { now: at(1) });
  assert.equal(c.live, true);
  assert.equal(c.session, 's1');
  assert.equal(readClaim(dir, { now: at(10) }).live, false);
  assert.equal(q(dir, 0, 'claim', '--session', 's2', '--ttl', '59').code, 1);
  assert.match(q(dir, 0, 'claim', '--session', 's1', '--ttl', '3601').out, /invalid ttl/);
});

test('a second claim of another session exits 3 with claimed by session <id>', () => {
  const dir = project();
  assert.equal(q(dir, 0, 'claim', '--session', 's1').code, 0);
  const r = q(dir, 1, 'claim', '--session', 's2');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /claimed by session s1/);
  assert.equal(readWriter(dir).session, 's1');
  assert.equal(readJournal(dir).events.filter((e) => e.type === 'claim').length, 1);
});

test('a claim after the ttl is a takeover', () => {
  const dir = project();
  assert.equal(q(dir, 0, 'claim', '--session', 's1', '--ttl', '60').code, 0);
  const r = q(dir, 2, 'claim', '--session', 's2');
  assert.equal(r.code, 0, r.out);
  assert.equal(readWriter(dir).session, 's2');
  const ev = readJournal(dir).events.filter((e) => e.type === 'claim');
  assert.equal(ev.at(-1).takeover, true);
});

test('unclaim of another session exits 1', () => {
  const dir = project();
  assert.equal(q(dir, 0, 'claim', '--session', 's1').code, 0);
  const r = q(dir, 1, 'unclaim', '--session', 's2');
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: not the claim session/);
  assert.equal(readClaim(dir, { now: at(1) }).live, true);
  assert.equal(q(dir, 2, 'unclaim', '--session', 's1').code, 0);
  assert.equal(readClaim(dir, { now: at(2) }).live, false);
  assert.equal(readJournal(dir).events.filter((e) => e.type === 'unclaim').length, 1);
});

test('readClaim of a bad writer.json is null', () => {
  const dir = project();
  assert.equal(readClaim(dir, { now: at(0) }), null);
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(writerFile(dir), '{not json');
  assert.equal(readClaim(dir, { now: at(0) }), null);
  fs.writeFileSync(writerFile(dir), JSON.stringify({ session: 5 }));
  assert.equal(readClaim(dir, { now: at(0) }), null);
  assert.equal(touchClaim(dir, 's1', { now: at(0) }), false);
});

test('slots 0 and 8 pass, 9 exits 1 with invalid slots', () => {
  const dir = project();
  assert.equal(q(dir, 0, 'slots', '0', '--session', 's1').code, 0);
  assert.equal(q(dir, 1, 'slots', '8', '--session', 's1').code, 0);
  const r = q(dir, 2, 'slots', '9', '--session', 's1');
  assert.equal(r.code, 1);
  assert.match(r.out, /invalid slots/);
  assert.equal(q(dir, 2, 'slots', '-1', '--session', 's1').code, 1);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'queue', 'state.json'), 'utf8'));
  assert.equal(s.slots, 8);
  const d = readJournal(dir).events.filter((e) => e.type === 'decision' && e.decision === 'slots');
  assert.deepEqual(d.map((e) => e.slots), [0, 8]);
});

test('runWriter refreshes aliveAt for the claim session', () => {
  const dir = project();
  assert.equal(q(dir, 0, 'claim', '--session', 's1').code, 0);
  runWriter(dir, { now: at(5), session: 's1' }, null);
  assert.equal(readWriter(dir).aliveAt, at(5));
  runWriter(dir, { now: at(6), session: 's2' }, null);
  assert.equal(readWriter(dir).aliveAt, at(5));
  runWriter(dir, { now: at(7) }, null);
  assert.equal(readWriter(dir).aliveAt, at(5));
  assert.equal(touchClaim(dir, 's1', { now: at(8), pid: 42 }), true);
  assert.deepEqual(readClaim(dir, { now: at(8) }).pid, 42);
  assert.equal(touchClaim(dir, 's2', { now: at(8) }), false);
});

const GOOD_CLAIM = { session: 's1', ttlSec: 600, aliveAt: at(0), pid: null };

test('readClaim of a ttlSec of 0 or -1 is null', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  for (const ttlSec of [0, -1]) {
    fs.writeFileSync(writerFile(dir), JSON.stringify({ ...GOOD_CLAIM, ttlSec }));
    assert.equal(readClaim(dir, { now: at(1) }), null, `ttlSec ${ttlSec}`);
  }
});

test('readClaim of a symlink is null, and touchClaim writes through no symlink', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-out-'));
  const target = path.join(outside, 'target.json');
  fs.writeFileSync(target, JSON.stringify(GOOD_CLAIM));
  fs.symlinkSync(target, writerFile(dir));
  assert.equal(readClaim(dir, { now: at(1) }), null);
  assert.equal(touchClaim(dir, 's1', { now: at(2) }), false);
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).aliveAt, at(0));
});

test('readClaim of a folder is null', () => {
  const dir = project();
  fs.mkdirSync(writerFile(dir), { recursive: true });
  assert.equal(readClaim(dir, { now: at(1) }), null);
});

test('readClaim of a FIFO is null', (t) => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  const mk = spawnSync('mkfifo', [writerFile(dir)]);
  if (mk.error || mk.status !== 0) {
    t.skip('mkfifo is not available');
    return;
  }
  assert.equal(readClaim(dir, { now: at(1) }), null);
});
