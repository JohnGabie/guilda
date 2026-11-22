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
// A claim decision uses the real clock (R32), so a test that needs an old claim writes it into writer.json.
const ago = (min) => new Date(Date.now() - min * MIN).toISOString();

/** Run the queue script. `extra` goes after the arguments (for example a --now that the script must not trust). */
function q(dir, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const writerFile = (dir) => path.join(dir, '.guilda', 'queue', 'writer.json');
const readWriter = (dir) => JSON.parse(fs.readFileSync(writerFile(dir), 'utf8'));
const project = () => tempProject({ config: MINIMAL_CONFIG });
/** Write an old claim as a fixture. */
function fixture(dir, session, { aliveAt, ttlSec = 600 }) {
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(writerFile(dir), JSON.stringify({ session, ttlSec, aliveAt, pid: null }));
}
const near = (iso) => Math.abs(Date.parse(iso) - Date.now()) < 60000;

test('claim writes writer.json and a claim event', () => {
  const dir = project();
  const r = q(dir, 'claim', '--session', 's1');
  assert.equal(r.code, 0, r.out);
  const w = readWriter(dir);
  assert.deepEqual({ ...w, aliveAt: null }, { session: 's1', ttlSec: 600, aliveAt: null, pid: null });
  assert.ok(near(w.aliveAt));
  const ev = readJournal(dir).events.filter((e) => e.type === 'claim');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].session, 's1');
  assert.equal(ev[0].ttlSec, 600);
  assert.equal(ev[0].takeover, false);
  const c = readClaim(dir);
  assert.equal(c.live, true);
  assert.equal(c.session, 's1');
  assert.equal(readClaim(dir, { now: new Date(Date.now() + 10 * MIN).toISOString() }).live, false);
  assert.equal(q(dir, 'claim', '--session', 's2', '--ttl', '59').code, 1);
  assert.match(q(dir, 'claim', '--session', 's1', '--ttl', '3601').out, /invalid ttl/);
});

test('a second claim of another session exits 3 with claimed by session <id>', () => {
  const dir = project();
  assert.equal(q(dir, 'claim', '--session', 's1').code, 0);
  const r = q(dir, 'claim', '--session', 's2');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /claimed by session s1/);
  assert.equal(readWriter(dir).session, 's1');
  assert.equal(readJournal(dir).events.filter((e) => e.type === 'claim').length, 1);
});

test('claim with a --now far in the future still exits 3 while another session holds the claim (real clock)', () => {
  const dir = project();
  assert.equal(q(dir, 'claim', '--session', 's1').code, 0);
  const r = q(dir, 'claim', '--session', 's2', '--now', '2099-01-01T00:00:00.000Z');
  assert.equal(r.code, 3, r.out);
  assert.equal(readWriter(dir).session, 's1');
});

test('a claim after the ttl is a takeover', () => {
  const dir = project();
  fixture(dir, 's1', { aliveAt: ago(2), ttlSec: 60 });
  const r = q(dir, 'claim', '--session', 's2');
  assert.equal(r.code, 0, r.out);
  assert.equal(readWriter(dir).session, 's2');
  const ev = readJournal(dir).events.filter((e) => e.type === 'claim');
  assert.equal(ev.at(-1).takeover, true);
});

test('unclaim of another session exits 1', () => {
  const dir = project();
  assert.equal(q(dir, 'claim', '--session', 's1').code, 0);
  const r = q(dir, 'unclaim', '--session', 's2');
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: not the claim session/);
  assert.equal(readClaim(dir).live, true);
  assert.equal(q(dir, 'unclaim', '--session', 's1', '--now', at(0)).code, 0);
  assert.equal(readClaim(dir).live, false);
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
  assert.equal(q(dir, 'slots', '0', '--session', 's1', '--now', at(0)).code, 0);
  assert.equal(q(dir, 'slots', '8', '--session', 's1', '--now', at(1)).code, 0);
  const r = q(dir, 'slots', '9', '--session', 's1', '--now', at(2));
  assert.equal(r.code, 1);
  assert.match(r.out, /invalid slots/);
  assert.equal(q(dir, 'slots', '-1', '--session', 's1', '--now', at(2)).code, 1);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'queue', 'state.json'), 'utf8'));
  assert.equal(s.slots, 8);
  const d = readJournal(dir).events.filter((e) => e.type === 'decision' && e.decision === 'slots');
  assert.deepEqual(d.map((e) => e.slots), [0, 8]);
});

test('runWriter refreshes aliveAt for the claim session with the real time', () => {
  const dir = project();
  const old = ago(5);
  fixture(dir, 's1', { aliveAt: old });
  runWriter(dir, { now: at(5), session: 's1' }, null);
  assert.ok(near(readWriter(dir).aliveAt));
  fixture(dir, 's1', { aliveAt: old });
  runWriter(dir, { now: at(6), session: 's2' }, null);
  assert.equal(readWriter(dir).aliveAt, old);
  runWriter(dir, { now: at(7) }, null);
  assert.equal(readWriter(dir).aliveAt, old);
  assert.equal(touchClaim(dir, 's1', { pid: 42 }), true);
  assert.deepEqual(readClaim(dir).pid, 42);
  assert.equal(touchClaim(dir, 's2'), false);
});

test('after unclaim, touchClaim of the same session returns false and the claim stays not live', () => {
  const dir = project();
  assert.equal(q(dir, 'claim', '--session', 's1').code, 0);
  assert.equal(q(dir, 'unclaim', '--session', 's1').code, 0);
  const before = fs.readFileSync(writerFile(dir), 'utf8');
  assert.equal(touchClaim(dir, 's1'), false);
  assert.equal(fs.readFileSync(writerFile(dir), 'utf8'), before);
  assert.equal(readClaim(dir).live, false);
  runWriter(dir, { now: at(1), session: 's1' }, null);
  assert.equal(readClaim(dir).live, false);
});

test('touchClaim with the queue lock busy returns false and writes nothing', () => {
  const dir = project();
  fixture(dir, 's1', { aliveAt: ago(5) });
  const before = fs.readFileSync(writerFile(dir), 'utf8');
  fs.writeFileSync(path.join(dir, '.guilda', 'queue', 'lock'), `${JSON.stringify({ pid: process.ppid, session: 's9', at: new Date().toISOString() })}\n`);
  assert.equal(touchClaim(dir, 's1'), false);
  assert.equal(fs.readFileSync(writerFile(dir), 'utf8'), before);
});

test('touchClaim writes the real time even when the caller passes a now', () => {
  const dir = project();
  fixture(dir, 's1', { aliveAt: ago(5) });
  assert.equal(touchClaim(dir, 's1', { now: '2099-01-01T00:00:00.000Z' }), true);
  const w = readWriter(dir);
  assert.notEqual(w.aliveAt, '2099-01-01T00:00:00.000Z');
  assert.ok(near(w.aliveAt));
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
