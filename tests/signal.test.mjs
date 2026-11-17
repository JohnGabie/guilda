import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { readJournal } from '../scripts/lib/queue.mjs';

const SIGNAL = path.join(REPO_ROOT, 'scripts', 'signal.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const STREAM = path.join(REPO_ROOT, 'tests', 'fixtures', 'signal', 'stream.mjs');
const NODE = process.execPath;

const sig = (dir, ...args) => {
  const r = spawnSync(NODE, [SIGNAL, dir, ...args], { encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '' };
};
const queue = (dir, ...args) => {
  const r = spawnSync(NODE, [QUEUE, dir, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
  return r.stdout;
};

/** A project with T5 dispatched in attempt 1, an external run. Returns { dir, address }. */
function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  queue(dir, 'add', 'T5', '--title', 'external');
  queue(dir, 'sync');
  const out = queue(dir, 'dispatch', 'T5', '--role', 'exe', '--tool', 'codex', '--tier', 'journeyman', '--external');
  return { dir, address: out.trim().split('\n')[0].match(/address (\S+)$/)[1] };
}

const sigDir = (dir) => path.join(dir, '.guilda', 'queue', 'signals', 'T5', '1');
const readSig = (dir, kind) => JSON.parse(fs.readFileSync(path.join(sigDir(dir), kind), 'utf8'));
const logLines = (dir, address) =>
  fs
    .readFileSync(path.join(dir, '.guilda', 'logs', `${address}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

test('the signal commands and the usage of an external run', () => {
  const { dir } = project();
  const usageFile = path.join(dir, 'usage.json');
  fs.writeFileSync(usageFile, JSON.stringify([{ model: 'm1', input: 100, cacheRead: 0, cacheCreation: 0, output: 40 }]));

  assert.deepEqual(sig(dir, 'started', 'T5', '1').code, 0);
  assert.match(sig(dir, 'started', 'T5', '1').out, /^signal: started exists/);
  assert.equal(sig(dir, 'started', 'T5', '1').code, 1);
  const hb = sig(dir, 'heartbeat', 'T5', '1', '--tokens', '60');
  assert.equal(hb.code, 0);
  assert.match(hb.stdout, /^signal: heartbeat\n/);
  assert.equal(readSig(dir, 'heartbeat').tokens, 60);
  const done = sig(dir, 'done', 'T5', '1', '--usage', usageFile);
  assert.equal(done.code, 0);
  assert.match(done.stdout, /^signal: done\n/);
  const again = sig(dir, 'done', 'T5', '1');
  assert.equal(again.code, 1);
  assert.match(again.out, /^signal: done exists/);
  const bad = sig(dir, 'failed', 'T5', '1', '--reason', 'bad');
  assert.equal(bad.code, 1);

  queue(dir, 'sync');
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'queue', 'state.json'), 'utf8'));
  assert.equal(state.tasks.T5.state, 'review');
  const ev = readJournal(dir).events.find((e) => e.type === 'signal' && e.kind === 'done');
  assert.equal(ev.usage[0].input, 100);
  assert.equal(ev.usage[0].output, 40);
});

test('run writes started, heartbeat and failed, and exits with the code of the command', () => {
  const { dir } = project();
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, '-e', 'console.log(1); process.exit(3)');
  assert.equal(r.code, 3);
  assert.match(r.stdout, /^1\n/);
  for (const k of ['started', 'heartbeat', 'failed']) assert.ok(fs.existsSync(path.join(sigDir(dir), k)), k);
  assert.equal(fs.existsSync(path.join(sigDir(dir), 'done')), false);
  const failed = readSig(dir, 'failed');
  assert.equal(failed.reason, 'error');
  assert.equal(failed.usage, null);
  // The journal is not written by the wrapper.
  assert.equal(readJournal(dir).events.some((e) => e.type === 'signal'), false);
});

test('run with exit 0 writes done, and the usage comes from result.modelUsage', () => {
  const { dir, address } = project();
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, STREAM, '0', 'ok');
  assert.equal(r.code, 0);
  const done = readSig(dir, 'done');
  assert.equal(done.reason, 'finished');
  assert.deepEqual(done.usage, [
    { model: 'fake-model-a', input: 12, cacheRead: 6, cacheCreation: 3, output: 30 },
    { model: 'fake-model-b', input: 1, cacheRead: 0, cacheCreation: 0, output: 2 },
  ]);
  const lines = logLines(dir, address);
  assert.ok(lines.some((l) => l.kind === 'tokens'));
  assert.deepEqual(lines[0].kind, 'state');
  assert.equal(lines[0].text, 'started');
  assert.equal(lines.at(-1).text, 'done');
});

test('run --timeout ends the command and writes failed with reason timeout', () => {
  const { dir } = project();
  const t0 = Date.now();
  const r = sig(dir, 'run', 'T5', '1', '--timeout', '1', '--', NODE, '-e', 'setTimeout(()=>{}, 60000)');
  assert.ok(Date.now() - t0 < 20000);
  assert.notEqual(r.code, 0);
  assert.equal(readSig(dir, 'failed').reason, 'timeout');
});

test('run writes the log of the address, and cuts a message at 500 characters', () => {
  const { dir, address } = project();
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, '-e', "console.log('x'.repeat(900)); console.log('short')");
  assert.equal(r.code, 0);
  const lines = logLines(dir, address);
  for (const l of lines) assert.deepEqual(Object.keys(l).sort(), ['kind', 't', 'text']);
  const msgs = lines.filter((l) => l.kind === 'message');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].text.length, 500);
  assert.equal(msgs[1].text, 'short');
  assert.equal(lines[0].text, 'started');
  assert.equal(lines.at(-1).text, 'done');
  // The log holds neither the command text nor an environment value.
  const raw = fs.readFileSync(path.join(dir, '.guilda', 'logs', `${address}.jsonl`), 'utf8');
  assert.equal(raw.includes('process.exit'), false);
  assert.equal(raw.includes(dir), false);
  // An attempt with no address in the state writes no log.
  const lone = tempProject({ config: MINIMAL_CONFIG });
  const r2 = sig(lone, 'run', 'T5', '1', '--', NODE, '-e', 'console.log(1)');
  assert.equal(r2.code, 0);
  assert.equal(fs.existsSync(path.join(lone, '.guilda', 'logs')), false);
});

test('run writes no log into a log file that is a hard link, and still runs and signals', () => {
  const { dir, address } = project();
  const other = path.join(dir, 'other.txt');
  fs.writeFileSync(other, 'keep');
  fs.mkdirSync(path.join(dir, '.guilda', 'logs'));
  fs.linkSync(other, path.join(dir, '.guilda', 'logs', `${address}.jsonl`));
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, '-e', "console.log('secret line')");
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(path.join(sigDir(dir), 'done')), true);
  assert.equal(fs.readFileSync(other, 'utf8'), 'keep');
});

test('an ID with a slash exits 1 and writes nothing', () => {
  const { dir } = project();
  for (const args of [['started', 'T5/../x', '1'], ['started', 'T5', '1/2'], ['run', 'a/b', '1', '--', NODE, '-e', '0']]) {
    const r = sig(dir, ...args);
    assert.equal(r.code, 1);
    assert.match(r.out, /invalid ID/);
  }
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'queue', 'signals')), false);
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'logs')), false);
});

test('no .guilda folder: refused and no folder', () => {
  const dir = tempProject();
  const r = sig(dir, 'started', 'T5', '1');
  assert.equal(r.code, 1);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  const marker = path.join(dir, 'ran');
  const r2 = sig(dir, 'run', 'T5', '1', '--', NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '')`);
  assert.equal(r2.code, 1);
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
  assert.equal(fs.existsSync(marker), false);
});

test('a rate_limit_event ends the run with reason limit', () => {
  const { dir } = project();
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, STREAM, '1', 'limit');
  assert.equal(r.code, 1);
  const failed = readSig(dir, 'failed');
  assert.equal(failed.reason, 'limit');
  assert.equal(failed.usage[0].model, 'fake-model-a');
  assert.equal(failed.usage[0].input, 10);
  assert.equal(failed.usage[0].output, 7);
});

test('exit 0 with a rejected limit status ends the run with done', () => {
  const { dir } = project();
  const r = sig(dir, 'run', 'T5', '1', '--', NODE, STREAM, '0', 'limit');
  assert.equal(r.code, 0);
  const done = readSig(dir, 'done');
  assert.equal(done.reason, 'finished');
  assert.equal(done.usage[0].model, 'fake-model-a');
  assert.equal(fs.readdirSync(sigDir(dir)).some((f) => f.startsWith('failed')), false);
});
