import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { ensureIgnored } from '../scripts/lib/violations.mjs';
import { takeBusLock, releaseBusLock, appendMessage } from '../scripts/lib/bus.mjs';
import { routeOf, deliverPlan } from '../scripts/lib/router.mjs';

const BUS = path.join(REPO_ROOT, 'scripts', 'bus.mjs');
const TASK_ADDRESS = 'T3-exe-7f2a';
const JOINED = 'ext-codex-voice-4592';
const STALE_AGE_MS = 11000;

const busDir = (dir) => path.join(dir, '.guilda', 'bus');
const mailbox = (dir, a) => path.join(busDir(dir), `${a}.jsonl`);

function cli(dir, args) {
  const r = spawnSync(process.execPath, [BUS, dir, ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_ENV: 'test' } });
  const out = r.stdout ?? '';
  return { code: r.status, out, lines: out.split('\n').filter(Boolean) };
}

function deadPid() {
  const r = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  return r.pid;
}

function writeJournal(dir, evs) {
  const q = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(q, { recursive: true });
  const t0 = Date.parse('2026-11-17T10:00:00.000Z');
  const text = evs.map((e, i) => JSON.stringify({ seq: i + 1, t: new Date(t0 + i * 1000).toISOString(), ...e })).join('\n');
  fs.writeFileSync(path.join(q, 'journal.jsonl'), `${text}\n`);
}

const EVENTS = [
  { type: 'task', task: 'T3', work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
  { type: 'dispatch', task: 'T3', attempt: 1, address: TASK_ADDRESS, role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master' },
  { type: 'join', address: JOINED, tool: 'codex', name: 'voice' },
];

/** A project with the two bindings and the mailboxes of the acceptance scenario. */
function fixture() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  ensureIgnored(path.join(dir, '.guilda'));
  writeJournal(dir, EVENTS);
  fs.mkdirSync(busDir(dir), { recursive: true });
  const send = (to, type, text) => appendMessage(dir, { from: 'main', to, task: null, type, text, replyTo: null, hops: 0, record: null, interrupt: false });
  const ids = [send(TASK_ADDRESS, 'request', 'one').id, send(TASK_ADDRESS, 'ack', 'ok').id, send(TASK_ADDRESS, 'request', 'two').id];
  const ext = send(JOINED, 'request', 'voice').id;
  return { dir, ids, ext };
}

test('routeOf: relay, wait and none', () => {
  const b = (o) => ({ state: 'bound', tool: 'claude', inSession: true, ...o });
  assert.equal(routeOf(b({})), 'relay');
  assert.equal(routeOf(b({ tool: 'codex', inSession: false })), 'wait');
  assert.equal(routeOf(b({ inSession: false })), 'wait');
  assert.equal(routeOf(b({ state: 'unbound' })), 'none');
  assert.equal(routeOf(b({ tool: 'codex', inSession: false, state: 'unbound' })), 'none');
  assert.equal(routeOf(undefined), 'none');
  assert.equal(routeOf(null), 'none');
});

test('deliverPlan keeps file order and skips an ack', () => {
  const { dir, ids } = fixture();
  const plan = deliverPlan(dir, TASK_ADDRESS);
  assert.deepEqual(plan.map((p) => p.id), [ids[0], ids[2]]);
  for (const p of plan) {
    assert.equal(p.route, 'relay');
    assert.equal(p.from, 'main');
    assert.equal(p.type, 'request');
    assert.equal(p.header, `guilda-message: ${p.id} from main type request`);
  }
  assert.deepEqual(fs.readdirSync(busDir(dir)).filter((f) => f.endsWith('.lock')), []);
});

test('a second deliver exits 3 busy while the first holds the lock', () => {
  const { dir } = fixture();
  const held = takeBusLock(dir, `${TASK_ADDRESS}.deliver`);
  try {
    const r = cli(dir, ['deliver', '--address', TASK_ADDRESS]);
    assert.equal(r.code, 3, r.out);
    assert.equal(r.out.trim(), 'busy');
  } finally {
    releaseBusLock(held);
  }
  assert.equal(cli(dir, ['deliver', '--address', TASK_ADDRESS]).code, 0);
});

test('a stale delivery lock of a dead PID, 11 s old, is taken over', () => {
  const { dir, ids } = fixture();
  const file = path.join(busDir(dir), `${TASK_ADDRESS}.deliver.lock`);
  fs.writeFileSync(file, `${JSON.stringify({ pid: deadPid(), time: Date.now() - STALE_AGE_MS })}\n`);
  const r = cli(dir, ['deliver', '--address', TASK_ADDRESS]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.lines.length, 2);
  assert.equal(JSON.parse(r.lines[0]).id, ids[0]);
  assert.equal(fs.existsSync(file), false);
});

test('deliver starts no process, writes no receipt and writes no message', () => {
  const { dir, ids, ext } = fixture();
  const before = { a: fs.readFileSync(mailbox(dir, TASK_ADDRESS)), b: fs.readFileSync(mailbox(dir, JOINED)) };
  const names = fs.readdirSync(busDir(dir)).sort();
  const r = cli(dir, ['deliver', '--address', TASK_ADDRESS]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.lines.length, 2);
  const parsed = r.lines.map((l) => JSON.parse(l));
  assert.deepEqual(parsed.map((p) => p.id), [ids[0], ids[2]]);
  for (const p of parsed) {
    assert.equal(p.route, 'relay');
    assert.equal(p.header, `guilda-message: ${p.id} from main type request`);
    assert.deepEqual(Object.keys(p).sort(), ['header', 'id', 'route']);
  }
  const w = cli(dir, ['deliver', '--address', JOINED]);
  assert.equal(w.code, 0, w.out);
  assert.equal(w.lines.length, 1);
  assert.equal(JSON.parse(w.lines[0]).route, 'wait');
  assert.equal(JSON.parse(w.lines[0]).id, ext);
  assert.deepEqual(fs.readFileSync(mailbox(dir, TASK_ADDRESS)), before.a);
  assert.deepEqual(fs.readFileSync(mailbox(dir, JOINED)), before.b);
  assert.deepEqual(fs.readdirSync(busDir(dir)).sort(), names);
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', 'router.mjs'), 'utf8');
  assert.doesNotMatch(src, /child_process|appendReceipt|appendMessage/);
});

test('an unknown address exits 2', () => {
  const { dir } = fixture();
  const u = cli(dir, ['deliver', '--address', 'T9-exe-aaaa']);
  assert.equal(u.code, 2);
  assert.equal(u.out.trim(), 'unknown address T9-exe-aaaa');
  const b = cli(dir, ['deliver', '--address', '../x']);
  assert.equal(b.code, 2);
  assert.equal(b.out.trim(), 'bad address');
  assert.deepEqual(fs.readdirSync(busDir(dir)).filter((f) => f.endsWith('.lock')), []);
});

test('with no .guilda folder deliver exits 1 and creates no folder', () => {
  const dir = tempProject();
  const r = cli(dir, ['deliver', '--address', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('deliver creates no bus folder and no mailbox when they are missing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = cli(dir, ['deliver', '--address', 'architect']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
  assert.equal(fs.existsSync(busDir(dir)), false);
});
