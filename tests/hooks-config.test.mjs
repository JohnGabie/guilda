import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const hooks = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
const scriptOf = (entry) => path.basename(entry.hooks[0].args[0]);
/** Each entry as [event, matcher or null, script]. */
const rows = (h) => Object.entries(h).flatMap(([event, list]) => list.map((e) => [event, e.matcher ?? null, scriptOf(e)]));

test('the matchers of hooks.json for 0.4.0', () => {
  const h = hooks();
  const pre = h.PreToolUse.filter((e) => scriptOf(e) === 'pre-tool-use.mjs');
  assert.equal(pre.length, 1);
  assert.equal(pre[0].matcher, 'Bash|Write|Edit|Read|Grep|Glob');
  const post = h.PostToolUse.filter((e) => scriptOf(e) === 'post-tool-use.mjs');
  assert.equal(post.length, 1);
  assert.equal(post[0].matcher, 'Write|Edit|AskUserQuestion|SendMessage');
  assert.equal(h.UserPromptSubmit.length, 1);
  assert.equal(Object.hasOwn(h.UserPromptSubmit[0], 'matcher'), false);
  assert.deepEqual(h.UserPromptSubmit[0].hooks, [
    { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/user-prompt-submit.mjs'] },
  ]);
  for (const [event, , script] of rows(h)) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'hooks', script)), `${event} ${script}`);
  }
});

test('the other entries of hooks.json keep their matchers', () => {
  assert.deepEqual(rows(hooks()), [
    ['SessionStart', 'startup|resume|clear|compact', 'session-start.mjs'],
    ['SubagentStart', null, 'subagent-start.mjs'],
    ['PreToolUse', 'Bash|Write|Edit|Read|Grep|Glob', 'pre-tool-use.mjs'],
    ['PreToolUse', 'Write|Edit|MultiEdit|NotebookEdit', 'pre-architect-write.mjs'],
    ['PreToolUse', 'Agent', 'pre-agent.mjs'],
    ['PreToolUse', 'Skill', 'pre-skill.mjs'],
    ['PreToolUse', '*', 'agent-trace.mjs'],
    ['PreToolUse', 'Bash', 'pre-rm.mjs'],
    ['PreToolUse', 'AskUserQuestion', 'pre-question.mjs'],
    ['PostToolUse', 'Write|Edit|AskUserQuestion|SendMessage', 'post-tool-use.mjs'],
    ['PostToolUse', 'Agent', 'post-agent.mjs'],
    ['PostToolUse', '*', 'agent-trace.mjs'],
    ['UserPromptSubmit', null, 'user-prompt-submit.mjs'],
    ['PreCompact', 'manual|auto', 'pre-compact.mjs'],
    ['SubagentStop', '^guilda:(reviewer|security|qa)$', 'subagent-stop.mjs'],
    ['SubagentStop', null, 'agent-end.mjs'],
  ]);
});
