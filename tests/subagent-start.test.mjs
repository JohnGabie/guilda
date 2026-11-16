import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/subagent-start.mjs';
const run = (dir) => runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir }, dir);

test('without config: empty stdout, exit 0', () => {
  const r = run(tempProject());
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('a broken layer gives Docs language: en. Process: full.', () => {
  const r = run(tempProject({ config: '{ nope' }));
  assert.equal(r.code, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^Docs language: en\. Process: full\. Glossary: .*glossary\.md$/m);
});

test('the line has Process: full. for a 0.1.0 fixture and Process: light. for a light config (S18)', () => {
  const fixture = fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'compat', '0.1.0', 'config.json'), 'utf8');
  const ctx = (config) => JSON.parse(run(tempProject({ config })).stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx(fixture), /^Docs language: en\. Process: full\. Glossary: /m);
  assert.match(ctx({ ...MINIMAL_CONFIG, process: 'light' }), /^Docs language: en\. Process: light\. Glossary: /m);
});

test('with config: context has R5, the docs language and the glossary path', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, languages: { replies: 'pt', docs: 'de' } } });
  const out = JSON.parse(run(dir).stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SubagentStart');
  assert.match(out.additionalContext, /R5/);
  assert.match(out.additionalContext, /docs language: de/i);
  assert.match(out.additionalContext, /glossary\.md/);
  const n = out.additionalContext.split('\n').filter((l) => l.trim()).length;
  assert.ok(n <= 60 + 3, `got ${n}`);
});
