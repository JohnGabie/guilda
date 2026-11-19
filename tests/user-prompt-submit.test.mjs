import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { MAX_TEXT_CHARS } from '../scripts/lib/bus.mjs';
import { keyPath, verifyRecord } from '../scripts/lib/records.mjs';

const HOOK = path.join(REPO_ROOT, 'scripts', 'hooks', 'user-prompt-submit.mjs');
const BUS = path.join(REPO_ROOT, 'scripts', 'bus.mjs');
const CONTEXT = /^guilda user record: (u-[0-9a-f]{8})$/;

const stateEnv = () => ({ XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state ')) });
const userFile = (dir) => path.join(dir, '.guilda', 'bus', 'user.jsonl');
const userLines = (dir) =>
  fs.existsSync(userFile(dir)) ? fs.readFileSync(userFile(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

/** Run the hook with exactly this entry point value ('none': no value) and no GUILDA_ADDRESS. */
function run(dir, input, { entry = 'cli', env } = {}) {
  const e = { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT };
  delete e.GUILDA_ADDRESS;
  if (entry === 'none') delete e.CLAUDE_CODE_ENTRYPOINT;
  else e.CLAUDE_CODE_ENTRYPOINT = entry;
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', cwd: dir, env: e });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const prompt = (dir, extra = {}) => ({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'Use SQLite.', cwd: dir, ...extra });

function assertNothing(dir, env, r) {
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(userLines(dir), []);
  assert.equal(fs.existsSync(keyPath(dir, env)), false);
}

test('an interactive prompt writes a record and adds the context line', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  const r = run(dir, prompt(dir), { env });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'UserPromptSubmit');
  const id = out.additionalContext.match(CONTEXT)[1];
  const lines = userLines(dir);
  assert.equal(lines.length, 1);
  assert.deepEqual(
    { id: lines[0].id, v: lines[0].v, channel: lines[0].channel, session: lines[0].session, kind: lines[0].kind, text: lines[0].text, question: lines[0].question },
    { id, v: 1, channel: 'main', session: 's1', kind: 'prompt', text: 'Use SQLite.', question: null },
  );
  assert.equal(verifyRecord(dir, id, env).ok, true);
  const v = spawnSync(process.execPath, [BUS, dir, 'verify', id], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(v.status, 0);
  assert.equal(v.stdout, 'ok\n');
});

test('print mode writes nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  assertNothing(dir, env, run(dir, prompt(dir), { entry: 'sdk-cli', env }));
  assertNothing(dir, env, run(dir, prompt(dir), { entry: 'none', env }));
  assertNothing(dir, env, run(dir, prompt(dir), { entry: 'CLI', env }));
});

test('a Codex form input writes nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  assertNothing(dir, env, run(dir, prompt(dir, { turn_id: 't-1', model: 'gpt' }), { env }));
});

test('an input with agent_id writes nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  assertNothing(dir, env, run(dir, prompt(dir, { agent_id: 'a-1', agent_type: 'guilda:executor' }), { env }));
});

test('no .guilda folder or a broken config writes nothing', () => {
  const env = stateEnv();
  const none = tempProject();
  assertNothing(none, env, run(none, prompt(none), { env }));
  assert.equal(fs.existsSync(path.join(none, '.guilda')), false);
  const broken = tempProject({ config: '{ not json' });
  assertNothing(broken, env, run(broken, prompt(broken), { env }));
});

test('a prompt that is not a string writes nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  assertNothing(dir, env, run(dir, prompt(dir, { prompt: 42 }), { env }));
});

test('a long prompt is cut to the text limit', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  const r = run(dir, prompt(dir, { prompt: 'é'.repeat(MAX_TEXT_CHARS + 5) }), { env });
  assert.equal(r.code, 0);
  const [line] = userLines(dir);
  assert.equal([...line.text].length, MAX_TEXT_CHARS);
  assert.equal(verifyRecord(dir, line.id, env).ok, true);
});

test('a write error adds no context line and prints no key', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  fs.writeFileSync(path.join(dir, '.guilda', 'bus'), 'not a folder');
  const r = run(dir, prompt(dir), { env });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const file = keyPath(dir, env);
  if (fs.existsSync(file)) {
    const hex = fs.readFileSync(file).toString('hex');
    assert.equal(r.stderr.includes(hex), false);
  }
  assert.equal(r.stderr.includes('Use SQLite.'), false);
});
