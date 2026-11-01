import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

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

test('hooks.json runs post-tool-use on Write|Edit', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const [entry] = hooks.PostToolUse;
  assert.equal(entry.matcher, 'Write|Edit');
  assert.deepEqual(entry.hooks[0], {
    type: 'command',
    command: 'node',
    args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/post-tool-use.mjs'],
  });
});
