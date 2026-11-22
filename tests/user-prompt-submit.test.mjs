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
  // The key is made first, then the append fails: the user file is a folder.
  fs.mkdirSync(userFile(dir), { recursive: true });
  const r = run(dir, prompt(dir), { env });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const key = fs.readFileSync(keyPath(dir, env));
  assert.equal(key.length, 32);
  for (const form of [key.toString('hex'), key.toString('base64'), key.toString('latin1')]) {
    assert.equal(r.stdout.includes(form), false);
    assert.equal(r.stderr.includes(form), false);
  }
  assert.equal(r.stderr.includes('Use SQLite.'), false);
  assert.equal(fs.statSync(userFile(dir)).isDirectory(), true);
});

test('a bus path that is not a folder adds no context line', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  fs.writeFileSync(path.join(dir, '.guilda', 'bus'), 'not a folder');
  const r = run(dir, prompt(dir), { env });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.includes('Use SQLite.'), false);
});

// The @mention step (D49, section 4l).
const T = Date.parse('2026-11-20T10:00:00.000Z');
const writeJournal = (dir, evs) => {
  const folder = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(folder, { recursive: true });
  const lines = evs.map((e, i) => JSON.stringify({ seq: i + 1, t: new Date(T + i * 1000).toISOString(), ...e }));
  fs.writeFileSync(path.join(folder, 'journal.jsonl'), `${lines.join('\n')}\n`);
};
const bind = (address, role, agentId) => [
  { type: 'task', task: address.split('-')[0], work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
  { type: 'dispatch', task: address.split('-')[0], attempt: 1, address, role, tool: 'claude', inSession: true, check: false, tier: 'master' },
  ...(agentId ? [{ type: 'agent', address, agentId, agentType: 'guilda:x' }] : []),
];
const mentionDir = (evs) => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeJournal(dir, evs);
  return dir;
};
const twoBound = () => mentionDir([...bind('T3-exe-7f2a', 'exe', 'a-3'), ...bind('T5-sec-1b2c', 'sec', 'a-5')]);
const contextOf = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
const relay = (address, agent, id) =>
  `guilda D49: the user addressed ${address} directly. Call SendMessage to it (agent ${agent}) with \`Record: ${id}\` and the text after the mention. Write no text in this turn. When the reply arrives, show it word for word, with no text before or after it.`;
const withPrompt = (dir, text, env = stateEnv(), opts = {}) => run(dir, prompt(dir, { prompt: text }), { env, ...opts });

test('mention: a bound address gets the relay line word for word', () => {
  const dir = twoBound();
  const r = withPrompt(dir, '@T3-exe-7f2a which storage?');
  assert.equal(r.code, 0, r.stderr);
  const lines = contextOf(r).split('\n');
  const id = lines[0].match(CONTEXT)[1];
  assert.equal(lines.length, 2);
  assert.equal(lines[1], relay('T3-exe-7f2a', 'a-3', id));
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'queue', 'state.json')), false);
});

test('mention: architect gets no relay text', () => {
  const dir = twoBound();
  const r = withPrompt(dir, '@architect which storage?');
  assert.equal(r.code, 0, r.stderr);
  assert.match(contextOf(r), CONTEXT);
});

test('mention: an unknown target gets the list of live addresses', () => {
  const dir = twoBound();
  const lines = contextOf(withPrompt(dir, '@nobody hi')).split('\n');
  assert.equal(
    lines[1],
    'guilda D49: the user addressed nobody, which is not a live address. The live addresses are: T3-exe-7f2a, T5-sec-1b2c. Ask the user which one. Start no agent.',
  );
});

test('mention: an unknown target with no bound entry lists none, and an unbound entry is not listed', () => {
  const dir = mentionDir([...bind('T3-exe-7f2a', 'exe', 'a-3'), { type: 'unbind', address: 'T3-exe-7f2a' }]);
  const lines = contextOf(withPrompt(dir, '@nobody hi')).split('\n');
  assert.match(lines[1], /The live addresses are: none\. Ask the user which one\. Start no agent\.$/);
  assert.equal(contextOf(withPrompt(dir, '@T3-exe-7f2a hi')).includes('Call SendMessage'), false);
});

test('mention: an email address and a file mention get no text', () => {
  const dir = twoBound();
  for (const text of ['me@example.com see this', '@src/x.py fix it', '@x.py fix it', 'hi @T3-exe-7f2a which?', '@T3-exe-7f2a', '@T3-exe-7f2a   ', ' @T3-exe-7f2a hi']) {
    const r = withPrompt(dir, text);
    assert.equal(r.code, 0, r.stderr);
    assert.match(contextOf(r), CONTEXT, text);
  }
});

test('mention: a tab after the target is a mention', () => {
  const dir = twoBound();
  const lines = contextOf(withPrompt(dir, '@T3-exe-7f2a\twhich storage?')).split('\n');
  assert.equal(lines[1], relay('T3-exe-7f2a', 'a-3', lines[0].match(CONTEXT)[1]));
});

test('security-lead: the role code sec resolves to its one bound address', () => {
  const dir = twoBound();
  const lines = contextOf(withPrompt(dir, '@security-lead check T3')).split('\n');
  assert.equal(lines[1], relay('T5-sec-1b2c', 'a-5', lines[0].match(CONTEXT)[1]));
});

test('mention: a role with two bound entries gets the list', () => {
  const dir = mentionDir([...bind('T3-exe-7f2a', 'exe', 'a-3'), ...bind('T4-exe-9c9c', 'exe', 'a-4')]);
  const lines = contextOf(withPrompt(dir, '@exe do it')).split('\n');
  assert.equal(lines.length, 2);
  assert.equal(
    lines[1],
    'guilda D49: the user addressed exe, which is not a live address. The live addresses are: T3-exe-7f2a, T4-exe-9c9c. Ask the user which one. Start no agent.',
  );
});

test('mention: an ext target with no agentId gets the list', () => {
  const dir = mentionDir([
    ...bind('T3-exe-7f2a', 'exe', 'a-3'),
    { type: 'join', address: 'ext-codex-voice-4592', tool: 'codex', name: 'voice' },
  ]);
  const lines = contextOf(withPrompt(dir, '@ext-codex-voice-4592 hello')).split('\n');
  assert.equal(
    lines[1],
    'guilda D49: the user addressed ext-codex-voice-4592, which is not a live address. The live addresses are: T3-exe-7f2a. Ask the user which one. Start no agent.',
  );
});

test('mention: no text when no record is written (print mode)', () => {
  const dir = twoBound();
  const env = stateEnv();
  for (const entry of ['sdk-cli', 'none']) assertNothing(dir, env, withPrompt(dir, '@T3-exe-7f2a hi', env, { entry }));
  assertNothing(dir, env, run(dir, prompt(dir, { prompt: '@T3-exe-7f2a hi', turn_id: 't-1' }), { env }));
  assertNothing(dir, env, run(dir, prompt(dir, { prompt: '@T3-exe-7f2a hi', agent_id: 'a-1' }), { env }));
});

test('mention: a readBindings error adds no text and exits 0', () => {
  const dir = twoBound();
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-loader-'));
  fs.writeFileSync(
    path.join(tools, 'hooks.mjs'),
    `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.endsWith('/scripts/lib/queue.mjs')) {
    r.source = String(r.source).replace('export function readBindings(', 'function readBindingsReal(') +
      '\\nexport function readBindings() { throw new Error("boom"); }\\n';
  }
  return r;
}
`,
  );
  fs.writeFileSync(
    path.join(tools, 'register.mjs'),
    `import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n`,
  );
  const env = { ...stateEnv(), NODE_OPTIONS: `--import=${path.join(tools, 'register.mjs')}` };
  const r = withPrompt(dir, '@T3-exe-7f2a hi', env);
  assert.equal(r.code, 0, r.stderr);
  assert.match(contextOf(r), CONTEXT);
  const r2 = withPrompt(dir, '@nobody hi', env);
  assert.equal(r2.code, 0, r2.stderr);
  assert.match(contextOf(r2), CONTEXT);
});

const writeClaimFile = (dir, session, extra = {}) => {
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.guilda', 'queue', 'writer.json'),
    `${JSON.stringify({ session, ttlSec: 600, aliveAt: new Date().toISOString(), pid: 1, ...extra })}\n`,
  );
};

test('a prompt in the claim session writes no user record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  writeClaimFile(dir, 's1');
  assertNothing(dir, env, run(dir, prompt(dir), { env }));
});

test('a prompt in another session still writes a user record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  writeClaimFile(dir, 's9');
  const r = run(dir, prompt(dir), { env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(userLines(dir).length, 1);
  // A claim past its ttl and a bad writer.json give the 0.4.1 result: the record.
  const old = tempProject({ config: MINIMAL_CONFIG });
  writeClaimFile(old, 's1', { aliveAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(run(old, prompt(old), { env }).code, 0);
  assert.equal(userLines(old).length, 1);
  const bad = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(bad, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(path.join(bad, '.guilda', 'queue', 'writer.json'), '{ not json');
  assert.equal(run(bad, prompt(bad), { env }).code, 0);
  assert.equal(userLines(bad).length, 1);
});

// away clear (S5-33, 5i): only a prompt of the user in the main session clears the away state.
async function awaySet(dir, env) {
  const { setAway } = await import('../scripts/lib/away.mjs');
  const before = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = env.XDG_STATE_HOME;
  try {
    setAway(dir);
  } finally {
    if (before === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = before;
  }
}
const awayStatus = (dir, env) =>
  spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'away.mjs'), dir, 'status', '--session', 's-main'], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).stdout;

test('away clear: a prompt of the claim session, of print mode or of a subagent keeps the state', async () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  await awaySet(dir, env);
  writeClaimFile(dir, 's-sup');
  assert.match(awayStatus(dir, env), /^away: yes since /);
  run(dir, prompt(dir, { session_id: 's-sup' }), { env });
  assert.match(awayStatus(dir, env), /^away: yes since /);
  run(dir, prompt(dir, { session_id: 's-main' }), { env, entry: 'sdk-cli' });
  assert.match(awayStatus(dir, env), /^away: yes since /);
  run(dir, prompt(dir, { session_id: 's-main', agent_id: 'a-1' }), { env });
  assert.match(awayStatus(dir, env), /^away: yes since /);
  assert.deepEqual(userLines(dir), []);
});

test('away clear: a claim file that cannot be read keeps the state (fail closed) and the record is written', async () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  await awaySet(dir, env);
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.guilda', 'queue', 'writer.json'), '{ not json');
  const r = run(dir, prompt(dir, { session_id: 's-main' }), { env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(userLines(dir).length, 1);
  assert.equal(fs.readdirSync(path.join(env.XDG_STATE_HOME, 'guilda', 's')).length, 1);
});

test('away clear: a prompt of the user in the main session clears the state and writes one record', async () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  await awaySet(dir, env);
  writeClaimFile(dir, 's-sup');
  const r = run(dir, prompt(dir, { session_id: 's-main' }), { env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(awayStatus(dir, env), 'away: no\n');
  assert.equal(userLines(dir).length, 1);
  assert.equal(userLines(dir)[0].kind, 'prompt');
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, CONTEXT);
  // a prompt with no away state still works
  assert.equal(run(dir, prompt(dir, { session_id: 's-main' }), { env }).code, 0);
  assert.equal(userLines(dir).length, 2);
});
