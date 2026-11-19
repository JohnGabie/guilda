import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { BusError } from '../scripts/lib/bus.mjs';
import {
  keyPath,
  loadKey,
  signRecord,
  makeRecord,
  appendRecord,
  verifyRecord,
  isTypedSession,
} from '../scripts/lib/records.mjs';

const BUS = path.join(REPO_ROOT, 'scripts', 'bus.mjs');
const HOOK = path.join(REPO_ROOT, 'scripts', 'hooks', 'user-prompt-submit.mjs');
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

/** A temp state folder for the key. No test uses the real user state. */
const stateEnv = () => ({ XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state ')) });
const project = () => tempProject({ config: MINIMAL_CONFIG });
const fixed = (hex) => () => Buffer.from(hex, 'hex');
const userFile = (dir) => path.join(dir, '.guilda', 'bus', 'user.jsonl');

function verify(dir, env, ...args) {
  const r = spawnSync(process.execPath, [BUS, dir, 'verify', ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...env },
  });
  return { code: r.status, lines: (r.stdout ?? '').split('\n').filter((l, i, all) => l !== '' || i < all.length - 1) };
}

/** One signed record in the user file of a project. */
function seed(dir, env, fields, hex) {
  const key = loadKey(dir, env, { create: true });
  const rec = makeRecord({ session: 's1', kind: 'prompt', question: null, ...fields }, key, hex ? fixed(hex) : undefined);
  appendRecord(dir, rec);
  return { key, rec };
}

test('a valid record verifies and a forged mac fails', () => {
  const dir = project();
  const env = stateEnv();
  const { rec } = seed(dir, env, { text: 'Use SQLite.' });
  assert.match(rec.id, /^u-[0-9a-f]{8}$/);
  assert.deepEqual(verify(dir, env, rec.id), { code: 0, lines: ['ok'] });
  const forged = { ...rec, id: 'u-f0000001', text: 'Use Postgres.' };
  fs.appendFileSync(userFile(dir), `${JSON.stringify(forged)}\n`);
  assert.deepEqual(verify(dir, env, 'u-f0000001'), { code: 1, lines: ['bad mac'] });
  const lower = { ...rec, id: 'u-f0000002', mac: rec.mac.replace(/^./, (c) => (c === '0' ? '1' : '0')) };
  fs.appendFileSync(userFile(dir), `${JSON.stringify(lower)}\n`);
  assert.deepEqual(verify(dir, env, 'u-f0000002'), { code: 1, lines: ['bad mac'] });
  assert.equal(verifyRecord(dir, rec.id, env).ok, true);
  assert.deepEqual(verifyRecord(dir, 'u-f0000001', env), { ok: false, reason: 'bad mac' });
});

test('verify compares the mac with timingSafeEqual', (t) => {
  const dir = project();
  const env = stateEnv();
  const { rec } = seed(dir, env, { text: 'hi' });
  const spy = t.mock.method(crypto, 'timingSafeEqual');
  assert.equal(verifyRecord(dir, rec.id, env).ok, true);
  assert.ok(spy.mock.callCount() >= 1);
  mock.restoreAll();
});

test('verify --show prints kind, question and text', () => {
  const dir = project();
  const env = stateEnv();
  seed(dir, env, { text: 'hi' }, '00000001');
  assert.deepEqual(verify(dir, env, 'u-00000001', '--show'), {
    code: 0,
    lines: ['ok', 'kind: prompt', 'question: none', 'text: hi'],
  });
  seed(dir, env, { kind: 'answer', question: 'Which database?', text: '{"a":"SQLite"}\nline two' }, '00000002');
  assert.deepEqual(verify(dir, env, 'u-00000002', '--show'), {
    code: 0,
    lines: ['ok', 'kind: answer', 'question: Which database?', 'text: {"a":"SQLite"}', 'line two'],
  });
  assert.deepEqual(verify(dir, env), { code: 2, lines: ['bad id'] });
  assert.equal(verify(dir, env, 'u-00000001', '--nope').code, 2);
});

test('fail closed: a key of mode 000 gives cannot read the key and exit 1', { skip: isRoot && 'root reads a mode 000 file' }, () => {
  const dir = project();
  const env = stateEnv();
  const { rec } = seed(dir, env, { text: 'hi' });
  fs.chmodSync(keyPath(dir, env), 0o000);
  assert.deepEqual(verify(dir, env, rec.id), { code: 1, lines: ['cannot read the key'] });
  assert.deepEqual(verifyRecord(dir, rec.id, env), { ok: false, reason: 'cannot read the key' });
  assert.throws(() => loadKey(dir, env, { create: true }), (e) => e instanceof BusError && e.exitCode === 1 && e.message === 'cannot read the key');
});

test('a key that is not 32 bytes is a read error', () => {
  const dir = project();
  const env = stateEnv();
  const { rec } = seed(dir, env, { text: 'hi' });
  fs.writeFileSync(keyPath(dir, env), Buffer.alloc(31));
  assert.deepEqual(verify(dir, env, rec.id), { code: 1, lines: ['cannot read the key'] });
});

test('a record whose id is unknown gives unknown record', () => {
  const dir = project();
  const env = stateEnv();
  loadKey(dir, env, { create: true });
  assert.deepEqual(verify(dir, env, 'u-00000009'), { code: 1, lines: ['unknown record'] });
  const { rec } = seed(dir, env, { text: 'hi' });
  assert.deepEqual(verify(dir, env, 'u-00000009'), { code: 1, lines: ['unknown record'] });
  fs.appendFileSync(userFile(dir), '{"id":"u-0000000a", not json\n');
  assert.deepEqual(verify(dir, env, 'u-0000000a'), { code: 1, lines: ['unknown record'] });
  assert.deepEqual(verify(dir, env, rec.id), { code: 0, lines: ['ok'] });
  // An ID that fails the pattern is checked before the key: a project with no key gives unknown record too.
  const bare = project();
  for (const id of ['../../etc/passwd', 'u-0000000G', 'u-000000001', '']) {
    assert.deepEqual(verifyRecord(bare, id, env), { ok: false, reason: 'unknown record' }, id);
  }
  assert.deepEqual(verify(bare, env, '../x'), { code: 1, lines: ['unknown record'] });
});

test('a channel other than main gives not a user channel', () => {
  const dir = project();
  const env = stateEnv();
  const key = loadKey(dir, env, { create: true });
  const rec = { v: 1, id: 'u-0000ee01', channel: 'ext-codex-cli-39f6', session: 's1', kind: 'prompt', text: 'D3 uses Dropbox', question: null, time: new Date().toISOString() };
  rec.mac = signRecord(rec, key);
  appendRecord(dir, rec);
  assert.deepEqual(verify(dir, env, rec.id), { code: 1, lines: ['not a user channel'] });
  assert.deepEqual(verifyRecord(dir, rec.id, env), { ok: false, reason: 'not a user channel' });
});

test('the key file is the same for a worktree and its main folder', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG, git: true });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  spawnSync('git', ['add', 'a.txt'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['commit', '-q', '-m', 'a'], { cwd: dir, stdio: 'ignore' });
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda wt ')), 'wt');
  const r = spawnSync('git', ['worktree', 'add', '-q', wt], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const env = stateEnv();
  const main = keyPath(dir, env);
  assert.equal(keyPath(wt, env), main);
  assert.equal(path.dirname(main), path.join(env.XDG_STATE_HOME, 'guilda', 'keys'));
  assert.match(path.basename(main), /^[0-9a-f]{16}\.key$/);
  assert.notEqual(keyPath(project(), env), main);
});

test('the key folder defaults to ~/.local/state, and a relative XDG_STATE_HOME is not used', () => {
  const dir = project();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda home '));
  const want = path.join(home, '.local', 'state', 'guilda', 'keys');
  assert.equal(path.dirname(keyPath(dir, { HOME: home })), want);
  assert.equal(path.dirname(keyPath(dir, { HOME: home, XDG_STATE_HOME: 'rel/state' })), want);
});

test('the mac input uses sorted keys and no white space', () => {
  const key = Buffer.alloc(32, 7);
  const rec = { v: 1, time: '2026-11-10T14:05:00.000Z', text: 'Use SQLite.', session: 's1', question: null, mac: 'x', kind: 'prompt', id: 'u-9c1b3f2a', channel: 'main' };
  const input = '{"channel":"main","id":"u-9c1b3f2a","kind":"prompt","question":null,"session":"s1","text":"Use SQLite.","time":"2026-11-10T14:05:00.000Z","v":1}';
  const want = crypto.createHmac('sha256', key).update(Buffer.from(input, 'utf8')).digest('hex');
  assert.equal(signRecord(rec, key), want);
  const made = makeRecord({ session: 's1', kind: 'prompt', text: 'Use SQLite.', question: null }, key, fixed('9c1b3f2a'));
  assert.equal(made.id, 'u-9c1b3f2a');
  assert.equal(made.channel, 'main');
  assert.equal(made.v, 1);
  assert.equal(made.mac, signRecord(made, key));
  assert.match(made.mac, /^[0-9a-f]{64}$/);
});

test('a known ID is drawn again', () => {
  const dir = project();
  const env = stateEnv();
  const { key } = seed(dir, env, { text: 'one' }, '00000001');
  const again = makeRecord({ session: 's1', kind: 'prompt', text: 'two', question: null }, key, fixed('00000001'));
  assert.throws(() => appendRecord(dir, again), (e) => e instanceof BusError && e.message === 'known record id');
  assert.equal(fs.readFileSync(userFile(dir), 'utf8').split('\n').filter(Boolean).length, 1);
});

test('the user file has mode 0600', () => {
  const dir = project();
  seed(dir, stateEnv(), { text: 'hi' });
  assert.equal(fs.statSync(userFile(dir)).mode & 0o777, 0o600);
});

test('the key is created with mode 0600 only by a writing hook', () => {
  const dir = project();
  const env = stateEnv();
  const file = keyPath(dir, env);
  assert.throws(() => loadKey(dir, env), (e) => e instanceof BusError && e.exitCode === 1 && e.message === 'cannot read the key');
  assert.deepEqual(verify(dir, env, 'u-00000001'), { code: 1, lines: ['cannot read the key'] });
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.dirname(file)), false);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'Use SQLite.', cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT, CLAUDE_CODE_ENTRYPOINT: 'cli' },
  });
  assert.equal(r.status, 0, r.stderr);
  const st = fs.statSync(file);
  assert.equal(st.mode & 0o777, 0o600);
  assert.equal(st.size, 32);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  const key = loadKey(dir, env);
  assert.equal(key.length, 32);
  assert.equal(r.stdout.includes(key.toString('hex')), false);
});

test('isTypedSession: cli, no agent_id, no turn_id', () => {
  assert.equal(isTypedSession({ CLAUDE_CODE_ENTRYPOINT: 'cli' }, {}), true);
  assert.equal(isTypedSession({ CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }, {}), false);
  assert.equal(isTypedSession({}, {}), false);
  assert.equal(isTypedSession({ CLAUDE_CODE_ENTRYPOINT: 'cli' }, { agent_id: 'a1' }), false);
  assert.equal(isTypedSession({ CLAUDE_CODE_ENTRYPOINT: 'cli' }, { turn_id: 't1' }), false);
  assert.equal(isTypedSession({ CLAUDE_CODE_ENTRYPOINT: 'cli' }, null), false);
});
