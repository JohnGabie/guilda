import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { readBindings, readJournal, fold, writeSignal, GENERATOR } from '../scripts/lib/queue.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'queue');
const T0 = Date.parse('2026-11-17T10:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const ADDRESS_OF = /address (\S+)$/;
const JOINED = 'ext-codex-voice-4592';

function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const f of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
  return dir;
}

function q(dir, min, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args, '--now', at(min)], { encoding: 'utf8' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out);
  return out;
}

const qdir = (dir) => path.join(dir, '.guilda', 'queue');
const busDir = (dir) => path.join(dir, '.guilda', 'bus', 'signals');
const stateFile = (dir) => JSON.parse(fs.readFileSync(path.join(qdir(dir), 'state.json'), 'utf8'));

/** Write a journal of these events, with seq and t. */
function writeJournal(dir, evs) {
  fs.mkdirSync(qdir(dir), { recursive: true });
  const lines = evs.map((e, i) => JSON.stringify({ seq: i + 1, t: at(i), ...e })).join('\n');
  fs.writeFileSync(path.join(qdir(dir), 'journal.jsonl'), `${lines}\n`);
}

function busSignal(dir, name, body) {
  fs.mkdirSync(busDir(dir), { recursive: true });
  fs.writeFileSync(path.join(busDir(dir), name), `${JSON.stringify(body)}\n`);
}

/** Every path below dir with its size, so a new or changed file shows. */
function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(e.isFile() ? `${path.relative(dir, p)} ${fs.readFileSync(p, 'utf8')}` : path.relative(dir, p));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

const TASK_EVENTS = [
  { type: 'task', task: 'T3', work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
  { type: 'dispatch', task: 'T3', attempt: 1, address: 'T3-exe-7f2a', role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master' },
];

test('readBindings gives the dispatch, the rebind and the pending join signal, and writes nothing', () => {
  const dir = project();
  q(dir, 0, 'init', 'check.plan.md', '--slots', '1');
  q(dir, 0, 'sync');
  const address = q(dir, 0, 'dispatch', 'T3', '--role', 'exe', '--tool', 'claude', '--tier', 'master').trim().split('\n')[0].match(ADDRESS_OF)[1];
  writeSignal(dir, { agentId: 'a1' }, 'dispatch.json', {
    address, task: 'T3', attempt: 1, agentType: 'guilda:executor', parentSession: 's-1', parentAgent: null, at: at(0.1),
  });
  q(dir, 1, 'sync');
  writeSignal(dir, { agentId: 'a2' }, 'dispatch.json', {
    address, task: 'T3', attempt: 1, agentType: 'guilda:executor', parentSession: 's-2', parentAgent: 'a0', at: at(1.1),
  });
  q(dir, 2, 'sync');
  const agents = readJournal(dir).events.filter((e) => e.type === 'agent' && e.address === address);
  assert.deepEqual(agents.map((e) => e.agentId), ['a1', 'a2'], 'the journal has the bind and the rebind');
  busSignal(dir, `join-${JOINED}.json`, { address: JOINED, tool: 'codex', name: 'voice', at: at(2.5) });

  const before = tree(dir);
  const b = readBindings(dir);
  assert.deepEqual(tree(dir), before, 'readBindings writes nothing');
  assert.deepEqual(b[address], {
    address,
    tool: 'claude',
    inSession: true,
    agentId: 'a2',
    agentType: 'guilda:executor',
    sessions: [],
    parentSession: 's-2',
    parentAgent: 'a0',
    name: null,
    role: 'exe',
    task: 'T3',
    state: 'bound',
  });
  assert.equal(b[JOINED].name, 'voice');
  assert.equal(b[JOINED].state, 'bound');

  q(dir, 3, 'sync');
  const joins = readJournal(dir).events.filter((e) => e.type === 'join');
  assert.equal(joins.length, 1);
  assert.deepEqual(stateFile(dir).bindings, b, 'readBindings equals the bindings key after sync');
  assert.deepEqual(readBindings(dir), b);
  assert.equal(fs.existsSync(path.join(qdir(dir), 'bindings.json')), false);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'bindings.json')), false);
});

test('the entry of a joined agent has no task, no role and no agent ID', () => {
  const dir = project();
  writeJournal(dir, [
    { type: 'join', address: JOINED, tool: 'codex', name: 'voice' },
    { type: 'join', address: JOINED, tool: 'other', name: 'again' },
  ]);
  assert.deepEqual(readBindings(dir), {
    [JOINED]: {
      address: JOINED,
      tool: 'codex',
      inSession: false,
      agentId: null,
      agentType: null,
      sessions: [],
      parentSession: null,
      parentAgent: null,
      name: 'voice',
      role: null,
      task: null,
      state: 'bound',
    },
  });
});

test('the architect address binds with no dispatch event', () => {
  const dir = project();
  writeJournal(dir, [
    { type: 'agent', address: 'architect', task: null, attempt: null, agentId: 'arc1', agentType: 'guilda:architect', parentSession: 's-1', parentAgent: null },
    { type: 'agent', address: 'T9-exe-0000', task: 'T9', attempt: 1, agentId: 'x1' },
  ]);
  const b = readBindings(dir);
  assert.deepEqual(Object.keys(b), ['architect'], 'an agent event for an address with no entry changes nothing');
  assert.deepEqual(b.architect, {
    address: 'architect',
    tool: 'claude',
    inSession: true,
    agentId: 'arc1',
    agentType: 'guilda:architect',
    sessions: [],
    parentSession: 's-1',
    parentAgent: null,
    name: null,
    role: 'arc',
    task: null,
    state: 'bound',
  });

  // A pending dispatch.json for architect, with no sync yet, is in the table too.
  const fresh = project();
  writeJournal(fresh, TASK_EVENTS);
  writeSignal(fresh, { agentId: 'arc2' }, 'dispatch.json', {
    address: 'architect', task: null, attempt: null, agentType: 'guilda:architect', parentSession: 's-9', parentAgent: null, at: at(1),
  });
  const before = tree(fresh);
  const f = readBindings(fresh);
  assert.deepEqual(tree(fresh), before);
  assert.equal(f.architect.agentId, 'arc2');
  assert.equal(f.architect.task, null);
  assert.equal(f['T3-exe-7f2a'].agentId, null);
});

test('sessions keep the journal order and no duplicate', () => {
  const dir = project();
  writeJournal(dir, [
    { type: 'session', address: JOINED, session: 's0', source: 'hook' },
    { type: 'join', address: JOINED, tool: 'codex', name: 'voice' },
    { type: 'session', address: JOINED, session: 's2', source: 'hook' },
    { type: 'session', address: JOINED, session: 's1', source: 'hook' },
    { type: 'session', address: JOINED, session: 's2', source: 'run' },
    { type: 'session', address: 'ext-codex-other-0000', session: 's3', source: 'hook' },
  ]);
  const b = readBindings(dir);
  assert.deepEqual(Object.keys(b), [JOINED]);
  assert.deepEqual(b[JOINED].sessions, ['s2', 's1']);
});

test('an unbind event marks the address unbound', () => {
  const dir = project();
  writeJournal(dir, [...TASK_EVENTS, { type: 'unbind', address: 'T3-exe-7f2a' }]);
  assert.equal(readBindings(dir)['T3-exe-7f2a'].state, 'unbound');
});

test('a journal with an unknown event type folds as before', () => {
  const evs = [...TASK_EVENTS, { type: 'join', address: JOINED, tool: 'codex', name: 'voice' }].map((e, i) => ({ seq: i + 1, t: at(i), ...e }));
  const odd = [...evs.slice(0, 2), { type: 'future-kind', address: JOINED, task: 'T3', state: 'unbound' }, { type: 42 }, evs[2]];
  assert.deepEqual(fold(odd, { now: at(5) }), fold(evs, { now: at(5) }));
  const dir = project();
  writeJournal(dir, [...TASK_EVENTS, { type: 'future-kind', address: 'T3-exe-7f2a' }]);
  assert.equal(readBindings(dir)['T3-exe-7f2a'].state, 'bound');
});

test('readBindings with no queue folder returns an empty table and creates nothing', () => {
  const plain = tempProject();
  assert.deepEqual(readBindings(plain), {});
  assert.deepEqual(fs.readdirSync(plain), []);
  const dir = project();
  const before = tree(dir);
  assert.deepEqual(readBindings(dir), {});
  assert.deepEqual(tree(dir), before);
  assert.deepEqual(readBindings(path.join(plain, 'missing')), {});
  assert.equal(fs.existsSync(path.join(plain, 'missing')), false);
});

test('readBindings reads past a state.json with no bindings key', () => {
  const dir = project();
  writeJournal(dir, TASK_EVENTS);
  fs.writeFileSync(
    path.join(qdir(dir), 'state.json'),
    JSON.stringify({ generator: GENERATOR, journalSeq: 99, slots: 1, works: {}, tasks: {} }),
  );
  assert.equal(readBindings(dir)['T3-exe-7f2a'].task, 'T3');
  // A state.json with a bindings key is not read either: the journal is the owner.
  fs.writeFileSync(
    path.join(qdir(dir), 'state.json'),
    JSON.stringify({ generator: GENERATOR, journalSeq: 99, slots: 1, works: {}, tasks: {}, bindings: { x: 1 } }),
  );
  assert.deepEqual(Object.keys(readBindings(dir)), ['T3-exe-7f2a']);
});

test('a join signal with a bad name, a file name that differs from its fields, or a link is skipped', () => {
  const dir = project();
  q(dir, 0, 'init', 'one.plan.md', '--slots', '1');
  const outside = path.join(tempProject(), 'join.json');
  fs.writeFileSync(outside, JSON.stringify({ address: 'ext-codex-link-1234', tool: 'codex', name: 'link', at: at(0) }));
  busSignal(dir, 'join-ext-codex-vo_ice-1234.json', { address: 'ext-codex-vo_ice-1234', tool: 'codex', name: 'vo_ice', at: at(0) });
  busSignal(dir, 'join-ext-codex-voice-1234.json', { address: 'ext-codex-voice-9999', tool: 'codex', name: 'voice', at: at(0) });
  busSignal(dir, 'join-ext-codex-voice-5678.json', { address: 'ext-codex-voice-5678', tool: 'claude', name: 'voice', at: at(0) });
  busSignal(dir, 'join-ext-Codex-voice-1234.json', { address: 'ext-Codex-voice-1234', tool: 'Codex', name: 'voice', at: at(0) });
  fs.symlinkSync(outside, path.join(busDir(dir), 'join-ext-codex-link-1234.json'));
  busSignal(dir, `session-${JOINED}-bad session.json`, { address: JOINED, session: 'bad session', source: 'hook', at: at(0) });
  busSignal(dir, `session-${JOINED}-s1.json`, { address: JOINED, session: 's2', source: 'hook', at: at(0) });

  assert.deepEqual(readBindings(dir), {});
  const out = q(dir, 1, 'sync');
  assert.match(out, /queue: skipped 7 bad signal files/);
  const evs = readJournal(dir).events;
  assert.equal(evs.filter((e) => e.type === 'join' || e.type === 'session').length, 0);
  assert.deepEqual(stateFile(dir).bindings, {});
});
