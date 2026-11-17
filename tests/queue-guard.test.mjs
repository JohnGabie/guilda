import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queueFileWrites, queueScriptCall } from '../scripts/lib/queue-guard.mjs';

const project = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda queue-guard '));
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  return dir;
};

test('queueFileWrites finds each of the six forms', () => {
  const dir = project();
  const forms = [
    ['echo x > .guilda/queue/journal.jsonl', ['journal.jsonl']],
    ['echo x | tee -a .guilda/queue/state.json', ['state.json']],
    ['cp other.json .guilda/queue/writer.json', ['writer.json']],
    ['mv other .guilda/queue/lock', ['lock']],
    ['touch .guilda/queue/lock', ['lock']],
    ['rm -f .guilda/queue/state.json', ['state.json']],
  ];
  for (const [command, expected] of forms) assert.deepEqual(queueFileWrites(command, dir, dir), expected, command);
  for (const command of ['cat .guilda/queue/journal.jsonl', 'echo x > .guilda/queue/signals/s.json', 'rm -rf build']) {
    assert.deepEqual(queueFileWrites(command, dir, dir), [], command);
  }
});

test('queueFileWrites fails closed on quotes, nested shells, globs and an open quote', () => {
  const dir = project();
  for (const command of [
    'rm ".guilda/queue/lock"',
    "sh -c 'rm .guilda/queue/lock'",
    'echo "$(rm .guilda/queue/lock)"',
    'rm .guilda/q*/lock',
    'echo "open > .guilda/queue/lock',
    'mv .guilda/queue/lock elsewhere',
    'rm -rf .guilda',
    'cd .guilda && rm queue/lock',
    'echo x # > .guilda/queue/lock',
  ]) {
    assert.ok(queueFileWrites(command, dir, dir).includes('lock'), command);
  }
});

test('queueScriptCall reads a quoted --session', () => {
  assert.deepEqual(queueScriptCall('node scripts/queue.mjs . sync --session "s1"'), { session: 's1', sessions: ['s1'] });
  assert.deepEqual(queueScriptCall("node ./scripts/queue.mjs . sync --session 's1'"), { session: 's1', sessions: ['s1'] });
  assert.deepEqual(queueScriptCall('node scripts/queue.mjs . sync'), { session: null, sessions: [null] });
  // The value of another flag is not a --session.
  assert.equal(queueScriptCall('node scripts/queue.mjs . add T1 --title --session s1').session, null);
});

test('a call of scripts/signal.mjs is not a queue call', () => {
  assert.equal(queueScriptCall('node scripts/signal.mjs . started T1 1'), null);
  assert.equal(queueScriptCall('node "${CLAUDE_PLUGIN_ROOT}/scripts/signal.mjs" . started T1 1'), null);
  assert.equal(queueScriptCall('cat scripts/queue.mjs'), null);
  // A script path from a variable can be the queue script, so it counts.
  assert.notEqual(queueScriptCall('node scripts/$Q.mjs . sync'), null);
  assert.notEqual(queueScriptCall('node "${CLAUDE_PLUGIN_ROOT}/scripts/queue.mjs" . sync'), null);
});

test('a script named queue.mjs counts in any folder, and when it runs with no node', () => {
  for (const command of ['cd scripts && node queue.mjs . sync', 'node ./queue.mjs . sync', './scripts/queue.mjs . sync', 'scripts/queue.mjs . sync --session s1', '"$NODE" scripts/queue.mjs . sync']) {
    assert.notEqual(queueScriptCall(command), null, command);
  }
  assert.equal(queueScriptCall('./scripts/queue.mjs . sync --session s1').session, 's1');
  assert.equal(queueScriptCall('node --test tests/queue.test.mjs'), null);
});
