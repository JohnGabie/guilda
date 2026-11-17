import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

// T24: guilda:architect-executor writes only Markdown files inside the project, not under .git or .guilda (AEX).
const HOOK = 'scripts/hooks/pre-architect-write.mjs';
const AEX = 'guilda:architect-executor';
const REASON =
  'AEX: guilda:architect-executor writes only Markdown files inside the project, not under .git, .guilda or .claude, and not CLAUDE.md or CLAUDE.local.md.';

// MAIN: the main session, whose hook input has no agent_type.
const MAIN = null;
const call = (tool_name, tool_input, agent_type = AEX) => {
  const input = { tool_name, tool_input };
  if (agent_type !== MAIN) input.agent_type = agent_type;
  return input;
};
const write = (file_path, agent_type) => call('Write', { file_path, content: 'x' }, agent_type);

function records(dir) {
  const file = path.join(dir, '.guilda', 'violations.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function assertPass(r) {
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
}

function assertDeny(r) {
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.permissionDecisionReason, REASON);
}

const project = () => tempProject({ config: MINIMAL_CONFIG });

test('a .md file inside the project passes', () => {
  const dir = project();
  assertPass(runHook(HOOK, write(path.join(dir, 'docs', 'spec.md')), dir));
  assertPass(runHook(HOOK, write('notes.md'), dir));
  fs.writeFileSync(path.join(dir, 'README.md'), 'old');
  assertPass(runHook(HOOK, call('Edit', { file_path: path.join(dir, 'README.md'), old_string: 'o', new_string: 'n' }), dir));
  assertPass(runHook(HOOK, write(path.join(dir, 'a.md'), '  GUILDA:Architect-Executor '), dir));
  assert.deepEqual(records(dir), []);
});

test('a .js file, a file under .git/ and a file under .guilda/ are refused', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.git'));
  for (const p of ['src/a.js', 'notes.txt', 'a.MD', 'a.md.js', '.git/notes.md', '.guilda/rules.md', 'x/.git/a.md']) {
    assertDeny(runHook(HOOK, write(path.join(dir, p)), dir));
  }
  assertDeny(runHook(HOOK, call('Edit', { file_path: path.join(dir, '.guilda', 'x.md') }), dir));
});

test('a path with .. out of the project is refused', () => {
  const dir = project();
  const out = path.join(path.dirname(dir), 'outside.md');
  assertDeny(runHook(HOOK, write(path.join(dir, '..', path.basename(out))), dir));
  assertDeny(runHook(HOOK, write(`../${path.basename(out)}`), dir));
  assertDeny(runHook(HOOK, write(path.join(os.tmpdir(), 'elsewhere.md')), dir));
  assertDeny(runHook(HOOK, write(path.join(dir, 'docs', '..', '..', 'x.md')), dir));
});

test('a symlinked folder that points out is refused', () => {
  const dir = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda out '));
  fs.symlinkSync(outside, path.join(dir, 'link'));
  assertDeny(runHook(HOOK, write(path.join(dir, 'link', 'a.md')), dir));
  assertDeny(runHook(HOOK, write(path.join(dir, 'link', 'new', 'a.md')), dir));
  // A link to a file is refused too, and a link to .guilda inside the project.
  fs.writeFileSync(path.join(outside, 'f.md'), 'x');
  fs.symlinkSync(path.join(outside, 'f.md'), path.join(dir, 'f.md'));
  assertDeny(runHook(HOOK, write(path.join(dir, 'f.md')), dir));
  fs.symlinkSync(path.join(dir, '.guilda'), path.join(dir, 'g'));
  assertDeny(runHook(HOOK, write(path.join(dir, 'g', 'a.md')), dir));
});

test('a file under .claude/ and a CLAUDE.md or CLAUDE.local.md file are refused', () => {
  const dir = project();
  for (const p of ['.claude/agents/x.md', '.claude/commands/y.md', 'sub/.Claude/a.md', 'CLAUDE.md', 'sub/claude.local.md', 'docs/Claude.md']) {
    assertDeny(runHook(HOOK, write(path.join(dir, p)), dir));
  }
  assertPass(runHook(HOOK, write(path.join(dir, 'docs', 'notes.md')), dir));
});

test('a dangling symlinked folder is refused', () => {
  const dir = project();
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda out ')), 'missing');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.symlinkSync(missing, path.join(dir, 'docs', 'link'));
  assertDeny(runHook(HOOK, write(path.join(dir, 'docs', 'link', 'a.md')), dir));
  assertDeny(runHook(HOOK, write(path.join(dir, 'docs', 'link', 'deep', 'a.md')), dir));
});

test('the agent type without the plugin prefix is checked too', () => {
  const dir = project();
  for (const t of ['architect-executor', '  Architect-Executor ']) {
    assertDeny(runHook(HOOK, write(path.join(dir, 'src', 'a.js'), t), dir));
    assertPass(runHook(HOOK, write(path.join(dir, 'a.md'), t), dir));
  }
});

test('a hard link is refused', () => {
  const dir = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda out '));
  fs.writeFileSync(path.join(outside, 'h.md'), 'x');
  fs.linkSync(path.join(outside, 'h.md'), path.join(dir, 'h.md'));
  assertDeny(runHook(HOOK, write(path.join(dir, 'h.md')), dir));
  assertDeny(runHook(HOOK, call('Edit', { file_path: path.join(dir, 'h.md') }), dir));
});

test('MultiEdit and NotebookEdit are refused', () => {
  const dir = project();
  assertDeny(runHook(HOOK, call('MultiEdit', { file_path: path.join(dir, 'a.md'), edits: [] }), dir));
  assertDeny(runHook(HOOK, call('NotebookEdit', { notebook_path: path.join(dir, 'a.md') }), dir));
});

test('a missing file_path is refused', () => {
  const dir = project();
  assertDeny(runHook(HOOK, call('Write', { content: 'x' }), dir));
  assertDeny(runHook(HOOK, call('Write', { file_path: 42 }), dir));
  assertDeny(runHook(HOOK, call('Write', { file_path: '' }), dir));
  assertDeny(runHook(HOOK, call('Write', undefined), dir));
  assertDeny(runHook(HOOK, { agent_type: AEX }, dir));
});

test('the same Write from guilda:executor passes', () => {
  const dir = project();
  assertPass(runHook(HOOK, write(path.join(dir, 'src', 'a.js'), 'guilda:executor'), dir));
  assertPass(runHook(HOOK, call('MultiEdit', { file_path: path.join(dir, 'a.js') }, 'guilda:executor'), dir));
});

test('the main session passes', () => {
  const dir = project();
  assertPass(runHook(HOOK, write(path.join(dir, 'src', 'a.js'), MAIN), dir));
  assertPass(runHook(HOOK, call('NotebookEdit', {}, MAIN), dir));
});

test('no .guilda folder: nothing is refused', () => {
  const dir = tempProject();
  assertPass(runHook(HOOK, write(path.join(dir, 'a.js')), dir));
  assertPass(runHook(HOOK, call('MultiEdit', {}), dir));
  assert.equal(fs.existsSync(path.join(dir, '.guilda')), false);
});

test('the record has no path', () => {
  const dir = project();
  const secret = path.join(dir, 'secret-name.js');
  assertDeny(runHook(HOOK, write(secret), dir));
  const recs = records(dir);
  assert.equal(recs.length, 1);
  const { rule, level, source, action } = recs[0];
  assert.deepEqual({ rule, level, source, action },
    { rule: 'AEX', level: 'law', source: 'pre-architect-write', action: 'write refused' });
  const text = fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8');
  assert.ok(!text.includes('secret-name'), 'the record holds no path');
  assert.ok(!text.includes(dir), 'the record holds no project path');
});

test('hooks.json has the entry in exec form', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = hooks.PreToolUse.find((e) => e.matcher === 'Write|Edit|MultiEdit|NotebookEdit');
  assert.ok(entry);
  assert.equal(entry.hooks.length, 1);
  assert.equal(entry.hooks[0].type, 'command');
  assert.equal(entry.hooks[0].command, 'node');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-architect-write.mjs']);
});
