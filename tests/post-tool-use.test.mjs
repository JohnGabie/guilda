import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';
import { readMailbox, pendingOf } from '../scripts/lib/bus.mjs';
import { verifyRecord, keyPath } from '../scripts/lib/records.mjs';

const HOOK = 'scripts/hooks/post-tool-use.mjs';
const LONG = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(' ') + '.\n';

function records(dir) {
  const file = path.join(dir, '.guilda', 'violations.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function write(dir, rel, text) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  return full;
}

const post = (dir, filePath, tool = 'Write') =>
  runHook(HOOK, { hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: filePath }, cwd: dir }, dir);

test('no config -> nothing', () => {
  const dir = tempProject();
  const r = post(dir, write(dir, 'docs/a.md', LONG));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('.md with a 30-word sentence -> additionalContext names R15 and one record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = post(dir, write(dir, 'docs/a.md', LONG), 'Edit');
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /^R15: fix these lines:/);
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/a\.md:1 long-sentence 30 words/);
  const recs = records(dir);
  assert.equal(recs.length, 1);
  assert.deepEqual(
    { rule: recs[0].rule, level: recs[0].level, source: recs[0].source, action: recs[0].action },
    { rule: 'R15', level: 'gate', source: 'ste-check', action: '1 findings in docs/a.md' },
  );
});

test('at most 15 findings listed', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const text = Array.from({ length: 20 }, (_, i) => `Line ${i} must handle it.`).join('\n') + '\n';
  const r = post(dir, write(dir, 'b.md', text));
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.equal((ctx.match(/vague-word/g) || []).length, 15);
  assert.equal(records(dir)[0].action, '20 findings in b.md');
});

test('a forbidden word from the project glossary -> finding', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  write(dir, 'docs/superpowers/specs/GLOSSARY.md', '- **course**: a unit of study. Forbidden: class.\n');
  const r = post(dir, write(dir, 'c.md', 'Open the class page.\n'));
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /c\.md:1 forbidden-word "class"/);
});

test('a forbidden word from the core glossary -> finding', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = post(dir, write(dir, 'c.md', 'Send the ticket.\n'));
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /forbidden-word "ticket"/);
});

test('file in writing.free -> nothing', () => {
  const config = { ...MINIMAL_CONFIG, writing: { free: ['docs/blog/**'], exceptions: [] } };
  const dir = tempProject({ config });
  const r = post(dir, write(dir, 'docs/blog/post.md', LONG));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('.ts file -> nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = post(dir, write(dir, 'src/a.ts', `// ${LONG}`));
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('.journal file -> nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = post(dir, write(dir, '.journal/2026-11-01.md', LONG));
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('clean .md -> nothing', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const r = post(dir, write(dir, 'd.md', 'The hook returns 404.\n'));
  assert.equal(r.stdout, '');
  assert.equal(records(dir).length, 0);
});

test('hooks.json runs post-tool-use on Write|Edit|AskUserQuestion|SendMessage', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const [entry] = hooks.PostToolUse;
  assert.equal(entry.matcher, 'Write|Edit|AskUserQuestion|SendMessage');
  assert.deepEqual(entry.hooks[0], {
    type: 'command',
    command: 'node',
    args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/post-tool-use.mjs'],
  });
});

const SPEC_REL = 'docs/superpowers/specs/a.md';
const SPEC_TEXT = '### D14 — Rule\n\nThe hook returns 404.\n\n### D15 — Other\n\nThe hook returns 500.\n';
const PLAN_REL = 'docs/superpowers/specs/a.plan.md';
const planUses = (uses) => `# Plan\n\n### T2 — Build\n\nOwns: D15\nUses: ${uses}\n`;

test('trace warning', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  write(dir, PLAN_REL, planUses('D14@3f2a9c1b'));
  const r = post(dir, write(dir, SPEC_REL, SPEC_TEXT), 'Edit');
  assert.equal(r.code, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  const suspect = ctx.split('\n').filter((l) => l.startsWith('SUSPECT'));
  assert.equal(suspect.length, 1, ctx);
  assert.match(suspect[0], /T2/);
  assert.match(suspect[0], /D14/);
  const other = post(dir, write(dir, 'src/a.js', 'const a = 1;\n'), 'Edit');
  assert.equal(other.code, 0);
  assert.equal(other.stdout, '');
});

test('the ste findings still show', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  write(dir, PLAN_REL, planUses('D14@3f2a9c1b'));
  const r = post(dir, write(dir, SPEC_REL, SPEC_TEXT + LONG), 'Edit');
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /R15: fix these lines:/);
  assert.match(ctx, /long-sentence 30 words/);
});

test('at most 15 lines in all, trace and ste together', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const uses = Array.from({ length: 10 }, (_, i) => `X${i + 1}`).join(', ');
  write(dir, PLAN_REL, planUses(`${uses}, D14@3f2a9c1b`));
  const vague = Array.from({ length: 20 }, (_, i) => `Line ${i} must handle it.`).join('\n') + '\n';
  const r = post(dir, write(dir, SPEC_REL, SPEC_TEXT + vague), 'Edit');
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.ok(ctx.split('\n').filter((l) => /^(SUSPECT|UNKNOWN)|vague-word/.test(l)).length <= 15, ctx);
});

test('a check error adds no line and exits 0', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  fs.mkdirSync(path.join(dir, 'docs/superpowers/specs/bad.md'), { recursive: true });
  const r = post(dir, write(dir, SPEC_REL, SPEC_TEXT), 'Edit');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

// R35 (S4-16): the answer record of the question tool.
const stateEnv = () => ({ XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state ')) });
const userLines = (dir) => {
  const file = path.join(dir, '.guilda', 'bus', 'user.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
/** Run the hook with exactly this entry point value ('none': no value). */
function postRaw(dir, input, { entry = 'cli', env = {} } = {}) {
  const e = { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT };
  delete e.GUILDA_ADDRESS;
  if (entry === 'none') delete e.CLAUDE_CODE_ENTRYPOINT;
  else e.CLAUDE_CODE_ENTRYPOINT = entry;
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, HOOK)], { input: JSON.stringify(input), encoding: 'utf8', cwd: dir, env: e });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const QUESTION = 'Which database should we use: SQLite or Postgres?';
const ASK_INPUT = {
  questions: [{ question: QUESTION, header: 'Database', options: [{ label: 'SQLite', description: 'Embedded.' }, { label: 'Postgres', description: 'Server.' }], multiSelect: false }],
};
const ASK_RESPONSE = { ...ASK_INPUT, answers: { [QUESTION]: 'SQLite' }, annotations: {} };
const ask = (dir, extra = {}) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'AskUserQuestion',
  session_id: 's1',
  cwd: dir,
  tool_input: { ...ASK_INPUT, answers: { [QUESTION]: 'SQLite' } },
  tool_response: ASK_RESPONSE,
  ...extra,
});

test('answer record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = stateEnv();
  const r = postRaw(dir, ask(dir), { env });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PostToolUse');
  const id = out.additionalContext.match(/^guilda user record: (u-[0-9a-f]{8})$/)[1];
  const [line, ...more] = userLines(dir);
  assert.equal(more.length, 0);
  assert.equal(line.id, id);
  assert.equal(line.kind, 'answer');
  assert.equal(line.channel, 'main');
  assert.equal(line.session, 's1');
  assert.equal(line.question, QUESTION);
  assert.equal(line.text, JSON.stringify(ASK_RESPONSE));
  assert.match(line.text, /SQLite/);
  assert.match(line.text, /"answers"/);
  const v = verifyRecord(dir, id, env);
  assert.equal(v.ok, true);
  assert.equal(v.record.text, JSON.stringify(ASK_RESPONSE));
  assert.equal(records(dir).length, 0);
});

test('answer record: print mode, a subagent or a Codex input writes nothing', () => {
  const env = stateEnv();
  for (const [name, input, entry] of [
    ['sdk-cli', (d) => ask(d), 'sdk-cli'],
    ['no entry point', (d) => ask(d), 'none'],
    ['agent_id', (d) => ask(d, { agent_id: 'a-1' }), 'cli'],
    ['turn_id', (d) => ask(d, { turn_id: 't-1' }), 'cli'],
  ]) {
    const dir = tempProject({ config: MINIMAL_CONFIG });
    const r = postRaw(dir, input(dir), { entry, env });
    assert.equal(r.code, 0, name);
    assert.equal(r.stdout, '', name);
    assert.deepEqual(userLines(dir), [], name);
    assert.equal(fs.existsSync(keyPath(dir, env)), false, name);
  }
});

// S4-39: the delivered receipt of a relay.
const TASK_ADDRESS = 'T3-exe-7f2a';
function relayProject() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const q = path.join(dir, '.guilda', 'queue');
  fs.mkdirSync(q, { recursive: true });
  const evs = [
    { type: 'task', task: 'T3', work: null, key: null, title: 'C', deps: [], uses: [], owns: [] },
    { type: 'dispatch', task: 'T3', attempt: 1, address: TASK_ADDRESS, role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master' },
  ];
  const t0 = Date.parse('2026-11-17T10:00:00.000Z');
  fs.writeFileSync(path.join(q, 'journal.jsonl'), `${evs.map((e, i) => JSON.stringify({ seq: i + 1, t: new Date(t0 + i * 1000).toISOString(), ...e })).join('\n')}\n`);
  const s = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'bus.mjs'), dir, 'send', '--from', 'architect', '--to', TASK_ADDRESS, '--type', 'request', '--text', 'do T3'], {
    encoding: 'utf8',
  });
  const id = JSON.parse(s.stdout).id;
  assert.match(id, /^m-[0-9a-f]{8}$/);
  return { dir, id };
}
const sendMessage = (dir, message) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'SendMessage',
  session_id: 's1',
  cwd: dir,
  tool_input: { to: 'a-7', message },
  tool_response: {},
});

test('delivered receipt', () => {
  const { dir, id } = relayProject();
  const other = id === 'm-00000002' ? 'm-00000003' : 'm-00000002';
  const mailbox = path.join(dir, '.guilda', 'bus', `${TASK_ADDRESS}.jsonl`);
  const before = fs.readFileSync(mailbox, 'utf8');
  for (const text of ['do T3 with no header', `guilda-message: ${other} from architect type request\ndo T3`, `say guilda-message: ${id} from architect type request`]) {
    const none = postRaw(dir, sendMessage(dir, text));
    assert.equal(none.code, 0, text);
    assert.equal(none.stdout, '', text);
    assert.equal(fs.readFileSync(mailbox, 'utf8'), before, text);
  }
  const r = postRaw(dir, sendMessage(dir, `guilda-message: ${id} from architect type request\ndo T3`));
  assert.equal(r.code, 0, r.stderr);
  const lines = readMailbox(dir, TASK_ADDRESS);
  const receipts = lines.filter((l) => l.type === 'receipt');
  assert.equal(receipts.length, 1);
  assert.deepEqual({ ref: receipts[0].ref, state: receipts[0].state, by: receipts[0].by }, { ref: id, state: 'delivered', by: 'main' });
  assert.deepEqual(pendingOf(lines), []);
  const p = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'bus.mjs'), dir, 'pending', '--address', TASK_ADDRESS], { encoding: 'utf8' });
  assert.equal(p.status, 0);
  assert.equal(p.stdout, '');
  const after = fs.readFileSync(mailbox, 'utf8');
  const again = postRaw(dir, sendMessage(dir, `guilda-message: ${id} from architect type request\ndo T3`));
  assert.equal(again.code, 0);
  assert.equal(fs.readFileSync(mailbox, 'utf8'), after);
  assert.deepEqual(userLines(dir), []);
});
