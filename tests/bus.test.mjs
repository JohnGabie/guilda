import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { ensureIgnored, IGNORED } from '../scripts/lib/violations.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
import { readJournal } from '../scripts/lib/queue.mjs';
import {
  readMailbox,
  receiptState,
  pendingOf,
  appendReceipt,
  computeHops,
  takeBusLock,
  releaseBusLock,
  BusError,
} from '../scripts/lib/bus.mjs';
import { main } from '../scripts/bus.mjs';

const BUS = path.join(REPO_ROOT, 'scripts', 'bus.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const JOINED = 'ext-codex-voice-4592';
const TASK_ADDRESS = 'T3-exe-7f2a';
const ID = /^\{"id":"(m-[0-9a-f]{8})"\}$/;
const LOOP_TEXT = (n, max) => `loop limit: hop ${n} over ${max} (bus.maxHops); a message from main continues the chain`;
const STALE_AGE_MS = 11000;

function project(extra = {}) {
  return tempProject({ config: { ...MINIMAL_CONFIG, ...extra } });
}

/** Run the bus script in a child process, as an agent does. */
function cli(dir, args, env = {}) {
  const r = spawnSync(process.execPath, [BUS, dir, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, NODE_ENV: 'test', ...env },
  });
  const out = r.stdout ?? '';
  return { code: r.status, out, first: out.split('\n')[0], lines: out.split('\n').filter(Boolean) };
}

/** Run the bus script in this process. */
function run(dir, ...args) {
  const r = main([dir, ...args]);
  return { code: r.code, first: r.lines[0] ?? '', lines: r.lines };
}

const busDir = (dir) => path.join(dir, '.guilda', 'bus');
const mailbox = (dir, a) => path.join(busDir(dir), `${a}.jsonl`);
const rawLines = (dir, a) =>
  fs.existsSync(mailbox(dir, a)) ? fs.readFileSync(mailbox(dir, a), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

function writeJournal(dir, evs) {
  const q = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(q, { recursive: true });
  const t0 = Date.parse('2026-11-17T10:00:00.000Z');
  const text = evs.map((e, i) => JSON.stringify({ seq: i + 1, t: new Date(t0 + i * 1000).toISOString(), ...e })).join('\n');
  fs.writeFileSync(path.join(q, 'journal.jsonl'), `${text}\n`);
}

const TASK_EVENTS = [
  { type: 'task', task: 'T3', work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
  { type: 'dispatch', task: 'T3', attempt: 1, address: TASK_ADDRESS, role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master' },
];
const JOIN_EVENT = { type: 'join', address: JOINED, tool: 'codex', name: 'voice' };

/** Every file below dir with its content, so a new or changed file shows. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${path.relative(dir, p)} ${e.isFile() ? fs.readFileSync(p, 'utf8') : 'link'}`);
    }
  };
  walk(dir);
  return out.sort();
}

function deadPid() {
  const r = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  return r.pid;
}

function plantLock(dir, address, body, ageMs = 0) {
  fs.mkdirSync(busDir(dir), { recursive: true });
  const file = path.join(busDir(dir), `${address}.lock`);
  fs.writeFileSync(file, typeof body === 'string' ? body : `${JSON.stringify(body)}\n`);
  if (ageMs > 0) {
    const t = (Date.now() - ageMs) / 1000;
    fs.utimesSync(file, t, t);
  }
  return file;
}

/** Start a child process and resolve with its exit code and stdout. */
function start(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, NODE_ENV: 'test', ...env } });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.on('close', (code) => resolve({ code, out }));
  });
}

const leftovers = (dir) => fs.readdirSync(busDir(dir)).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp') || f.includes('.takeover.'));

test('join and the fixed names', () => {
  const dir = project({ adapters: { codex: { enabled: true } } });
  ensureIgnored(path.join(dir, '.guilda'));
  const before = files(dir);
  const r = cli(dir, ['join', '--tool', 'codex', '--name', 'voice'], { GUILDA_TEST_RANDOM: '4592' });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.first, `{"address":"${JOINED}"}`);
  const after = files(dir);
  const added = after.filter((f) => !before.includes(f));
  assert.equal(added.length, 1, added.join('\n'));
  assert.match(added[0], new RegExp(`^\\.guilda/bus/signals/join-${JOINED}\\.json `));
  assert.deepEqual(before.filter((f) => !after.includes(f)), [], 'no file changes');
  const signal = JSON.parse(added[0].slice(added[0].indexOf(' ') + 1));
  assert.deepEqual(Object.keys(signal).sort(), ['address', 'at', 'name', 'tool']);
  assert.equal(signal.address, JOINED);

  const again = cli(dir, ['join', '--tool', 'codex', '--name', 'voice'], { GUILDA_TEST_RANDOM: '1234' });
  assert.equal(again.code, 0, again.out);
  assert.equal(again.first, `{"address":"${JOINED}"}`, 'the same tool and name keep the address');
  assert.deepEqual(files(dir), after);

  const sup = cli(dir, ['send', '--from', 'main', '--to', 'supervisor', '--type', 'request', '--text', 'x']);
  assert.equal(sup.code, 2);
  assert.equal(sup.first, 'unknown address supervisor');
  const council = cli(dir, ['send', '--from', 'main', '--to', 'council-1a2b', '--type', 'request', '--text', 'x']);
  assert.equal(council.code, 2);
  assert.equal(council.first, 'unknown address council-1a2b');

  const addr = cli(dir, ['address', '--task', 'T3', '--role', 'exe']);
  assert.equal(addr.code, 2);
  assert.equal(addr.first, 'unknown command address');

  const q = spawnSync(process.execPath, [QUEUE, dir, 'add', 'architect', '--title', 'x'], { encoding: 'utf8' });
  assert.equal(q.status, 1, q.stdout);
  assert.equal(q.stdout.split('\n')[0], 'invalid ID');

  // The join signal is folded by queue sync (producer and consumer).
  const sync = spawnSync(process.execPath, [QUEUE, dir, 'sync'], { encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stdout);
  const joins = readJournal(dir).events.filter((e) => e.type === 'join');
  assert.deepEqual(joins.map((e) => [e.address, e.tool, e.name]), [[JOINED, 'codex', 'voice']]);
});

test('join is off while both adapters are off', () => {
  const dir = project();
  const before = files(dir);
  const codex = cli(dir, ['join', '--tool', 'codex', '--name', 'voice'], { GUILDA_TEST_RANDOM: '4592' });
  assert.equal(codex.code, 2);
  assert.equal(codex.first, 'adapter codex is off (adapters.codex.enabled)');
  const claude = cli(dir, ['join', '--tool', 'claude', '--name', 'voice']);
  assert.equal(claude.code, 2);
  assert.equal(claude.first, 'adapter claude is off (adapters.peer.enabled)');
  assert.deepEqual(files(dir), before, 'nothing is written');
  assert.equal(fs.existsSync(busDir(dir)), false);

  const peer = project({ adapters: { peer: { enabled: true } } });
  const ok = cli(peer, ['join', '--tool', 'claude', '--name', 'helper'], { GUILDA_TEST_RANDOM: '00ff' });
  assert.equal(ok.code, 0, ok.out);
  assert.equal(ok.first, '{"address":"ext-claude-helper-00ff"}');
});

test('join refuses a bad tool and a bad name', () => {
  const dir = project({ adapters: { codex: { enabled: true } } });
  const before = files(dir);
  const cases = [
    [['--tool', 'Codex', '--name', 'voice'], 'bad tool'],
    [['--tool', 'co_dex', '--name', 'voice'], 'bad tool'],
    [['--tool', 'codex', '--name', 'vo_ice'], 'bad name'],
    [['--tool', 'codex', '--name', '../x'], 'bad name'],
    [['--tool', 'codex'], 'bad name'],
    [['--tool', 'gemini', '--name', 'voice'], 'unknown tool gemini'],
  ];
  for (const [args, text] of cases) {
    const r = run(dir, 'join', ...args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.first}`);
    assert.equal(r.first, text);
  }
  assert.deepEqual(files(dir), before);
});

test('send appends one line', () => {
  const dir = project();
  writeJournal(dir, [
    { type: 'agent', address: 'architect', task: null, attempt: null, agentId: 'arc1', agentType: 'guilda:architect', parentSession: 's-1', parentAgent: null },
  ]);
  const r = cli(dir, ['send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'Which storage?']);
  assert.equal(r.code, 0, r.out);
  const m = ID.exec(r.first);
  assert.ok(m, r.first);
  const lines = rawLines(dir, 'architect');
  assert.equal(lines.length, 1);
  const last = lines.at(-1);
  assert.deepEqual(Object.keys(last).sort(), ['from', 'hops', 'id', 'reply_to', 'task', 'text', 'time', 'to', 'type', 'v']);
  assert.equal(last.v, 1);
  assert.equal(last.id, m[1]);
  assert.equal(last.from, 'main');
  assert.equal(last.to, 'architect');
  assert.equal(last.task, null);
  assert.equal(last.type, 'request');
  assert.equal(last.text, 'Which storage?');
  assert.equal(last.reply_to, null);
  assert.equal(last.hops, 0);
  assert.ok(!Number.isNaN(Date.parse(last.time)));
  assert.equal(new Date(last.time).toISOString(), last.time);

  const full = run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'decision', '--text', 'Use SQLite.', '--task', 'T3', '--reply-to', m[1], '--record', 'u-9c1b3f2a');
  assert.equal(full.code, 0, full.first);
  const two = rawLines(dir, 'architect');
  assert.equal(two.length, 2);
  assert.equal(two[1].task, 'T3');
  assert.equal(two[1].reply_to, m[1]);
  assert.equal(two[1].record, 'u-9c1b3f2a');
  assert.equal(two[1].hops, 0, 'a message from main has hop 0, also as a reply');
  assert.equal(Object.hasOwn(two[1], 'interrupt'), false);
});

test('send refuses an unknown address, a long text, an empty text and a bad type, and writes no line', () => {
  const dir = project();
  writeJournal(dir, [...TASK_EVENTS, { type: 'unbind', address: TASK_ADDRESS }]);
  const send = (...a) => run(dir, 'send', '--from', 'main', ...a);
  const cases = [
    [['--to', 'T9-exe-0000', '--type', 'request', '--text', 'x'], 'unknown address T9-exe-0000'],
    [['--to', TASK_ADDRESS, '--type', 'request', '--text', 'x'], `unknown address ${TASK_ADDRESS}`],
    [['--to', 'architect', '--type', 'request', '--text', 'a'.repeat(8001)], 'text over 8000 characters; send a file path in the text'],
    [['--to', 'architect', '--type', 'request', '--text', ''], 'empty text'],
    [['--to', 'architect', '--type', 'receipt', '--text', 'x'], 'bad type'],
    [['--to', 'architect', '--type', 'shout', '--text', 'x'], 'bad type'],
    [['--to', '../architect', '--type', 'request', '--text', 'x'], 'bad to'],
    [['--to', 'architect', '--type', 'request', '--text', 'x', '--task', '../T3'], 'bad task'],
    [['--to', 'architect', '--type', 'request', '--text', 'x', '--reply-to', 'm-../../x'], 'bad reply-to'],
    [['--to', 'architect', '--type', 'request', '--text', 'x', '--record', 'r1'], 'bad record'],
    [['--to', 'architect', '--type', 'request', '--text', 'x', '--loud'], 'bad argument --loud'],
  ];
  for (const [args, text] of cases) {
    const r = send(...args);
    assert.equal(r.code, 2, `${text}: ${r.first}`);
    assert.equal(r.first, text);
  }
  const badFrom = run(dir, 'send', '--from', '../main', '--to', 'architect', '--type', 'request', '--text', 'x');
  assert.equal(badFrom.code, 2);
  assert.equal(badFrom.first, 'bad from');
  // The order of the checks: a bad type comes before a long text and an unknown address.
  const order = send('--to', 'T9-exe-0000', '--type', 'shout', '--text', 'a'.repeat(8001));
  assert.equal(order.first, 'bad type');
  const order2 = send('--to', 'T9-exe-0000', '--type', 'request', '--text', 'a'.repeat(8001));
  assert.equal(order2.first, 'text over 8000 characters; send a file path in the text');
  assert.equal(fs.existsSync(busDir(dir)), false, 'no line and no folder');
  const max = send('--to', 'architect', '--type', 'request', '--text', 'é'.repeat(8000));
  assert.equal(max.code, 0, 'a text of 8000 characters passes');
});

test('parallel appends', { timeout: 180000 }, async () => {
  const dir = project();
  writeJournal(dir, TASK_EVENTS);
  ensureIgnored(path.join(dir, '.guilda'));
  const driver = `
    const { spawnSync } = require('node:child_process');
    const [bus, dir, from] = process.argv.slice(1);
    const codes = [];
    for (let i = 0; i < 200; i++) {
      const r = spawnSync(process.execPath, [bus, dir, 'send', '--from', from, '--to', 'architect', '--type', 'report', '--text', from + ' ' + i], { encoding: 'utf8' });
      codes.push(r.status);
    }
    process.stdout.write(JSON.stringify(codes));
  `;
  const [a, b] = await Promise.all([
    start(['-e', driver, BUS, dir, 'main']),
    start(['-e', driver, BUS, dir, TASK_ADDRESS]),
  ]);
  const codes = [...JSON.parse(a.out), ...JSON.parse(b.out)];
  assert.equal(codes.length, 400);
  assert.deepEqual([...new Set(codes)], [0], 'no exit 3 and no other error');
  const text = fs.readFileSync(mailbox(dir, 'architect'), 'utf8');
  assert.ok(text.endsWith('\n'));
  const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(lines.length, 400);
  assert.equal(new Set(lines.map((l) => l.id)).size, 400);
  for (const from of ['main', TASK_ADDRESS]) {
    const order = lines.filter((l) => l.from === from).map((l) => Number(l.text.split(' ')[1]));
    assert.deepEqual(order, [...Array(200).keys()], `the order of ${from} is kept`);
  }
  assert.deepEqual(leftovers(dir), [], 'no lock file left');
});

test('tolerant read', () => {
  const dir = project();
  fs.mkdirSync(busDir(dir));
  const one = { v: 1, id: 'm-00000001', from: 'main', to: 'architect', task: null, type: 'request', text: 'a', reply_to: null, hops: 0, time: '2026-11-10T14:00:00.000Z', extra: { keep: true } };
  const two = { id: 'm-00000002', from: 'main', to: 'architect', type: 'question', text: 'b' };
  const partial = JSON.stringify({ id: 'm-00000003', from: 'main', to: 'architect', text: 'c' }).slice(0, 30);
  fs.writeFileSync(mailbox(dir, 'architect'), `${JSON.stringify(one)}\n${JSON.stringify(two)}\n${partial}`);
  const before = files(dir);
  const r = cli(dir, ['pending', '--address', 'architect']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.lines.length, 2, r.out);
  const [p1, p2] = r.lines.map((l) => JSON.parse(l));
  assert.deepEqual(p1.extra, { keep: true }, 'an unknown field is kept');
  assert.equal(p2.id, 'm-00000002');
  assert.equal(p2.reply_to, null);
  assert.equal(p2.v, 1);
  assert.equal(p2.task, null);
  assert.equal(p2.hops, 0);
  assert.deepEqual(files(dir), before);

  const odd = [
    'not json',
    JSON.stringify({ from: 'main', to: 'architect', text: 'no id' }),
    JSON.stringify({ id: 'm-00000004', to: 'architect', text: 'no from' }),
    JSON.stringify({ id: 'm-00000005', from: 'main', text: 'no to' }),
    JSON.stringify({ id: 'm-00000006', from: 'main', to: 'architect' }),
    JSON.stringify({ id: 'm-0000007', from: 'main', to: 'architect', text: 'bad id' }),
    JSON.stringify({ id: 'm-00000008', from: '../x', to: 'architect', text: 'bad from' }),
    JSON.stringify({ id: 'm-00000009', from: 'main', to: 'architect', text: 'odd', type: 'shout', hops: -1, interrupt: 'yes', reply_to: 'x' }),
    JSON.stringify({ id: 'm-0000000a', from: 'main', to: 'architect', text: 'hops', hops: 2.5, interrupt: true }),
    JSON.stringify({ v: 1, type: 'receipt', ref: 'bad', state: 'read', by: 'main' }),
    JSON.stringify({ v: 1, type: 'receipt', ref: 'm-00000009', state: 'eaten', by: 'main' }),
    JSON.stringify({ v: 1, type: 'receipt', ref: 'm-00000009', state: 'injected', by: 'architect' }),
    '[1,2]',
    '',
  ].join('\n');
  fs.writeFileSync(mailbox(dir, 'main'), `${odd}\n`);
  const lines = readMailbox(dir, 'main');
  assert.deepEqual(lines.map((l) => l.id ?? l.ref), ['m-00000009', 'm-0000000a', 'm-00000009']);
  const [o9, oa, rc] = lines;
  assert.equal(o9.type, 'notice', 'an unknown type reads as notice');
  assert.equal(o9.hops, 0);
  assert.equal(o9.reply_to, null);
  assert.equal(Object.hasOwn(o9, 'interrupt'), false);
  assert.equal(oa.hops, 0);
  assert.equal(oa.interrupt, true);
  assert.equal(rc.type, 'receipt');
  assert.equal(receiptState(lines, 'm-00000009'), 'injected');

  assert.deepEqual(readMailbox(dir, '../main'), []);
  assert.deepEqual(readMailbox(dir, 'ext-codex-none-0000'), []);
  const plain = tempProject();
  assert.deepEqual(readMailbox(plain, 'main'), []);
  assert.deepEqual(fs.readdirSync(plain), [], 'the reader creates no folder');
});

test('ignored', () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, '.guilda', '.gitignore'), 'queue/\n');
  const r = run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x');
  assert.equal(r.code, 0, r.first);
  const lines = fs.readFileSync(path.join(dir, '.guilda', '.gitignore'), 'utf8').split('\n');
  for (const l of ['bus/', 'runs/', 'codex/']) assert.ok(lines.includes(l), l);
  assert.equal(lines.filter((l) => l === 'queue/').length, 1);
  assert.deepEqual(IGNORED.slice(-3), ['bus/', 'runs/', 'codex/']);
});

test('a live lock makes send exit 3 after 2 s', () => {
  const dir = project();
  // A live PID (this test) with an old time: a live holder is never stale.
  const lock = plantLock(dir, 'architect', { pid: process.pid, time: Date.now() - STALE_AGE_MS }, STALE_AGE_MS);
  const bytes = fs.readFileSync(lock, 'utf8');
  const t0 = Date.now();
  const r = cli(dir, ['send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x']);
  const ms = Date.now() - t0;
  assert.equal(r.code, 3, r.out);
  assert.equal(r.first, 'busy');
  assert.ok(ms >= 2000 && ms <= 2500, `waited ${ms} ms`);
  assert.equal(fs.readFileSync(lock, 'utf8'), bytes, 'the live lock stays');
  assert.equal(fs.existsSync(mailbox(dir, 'architect')), false);
  assert.deepEqual(leftovers(dir), ['architect.lock']);
});

test('a stale lock is removed and one notice comes before the message', () => {
  const dir = project();
  const pid = deadPid();
  // A dead PID that is not old yet is not stale.
  const young = plantLock(dir, 'architect', { pid, time: Date.now() });
  const wait = run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x');
  assert.equal(wait.code, 3);
  assert.ok(fs.existsSync(young));

  plantLock(dir, 'architect', { pid, time: Date.now() - STALE_AGE_MS });
  const r = run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'hello');
  assert.equal(r.code, 0, r.first);
  const lines = rawLines(dir, 'architect');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, 'notice');
  assert.equal(lines[0].text, `stale lock of pid ${pid} removed`);
  assert.equal(lines[0].from, 'main');
  assert.equal(lines[0].to, 'architect');
  assert.equal(lines[0].hops, 0);
  assert.match(lines[0].id, /^m-[0-9a-f]{8}$/);
  assert.equal(lines[1].text, 'hello');
  assert.deepEqual(leftovers(dir), []);
});

test('two senders on one stale lock keep both messages', { timeout: 60000 }, async () => {
  const dir = project();
  const pid = deadPid();
  plantLock(dir, 'architect', { pid, time: Date.now() - STALE_AGE_MS });
  const send = (text) => start([BUS, dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'report', '--text', text]);
  const [a, b] = await Promise.all([send('one'), send('two')]);
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  const lines = rawLines(dir, 'architect');
  assert.deepEqual(lines.filter((l) => l.type === 'report').map((l) => l.text).sort(), ['one', 'two']);
  assert.equal(lines.filter((l) => l.type === 'notice').length, 1, 'one takeover');
  assert.deepEqual(leftovers(dir), []);

  // A live takeover guard keeps a second sender off the stale lock.
  const held = project();
  const lock = plantLock(held, 'architect', { pid, time: Date.now() - STALE_AGE_MS });
  const bytes = fs.readFileSync(lock, 'utf8');
  fs.writeFileSync(path.join(busDir(held), `architect.lock.takeover.${pid}`), `${JSON.stringify({ pid: process.pid, time: Date.now() })}\n`);
  const r = run(held, 'send', '--from', 'main', '--to', 'architect', '--type', 'report', '--text', 'x');
  assert.equal(r.code, 3);
  assert.equal(fs.readFileSync(lock, 'utf8'), bytes, 'the stale lock is not replaced while another sender holds the guard');

  // A lock that changes after the stale check is not replaced: the sender reads it again under the guard.
  const raced = project();
  const racedLock = plantLock(raced, 'architect', { pid, time: Date.now() - STALE_AGE_MS });
  const fresh = `${JSON.stringify({ pid: process.pid, time: Date.now() })}\n`;
  let calls = 0;
  const swap = () => {
    calls += 1;
    if (calls === 1) fs.writeFileSync(racedLock, fresh);
  };
  assert.throws(() => takeBusLock(raced, 'architect', { beforeTakeover: swap }), (e) => e instanceof BusError && e.exitCode === 3);
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(racedLock, 'utf8'), fresh, 'the new lock of the other sender stays');
});

test('a lock that is not JSON is stale after 10 s by its mtime', () => {
  const dir = project();
  plantLock(dir, 'architect', 'garbage', STALE_AGE_MS);
  const r = run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x');
  assert.equal(r.code, 0, r.first);
  const lines = rawLines(dir, 'architect');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'stale lock of pid unknown removed');
  assert.deepEqual(leftovers(dir), []);

  const young = project();
  const lock = plantLock(young, 'architect', 'garbage');
  const w = run(young, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x');
  assert.equal(w.code, 3);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'garbage');
});

test('the release removes only a lock of this pid', () => {
  const dir = project();
  fs.mkdirSync(busDir(dir));
  const file = path.join(busDir(dir), 'architect.lock');
  const held = takeBusLock(dir, 'architect');
  assert.equal(held.stalePid, null);
  const mine = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(mine.pid, process.pid);
  assert.equal(typeof mine.time, 'number');
  const other = `${JSON.stringify({ pid: deadPid(), time: Date.now() })}\n`;
  fs.writeFileSync(file, other);
  assert.equal(releaseBusLock(held), false);
  assert.equal(fs.readFileSync(file, 'utf8'), other);
  assert.throws(() => takeBusLock(dir, '../x'), (e) => e instanceof BusError && e.exitCode === 2);
});

test('hops: main is 0, a reply is 1 + the parent, no reply_to is 1 + the last receipted message', () => {
  const dir = project();
  writeJournal(dir, [JOIN_EVENT]);
  const id = (r) => JSON.parse(r.first).id;
  const m1 = id(run(dir, 'send', '--from', 'main', '--to', JOINED, '--type', 'request', '--text', 'a'));
  assert.equal(rawLines(dir, JOINED)[0].hops, 0);
  assert.equal(computeHops(dir, 'main', m1), 0);
  assert.equal(computeHops(dir, JOINED, null), 1, 'no receipted message: 1');
  const m2 = id(run(dir, 'send', '--from', JOINED, '--to', 'architect', '--type', 'reply', '--text', 'b', '--reply-to', m1));
  assert.equal(rawLines(dir, 'architect')[0].hops, 1);
  const m3 = id(run(dir, 'send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'c', '--reply-to', m2));
  assert.equal(rawLines(dir, JOINED)[1].hops, 2);
  assert.equal(computeHops(dir, 'architect', m3), 3);

  appendReceipt(dir, JOINED, m1, 'delivered', JOINED);
  assert.equal(computeHops(dir, JOINED, null), 1, '1 + the hop 0 of m1');
  appendReceipt(dir, JOINED, m3, 'read', JOINED);
  assert.equal(computeHops(dir, JOINED, null), 3, '1 + the hop 2 of m3, the last receipted message');
  assert.equal(computeHops(dir, JOINED, 'm-00000000'), 3, 'an unknown reply_to falls to the last rule');
  const m4 = id(run(dir, 'send', '--from', JOINED, '--to', 'architect', '--type', 'report', '--text', 'd'));
  assert.equal(rawLines(dir, 'architect').find((l) => l.id === m4).hops, 3);

  fs.appendFileSync(mailbox(dir, 'architect'), `${JSON.stringify({ id: 'm-0000000b', from: JOINED, to: 'architect', text: 'x', hops: 'many' })}\n`);
  assert.equal(computeHops(dir, 'architect', 'm-0000000b'), 1, 'a bad hops reads as 0');
});

/** A mailbox of architect with one message of hop `hops` from JOINED. */
function chainAt(dir, hops, id = 'm-aaaaaaaa') {
  fs.mkdirSync(busDir(dir), { recursive: true });
  fs.appendFileSync(
    mailbox(dir, 'architect'),
    `${JSON.stringify({ v: 1, id, from: JOINED, to: 'architect', task: null, type: 'reply', text: 'x', reply_to: null, hops, time: '2026-11-10T14:00:00.000Z' })}\n`,
  );
  return id;
}

test('a message over the limit is refused with the loop text, and one notice goes to main', () => {
  const dir = project();
  writeJournal(dir, [JOIN_EVENT]);
  chainAt(dir, 7, 'm-77777777');
  const ok = run(dir, 'send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'at the limit', '--reply-to', 'm-77777777');
  assert.equal(ok.code, 0, 'hop 8 is not over 8');
  const parent = chainAt(dir, 8);
  const before = fs.readFileSync(mailbox(dir, JOINED), 'utf8');
  const r = run(dir, 'send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'y', '--reply-to', parent);
  assert.equal(r.code, 2);
  assert.equal(r.first, LOOP_TEXT(9, 8));
  assert.equal(fs.readFileSync(mailbox(dir, JOINED), 'utf8'), before, 'nothing goes to the receiver');
  const notices = rawLines(dir, 'main');
  assert.equal(notices.length, 1);
  const [n] = notices;
  assert.equal(n.type, 'notice');
  assert.equal(n.from, 'architect');
  assert.equal(n.to, 'main');
  assert.equal(n.hops, 0);
  assert.equal(n.text, `Loop guard stopped chain architect <-> ${JOINED}: hop 9 over 8.`);
});

test('a second refusal of one chain writes no second notice, and a message from main re-arms it', () => {
  const dir = project();
  writeJournal(dir, [JOIN_EVENT]);
  const parent = chainAt(dir, 8);
  const refuse = () => cli(dir, ['send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'y', '--reply-to', parent]);
  assert.equal(refuse().code, 2);
  assert.equal(refuse().code, 2);
  assert.equal(rawLines(dir, 'main').length, 1, 'one notice for two refusals');
  const other = cli(dir, ['send', '--from', JOINED, '--to', 'architect', '--type', 'reply', '--text', 'y', '--reply-to', parent]);
  assert.equal(other.code, 2);
  assert.equal(rawLines(dir, 'main').length, 1, 'the same pair in the other direction is the same chain');
  assert.equal(cli(dir, ['send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'go on']).code, 0);
  assert.equal(refuse().code, 2);
  const notices = rawLines(dir, 'main').filter((l) => l.type === 'notice');
  assert.equal(notices.length, 2, 'a message from main re-arms the notice');
});

test('bus.maxHops from the config is the limit', () => {
  const dir = project({ bus: { maxHops: 2 } });
  writeJournal(dir, [JOIN_EVENT]);
  chainAt(dir, 1, 'm-11111111');
  assert.equal(run(dir, 'send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'a', '--reply-to', 'm-11111111').code, 0);
  chainAt(dir, 2, 'm-22222222');
  const r = run(dir, 'send', '--from', 'architect', '--to', JOINED, '--type', 'reply', '--text', 'b', '--reply-to', 'm-22222222');
  assert.equal(r.code, 2);
  assert.equal(r.first, LOOP_TEXT(3, 2));
});

test('interrupt: a lead role sets it, another sender exits 2', () => {
  const dir = project();
  writeJournal(dir, [JOIN_EVENT]);
  assert.equal(run(dir, 'send', '--from', 'main', '--to', JOINED, '--type', 'request', '--text', 'now', '--interrupt').code, 0);
  assert.equal(rawLines(dir, JOINED)[0].interrupt, true);
  assert.equal(run(dir, 'send', '--from', 'architect', '--to', 'main', '--type', 'notice', '--text', 'now', '--interrupt').code, 0);
  assert.equal(rawLines(dir, 'main')[0].interrupt, true);
  for (const from of [JOINED, TASK_ADDRESS]) {
    const r = run(dir, 'send', '--from', from, '--to', 'architect', '--type', 'request', '--text', 'now', '--interrupt');
    assert.equal(r.code, 2);
    assert.equal(r.first, 'interrupt needs a lead role (main or architect)');
  }
  assert.equal(fs.existsSync(mailbox(dir, 'architect')), false);
});

test('a receipt sets the state, and the last receipt wins', () => {
  const dir = project();
  const id = JSON.parse(run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'a').first).id;
  assert.equal(receiptState(readMailbox(dir, 'architect'), id), null);
  appendReceipt(dir, 'architect', id, 'delivered', 'main');
  const lines = rawLines(dir, 'architect');
  const rc = lines.at(-1);
  assert.deepEqual(Object.keys(rc).sort(), ['by', 'ref', 'state', 'time', 'type', 'v']);
  assert.deepEqual([rc.v, rc.type, rc.ref, rc.state, rc.by], [1, 'receipt', id, 'delivered', 'main']);
  assert.equal(receiptState(readMailbox(dir, 'architect'), id), 'delivered');
  appendReceipt(dir, 'architect', id, 'failed', 'main');
  assert.equal(receiptState(readMailbox(dir, 'architect'), id), 'failed');
  const isBus = (text) => (e) => e instanceof BusError && e.exitCode === 2 && e.message === text;
  assert.throws(() => appendReceipt(dir, 'architect', 'm-00000000', 'read', 'main'), isBus('unknown message'));
  assert.throws(() => appendReceipt(dir, 'main', id, 'read', 'main'), isBus('unknown message'));
  assert.throws(() => appendReceipt(dir, 'architect', id, 'eaten', 'main'), isBus('bad state'));
  assert.throws(() => appendReceipt(dir, 'architect', id, 'read', '../x'), isBus('bad by'));
  assert.throws(() => appendReceipt(dir, 'architect', '../x', 'read', 'main'), isBus('bad ref'));
  assert.equal(rawLines(dir, 'architect').length, 3);
});

test('a message with a delivered or read receipt is not pending; an ack is never pending', () => {
  const dir = project();
  const send = (type, text) => JSON.parse(run(dir, 'send', '--from', 'main', '--to', 'architect', '--type', type, '--text', text).first).id;
  const m1 = send('request', 'one');
  send('ack', 'two');
  const m3 = send('notice', 'three');
  const m4 = send('question', 'four');
  const m5 = send('error', 'five');
  appendReceipt(dir, 'architect', m1, 'delivered', 'architect');
  appendReceipt(dir, 'architect', m3, 'read', 'architect');
  appendReceipt(dir, 'architect', m4, 'injected', 'architect');
  const ids = () => cli(dir, ['pending', '--address', 'architect']).lines.map((l) => JSON.parse(l).id);
  assert.deepEqual(ids(), [m4, m5]);
  assert.deepEqual(pendingOf(readMailbox(dir, 'architect')).map((m) => m.id), [m4, m5]);
  appendReceipt(dir, 'architect', m1, 'failed', 'architect');
  assert.deepEqual(ids(), [m1, m4, m5], 'the last receipt wins');
});

test('a mailbox file name that is not an address is never read', () => {
  const dir = project();
  writeJournal(dir, [JOIN_EVENT]);
  fs.mkdirSync(busDir(dir));
  const deep = { v: 1, id: 'm-11111111', from: 'main', to: 'architect', text: 'x', hops: 50 };
  for (const name of ['evil.jsonl', 'user.jsonl', 'Main.jsonl', 'architect.jsonl.bak']) {
    fs.writeFileSync(path.join(busDir(dir), name), `${JSON.stringify(deep)}\n`);
  }
  assert.equal(computeHops(dir, JOINED, 'm-11111111'), 1);
  const r = run(dir, 'send', '--from', JOINED, '--to', 'architect', '--type', 'reply', '--text', 'y', '--reply-to', 'm-11111111');
  assert.equal(r.code, 0, r.first);

  // A mailbox that is a link is not read.
  const outside = path.join(tempProject(), 'mail.jsonl');
  fs.writeFileSync(outside, `${JSON.stringify({ ...deep, id: 'm-22222222' })}\n`);
  fs.symlinkSync(outside, mailbox(dir, 'main'));
  assert.deepEqual(readMailbox(dir, 'main'), []);
  assert.equal(computeHops(dir, JOINED, 'm-22222222'), 1);
});

test('who and pending write nothing', () => {
  const dir = project();
  writeJournal(dir, [
    ...TASK_EVENTS,
    { type: 'dispatch', task: 'T3', attempt: 1, address: 'T3-rev-0001', role: 'rev', tool: 'claude', inSession: true, check: true, tier: 'master' },
    { type: 'dispatch', task: 'T3', attempt: 1, address: 'T3-rev-0002', role: 'rev', tool: 'claude', inSession: true, check: true, tier: 'master' },
    { type: 'dispatch', task: 'T3', attempt: 1, address: 'T3-qa-0003', role: 'qa', tool: 'claude', inSession: true, check: true, tier: 'master' },
    { type: 'unbind', address: 'T3-qa-0003' },
    JOIN_EVENT,
    { type: 'session', address: JOINED, session: 's-1', source: 'hook' },
  ]);
  const before = files(dir);
  const who = run(dir, 'who', '--address', TASK_ADDRESS);
  assert.equal(who.code, 0, who.first);
  assert.equal(who.lines.length, 1);
  const entry = JSON.parse(who.first);
  assert.equal(entry.address, TASK_ADDRESS);
  assert.equal(entry.state, 'bound');
  assert.equal(JSON.parse(run(dir, 'who', '--role', 'exe').first).address, TASK_ADDRESS);
  const many = run(dir, 'who', '--role', 'rev');
  assert.deepEqual([many.code, many.first], [1, 'more than one binding']);
  const none = run(dir, 'who', '--role', 'qa');
  assert.deepEqual([none.code, none.first], [1, 'no binding'], 'an unbound entry is not a binding');
  assert.deepEqual([run(dir, 'who', '--address', 'T3-qa-0003').code, run(dir, 'who', '--address', 'T3-qa-0003').first], [1, 'no binding']);
  const mainWho = run(dir, 'who', '--address', 'main');
  assert.deepEqual([mainWho.code, mainWho.first], [1, 'no binding']);
  assert.deepEqual([run(dir, 'who', '--address', '../x').code, run(dir, 'who', '--address', '../x').first], [2, 'bad address']);
  assert.deepEqual([run(dir, 'who', '--role', 'boss').code, run(dir, 'who', '--role', 'boss').first], [2, 'bad role']);
  assert.equal(run(dir, 'who').code, 2);
  assert.equal(run(dir, 'who', '--address', TASK_ADDRESS, '--role', 'exe').code, 2);
  const pend = run(dir, 'pending', '--address', 'architect');
  assert.deepEqual([pend.code, pend.lines], [0, []]);
  assert.deepEqual([run(dir, 'pending', '--session', 's-1').code, run(dir, 'pending', '--session', 's-1').lines], [0, []]);
  assert.equal(run(dir, 'pending').code, 2);
  assert.equal(run(dir, 'pending', '--address', 'main', '--session', 's-1').code, 2);
  assert.deepEqual([run(dir, 'pending', '--session', 'bad session').code, run(dir, 'pending', '--session', 'bad session').first], [2, 'bad session']);
  assert.deepEqual([run(dir, 'pending', '--address', '../x').code, run(dir, 'pending', '--address', '../x').first], [2, 'bad address']);
  assert.deepEqual(files(dir), before, 'who and pending write nothing');
  assert.equal(fs.existsSync(busDir(dir)), false, 'pending creates no bus folder');

  // pending --session prints the pending messages of each address of that session.
  run(dir, 'send', '--from', 'main', '--to', JOINED, '--type', 'request', '--text', 'for the session');
  const bySession = run(dir, 'pending', '--session', 's-1');
  assert.equal(bySession.code, 0);
  assert.deepEqual(bySession.lines.map((l) => JSON.parse(l).text), ['for the session']);
});

test('with no .guilda folder each command exits 1 with the R28 notice and creates no folder', () => {
  const dir = tempProject();
  const commands = [
    ['send', '--from', 'main', '--to', 'architect', '--type', 'request', '--text', 'x'],
    ['join', '--tool', 'codex', '--name', 'voice'],
    ['who', '--address', 'architect'],
    ['pending', '--address', 'architect'],
  ];
  for (const args of commands) {
    const r = cli(dir, args);
    assert.equal(r.code, 1, args[0]);
    assert.equal(r.first, SETUP_NOTICE);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a send to a joined address works before the fold', () => {
  const dir = project({ adapters: { codex: { enabled: true } } });
  const j = cli(dir, ['join', '--tool', 'codex', '--name', 'voice'], { GUILDA_TEST_RANDOM: '4592' });
  assert.equal(j.code, 0, j.out);
  assert.equal(readJournal(dir).events.length, 0, 'no sync yet');
  const r = cli(dir, ['send', '--from', 'main', '--to', JOINED, '--type', 'request', '--text', 'hi']);
  assert.equal(r.code, 0, r.out);
  assert.equal(rawLines(dir, JOINED).length, 1);
  // The random source works only in a test run.
  const prod = cli(dir, ['join', '--tool', 'codex', '--name', 'other'], { NODE_ENV: 'production', GUILDA_TEST_RANDOM: '4592' });
  assert.equal(prod.code, 0, prod.out);
  assert.match(prod.first, /^\{"address":"ext-codex-other-[0-9a-f]{4}"\}$/);
});
