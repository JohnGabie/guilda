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

const ALL = ['journal.jsonl', 'state.json', 'lock', 'writer.json'];

test('a quoted heredoc body with x => { writes no queue file', () => {
  const dir = project();
  for (const open of ["<<'EOF'", '<<"EOF"', '<<\\EOF', "<< 'EOF'"]) {
    const command = `cat > tests/greeting.test.mjs ${open}\nconst greet = (x) => x;\n[1].map(x => {\n  return x;\n});\nEOF`;
    assert.deepEqual(queueFileWrites(command, dir, dir), [], command);
  }
});

test('a quoted heredoc body that names a queue file is text', () => {
  const dir = project();
  const command = "cat > notes.md <<'EOF'\necho x > .guilda/queue/state.json\nrm -rf .guilda\nEOF";
  assert.deepEqual(queueFileWrites(command, dir, dir), []);
  // A queue write after the end line is still read.
  assert.deepEqual(queueFileWrites(`${command}\necho x > .guilda/queue/lock`, dir, dir), ['lock']);
});

test('an unquoted heredoc body is still read', () => {
  const dir = project();
  const command = 'cat > notes.md <<EOF\n$(echo x > .guilda/queue/state.json)\nEOF';
  assert.ok(queueFileWrites(command, dir, dir).includes('state.json'));
  assert.ok(queueFileWrites('cat > notes.md <<EOF\nx => {\nEOF', dir, dir).length > 0);
});

test('bash <<quoted heredoc body is still read', () => {
  const dir = project();
  const body = "\necho x > .guilda/queue/state.json\nEOF";
  for (const head of ["bash <<'EOF'", "sh <<'EOF'", "/bin/zsh -s <<'EOF'", "cat <<'EOF' | bash", "eval \"$(cat)\" <<'EOF'",
    "source /dev/stdin <<'EOF'", ". /dev/stdin <<'EOF'", "cat <<'EOF' |\nbash", "bash \\\n<<'EOF'", '"$SH" <<\'EOF\'']) {
    const command = head.includes('\n') ? `${head.split('\n')[0]}${body}\n${head.split('\n')[1]}` : `${head}${body}`;
    assert.ok(queueFileWrites(command, dir, dir).includes('state.json'), command);
  }
});

test('<<- with tabs ends the body', () => {
  const dir = project();
  const command = "cat > a.txt <<-'EOF'\n\tx => {\n\tEOF\necho x > .guilda/queue/writer.json";
  assert.deepEqual(queueFileWrites(command, dir, dir), ['writer.json']);
  // Without the dash, a tab before the delimiter does not end the body: the rest is body.
  assert.deepEqual(queueFileWrites("cat > a.txt <<'EOF'\n\tEOF\necho x > .guilda/queue/writer.json", dir, dir), []);
});

test('a quoted heredoc with no end line', () => {
  const dir = project();
  assert.deepEqual(queueFileWrites("cat > a.txt <<'EOF'\nx => {\necho x > .guilda/queue/lock", dir, dir), []);
});

test('the redirect of the heredoc command line still counts', () => {
  const dir = project();
  assert.deepEqual(queueFileWrites("cat > .guilda/queue/state.json <<'EOF'\n{}\nEOF", dir, dir), ['state.json']);
  assert.deepEqual(queueFileWrites("cat <<'EOF' > .guilda/queue/lock\nx\nEOF", dir, dir), ['lock']);
});

test('two heredocs on one line are read in order', () => {
  const dir = project();
  const quotedThenOpen = "cat <<'A' - <<B > out.txt\nx => {\nA\n$(rm .guilda/queue/lock)\nB";
  assert.ok(queueFileWrites(quotedThenOpen, dir, dir).includes('lock'));
  const bothQuoted = "cat <<'A' - <<'B' > out.txt\nx => {\nA\ny => {\nB\ntouch .guilda/queue/journal.jsonl";
  assert.deepEqual(queueFileWrites(bothQuoted, dir, dir), ['journal.jsonl']);
});

test('a heredoc mark inside quotes, a comment or arithmetic is not a heredoc', () => {
  const dir = project();
  for (const command of [
    "echo \"<<'EOF'\"\nrm .guilda/queue/lock\nEOF",
    "echo x # <<'EOF'\nrm .guilda/queue/lock\nEOF",
    "x=$((1<<'EOF'))\nrm .guilda/queue/lock\nEOF",
    "echo \"a\nb\" <<'EOF'\nrm .guilda/queue/lock\nEOF",
  ]) {
    assert.ok(queueFileWrites(command, dir, dir).includes('lock'), command);
  }
  assert.deepEqual(queueFileWrites('echo x > .guilda/queue/lock', dir, dir), ['lock']);
  assert.ok(ALL.length === 4);
});

test('a delimiter word with $ or a backslash in double quotes is not followed', () => {
  const dir = project();
  for (const open of ["<<$'EOF'", '<<$"EOF"', '<<"A\\$B"', '<<"E\\OF"']) {
    const command = `cat > a.txt ${open}\nx\nEOF\nA$B\necho x > .guilda/queue/lock`;
    assert.ok(queueFileWrites(command, dir, dir).includes('lock'), command);
  }
});

test('a quoted body is text only for cat or tee', () => {
  const dir = project();
  const body = "\necho x > .guilda/queue/state.json\nEOF";
  for (const head of ["ksh <<'EOF'", "mksh <<'EOF'", "fish <<'EOF'", "python - <<'EOF'", "cat <<'EOF' | sh",
    "xargs -0 cat <<'EOF'", "sudo cat <<'EOF'", "./cat <<'EOF'", "PATH=bin cat <<'EOF'", "{ cat <<'EOF'; } | sh",
    "eval $(cat <<'EOF')", "tee >(sh) <<'EOF'"]) {
    assert.ok(queueFileWrites(`${head}${body}`, dir, dir).includes('state.json'), head);
  }
  assert.ok(queueFileWrites(`cat() { bash; }\ncat <<'EOF'${body}`, dir, dir).includes('state.json'));
  for (const head of ["tee f.txt <<'EOF'", "cat <<'EOF'", "command cat > a <<'EOF'", "/bin/cat > a <<'EOF'",
    "echo a; cat > b <<'EOF'"]) {
    assert.deepEqual(queueFileWrites(`${head}\nx => {${body}`, dir, dir), [], head);
  }
});

test('a PATH change by read, printf -v, +=, declare, export or a nameref keeps the body', () => {
  const dir = project();
  const body = "\necho x > .guilda/queue/state.json\nEOF";
  for (const change of ['read PATH', 'printf -v PATH %s bin', 'PATH+=:bin', 'declare PATH=bin', 'export PATH',
    'declare -n x=PATH']) {
    assert.ok(queueFileWrites(`${change}\ncat <<'EOF'${body}`, dir, dir).includes('state.json'), change);
  }
});

test('a split or indirect variable name keeps the body; a plain cat heredoc still drops it', () => {
  const dir = project();
  const body = "\necho x > .guilda/queue/state.json\nEOF";
  for (const change of ['read P"A"TH', "eval 'PA''TH=x'", 'p=PA; read ${p}TH']) {
    assert.ok(queueFileWrites(`${change}\ncat <<'EOF'${body}`, dir, dir).includes('state.json'), change);
  }
  assert.deepEqual(queueFileWrites(`cat <<'EOF'\nx => {${body}`, dir, dir), []);
});

test('a text with an unsafe word or first word keeps every body', () => {
  const dir = project();
  const body = "\necho x > .guilda/queue/state.json\nEOF";
  for (const head of ["let PA'TH'=1\ncat <<'EOF'", "(( ${p}TH=1 ))\ncat <<'EOF'", "wait -p ${p}TH\ncat <<'EOF'",
    "if true; then . ./f; cat <<'EOF'", "for x in a; do . ./f; cat <<'EOF'", "if false; then :; else . ./f; cat <<'EOF'",
    "! . ./f; cat <<'EOF'", "cat $f <<'EOF'"]) {
    assert.ok(queueFileWrites(`${head}${body}`, dir, dir).includes('state.json'), head);
  }
  for (const head of ["cat <<'EOF'", "tee -a f.txt <<'EOF'", "cat > a.txt >> b.txt <<\"EOF\""]) {
    assert.deepEqual(queueFileWrites(`${head}\nx => {${body}`, dir, dir), [], head);
  }
});
