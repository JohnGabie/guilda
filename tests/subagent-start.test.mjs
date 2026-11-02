import test from 'node:test';
import assert from 'node:assert/strict';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

const SCRIPT = 'scripts/hooks/subagent-start.mjs';
const run = (dir) => runHook(SCRIPT, { hook_event_name: 'SubagentStart', cwd: dir }, dir);

test('without config: empty stdout, exit 0', () => {
  const r = run(tempProject());
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('invalid config: empty stdout, exit 0', () => {
  const r = run(tempProject({ config: '{ nope' }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
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
