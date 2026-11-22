import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { awayPath, readAway, awayGuard, setAway, clearAway } from '../scripts/lib/away.mjs';

const AWAY = path.join(REPO_ROOT, 'scripts', 'away.mjs');
const NEUTRAL = 'This waits. Go on with the rest.';
const agent = { agent_id: 'a-1', agent_type: 'guilda:executor' };

/** A temp state folder for one test; the guard reads XDG_STATE_HOME at call time. */
function stateHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-away-state-'));
  process.env.XDG_STATE_HOME = dir;
  return dir;
}

function project({ git = false } = {}) {
  const dir = fs.realpathSync(tempProject({ config: MINIMAL_CONFIG, git }));
  return dir;
}

function writeClaim(dir, session) {
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.guilda', 'queue', 'writer.json'),
    `${JSON.stringify({ session, ttlSec: 600, aliveAt: new Date().toISOString(), pid: 1 })}\n`,
  );
}

const call = (dir, tool, toolInput, who = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's-main', cwd: dir, tool_name: tool, tool_input: toolInput, ...who });
const bash = (dir, command, who = {}) => call(dir, 'Bash', { command }, who);

function cli(dir, args, env = {}) {
  const r = spawnSync(process.execPath, [AWAY, dir, ...args], { encoding: 'utf8', cwd: dir, env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('awayPath is guilda/s/<hash>.json under the state folder, with no name that says away', () => {
  const state = stateHome();
  const dir = project();
  const file = awayPath(dir);
  assert.match(file, new RegExp(`^${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/guilda/s/[0-9a-f]{16}\\.json$`));
  assert.equal(/away/i.test(file.slice(state.length)), false);
});

test('readAway: no file is not away; a set file is; a broken file fails closed', () => {
  stateHome();
  const dir = project();
  assert.deepEqual(readAway(dir), { away: false });
  const state = setAway(dir, new Date('2026-11-22T10:00:00.000Z'));
  assert.deepEqual(state, { schemaVersion: 1, since: '2026-11-22T10:00:00.000Z', until: null });
  assert.deepEqual(readAway(dir), { away: true, since: '2026-11-22T10:00:00.000Z', until: null });
  fs.writeFileSync(awayPath(dir), '{ not json');
  assert.equal(readAway(dir).away, true);
  assert.equal(readAway(dir).error, true);
  assert.equal(clearAway(dir), true);
  assert.deepEqual(readAway(dir), { away: false });
  assert.equal(clearAway(dir), true);
});

// The read forms of the lab L5-4 table (25 forms), plus the quote-split and find forms.
test('each read form of the away file is refused for an agent with the exact text', () => {
  const state = stateHome();
  const dir = project();
  setAway(dir);
  const F = awayPath(dir);
  const D = path.dirname(F);
  const DOTDOT = path.join(state, 'guilda', 'x', '..', 's', path.basename(F));
  const rel = path.relative(os.homedir(), F);
  const TILDE = `~/${rel}`;
  fs.symlinkSync(F, path.join(dir, 'notes.json'));
  const forms = [
    ['Read', { file_path: F }],
    ['Grep', { pattern: 'since', path: F }],
    ['Grep', { pattern: 'since', path: D }],
    ['Glob', { pattern: '*.json', path: D }],
    ['Glob', { pattern: `${D}/*.json` }],
    ['Bash', { command: `cat ${F}` }],
    ['Bash', { command: `head -n 1 ${F}` }],
    ['Bash', { command: `tail -n 1 ${F}` }],
    ['Bash', { command: `less ${F}` }],
    ['Bash', { command: `sed -n 1p ${F}` }],
    ['Bash', { command: `awk '{print}' ${F}` }],
    ['Bash', { command: `grep since ${F}` }],
    ['Bash', { command: `cp ${F} ${dir}/copy.json` }],
    ['Bash', { command: `node -e "console.log(require('fs').readFileSync('${F}','utf8'))"` }],
    ['Bash', { command: `python3 -c "print(open('${F}').read())"` }],
    ['Bash', { command: `base64 ${F}` }],
    ['Read', { file_path: path.join(dir, 'notes.json') }],
    ['Bash', { command: 'cat notes.json' }],
    ['Read', { file_path: DOTDOT }],
    ['Bash', { command: `cat ${DOTDOT}` }],
    ['Read', { file_path: TILDE }],
    ['Bash', { command: `cat ${TILDE}` }],
    ['Bash', { command: `F=${F}; cat "$F"` }],
    ['Bash', { command: `F=${TILDE}; cat "$F"` }],
    ['Bash', { command: 'node scripts/away.mjs status' }],
    // quote-split and find forms
    ['Bash', { command: `cat ${state}/guil"da"/./"s"/*.json` }],
    ['Bash', { command: `find ${state} -name '*.json'` }],
    ['Bash', { command: `ls ${state}/guilda` }],
    ['Bash', { command: `sh -c 'cat ${F}'` }],
    ['Bash', { command: `cd ${D} && cat *.json` }],
    ['Bash', { command: `cat $XDG_STATE_HOME/guilda/s/${path.basename(F)}` }],
    // glob forms (security fix 1 and 2)
    ['Bash', { command: `cat ${path.dirname(state)}/guilda-away-st*/guilda/s/*.json` }],
    ['Bash', { command: `cat ${state}/g*/s/*.json` }],
    ['Bash', { command: `ls ${state}/g*/?` }],
    ['Bash', { command: `find ${path.dirname(state)}/guilda-away-st*` }],
    ['Bash', { command: `head -n1 ${state}/guilda/s/[0-9a-f]*` }],
    ['Bash', { command: `cat ${state}/guilda/{s,x}/*.json` }],
    ['Bash', { command: 'node scripts/aw?y.mjs . status' }],
    ['Bash', { command: 'node scripts/a*.mjs . status' }],
    ['Bash', { command: 'node scripts/[a]way.mjs . status' }],
    ['Bash', { command: 'node scripts/{away,x}.mjs . status' }],
    ['Bash', { command: 'node */aw?y.mjs . status' }],
    ['Bash', { command: 'cd scripts && node aw?y.mjs . status' }],
    ['Bash', { command: 'node scripts/./aw?y.mjs . status' }],
    ['Bash', { command: 'cd scripts/lib && node ../aw?y.mjs . status' }],
    ['Bash', { command: 'node sc/aw?y.mjs . status' }],
    ['Bash', { command: 'node /opt/x/y/a*y.mjs . status' }],
  ];
  for (const [tool, input] of forms) {
    const g = awayGuard(dir, call(dir, tool, input, agent));
    assert.ok(g, `${tool} ${JSON.stringify(input)} is refused`);
    assert.equal(g.refusal, NEUTRAL);
    assert.equal(g.rule, 'R39');
    assert.equal(g.reason, undefined);
  }
});

test('the Architect side may read the away file; plain reads of other files pass for an agent', () => {
  stateHome();
  const dir = project();
  setAway(dir);
  const F = awayPath(dir);
  assert.equal(awayGuard(dir, call(dir, 'Read', { file_path: F })), null);
  assert.equal(awayGuard(dir, bash(dir, `cat ${F}`)), null);
  assert.equal(awayGuard(dir, bash(dir, `node ${AWAY} ${dir} status --session s-main`)), null);
  assert.equal(awayGuard(dir, call(dir, 'Read', { file_path: path.join(dir, 'README.md') }, agent)), null);
  assert.equal(awayGuard(dir, bash(dir, 'cat README.md', agent)), null);
  // a name that only starts like the folder name is no match
  assert.equal(awayGuard(dir, bash(dir, 'cat ~/projects/guilda/scripts/queue.mjs', agent)), null);
  assert.equal(awayGuard(dir, call(dir, 'Edit', { file_path: F }, agent)), null);
  // glob words that cannot reach the folder or the script pass
  for (const c of ['cat src/*.js', 'node --test tests/*.test.mjs', "grep 'a.*b' README.md", 'node scripts/tick.mjs . status']) {
    assert.equal(awayGuard(dir, bash(dir, c, agent)), null, c);
  }
});

test('S5-29: the claim session and an unreadable input are refused; the main session passes', () => {
  stateHome();
  const dir = project();
  setAway(dir);
  writeClaim(dir, 's-sup');
  const status = 'node scripts/away.mjs status';
  assert.equal(awayGuard(dir, bash(dir, status, { session_id: 's-sup' })).refusal, NEUTRAL);
  assert.equal(awayGuard(dir, bash(dir, status, { session_id: 's-main' })), null);
  const F = awayPath(dir);
  for (const bad of [null, undefined, 'not json', 42, [], {}, { tool_name: 'Read' }, { tool_name: 'Bash', tool_input: {} }, { tool_name: 'Bash', tool_input: { command: 7 } }]) {
    const g = awayGuard(dir, bad);
    assert.ok(g, `refused: ${JSON.stringify(bad)}`);
    assert.equal(g.refusal, NEUTRAL);
    assert.equal(g.rule, 'R39');
  }
  assert.equal(awayGuard(dir, call(dir, 'Read', { file_path: F }, { session_id: 's-sup' })).refusal, NEUTRAL);
  // a claim file that cannot be read: not the Architect side
  fs.writeFileSync(path.join(dir, '.guilda', 'queue', 'writer.json'), '{ not json');
  assert.equal(awayGuard(dir, call(dir, 'Read', { file_path: F })).refusal, NEUTRAL);
});

test('S5-30: actions that need the user wait while away (R40)', () => {
  stateHome();
  const dir = project({ git: true });
  const vc = { agent_id: 'a-2', agent_type: 'guilda:version-control' };
  const actions = ['git push', 'git push origin main', 'git -C /tmp push', 'gh pr create --title x', 'gh release create v1', 'gh pr merge 3', 'gh -R a/b pr create',
    'node scripts/council.mjs open --x', 'node scripts/report-send.mjs draft.json', 'cd sub && git push', "sh -c 'git push'"];
  // with the file cleared: an agent is refused too (no sign of the absence); the Architect side passes
  for (const c of actions) {
    const g = awayGuard(dir, bash(dir, c, vc));
    assert.equal(g.refusal, NEUTRAL, c);
    assert.equal(g.rule, 'R40', c);
    assert.equal(awayGuard(dir, bash(dir, c)), null, c);
  }
  setAway(dir);
  for (const c of actions) {
    const g = awayGuard(dir, bash(dir, c, vc));
    assert.ok(g, c);
    assert.equal(g.refusal, NEUTRAL, c);
    assert.equal(g.rule, 'R40', c);
    assert.equal(g.reason, undefined, c);
    assert.ok(g.action, c);
  }
  const mine = awayGuard(dir, bash(dir, 'git push'));
  assert.equal(mine.refusal, NEUTRAL);
  assert.equal(mine.rule, 'R40');
  assert.match(mine.reason, /^R40: the user is away/);
  // other commands pass
  for (const c of ['git status', 'git commit -m push', 'gh pr view 3', 'node scripts/council.mjs say', 'echo git push']) {
    assert.equal(awayGuard(dir, bash(dir, c, vc)), null, c);
  }
  clearAway(dir);
  assert.equal(awayGuard(dir, bash(dir, 'git push')), null);
  assert.equal(awayGuard(dir, bash(dir, 'git push', vc)).rule, 'R40');
});

test('R40: a merge, rebase or cherry-pick is refused only on main or master', () => {
  stateHome();
  const dir = project({ git: true });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['checkout', '-B', 'main'], { cwd: dir, stdio: 'ignore' });
  setAway(dir);
  for (const c of ['git merge feat', 'git rebase feat', 'git cherry-pick abc']) {
    assert.equal(awayGuard(dir, bash(dir, c, agent)).rule, 'R40', c);
  }
  spawnSync('git', ['checkout', '-b', 'feat/x'], { cwd: dir, stdio: 'ignore' });
  for (const c of ['git merge main', 'git rebase main', 'git cherry-pick abc']) {
    assert.equal(awayGuard(dir, bash(dir, c, agent)), null, c);
  }
  assert.equal(awayGuard(dir, bash(dir, `git -C '${dir}' merge x`, agent)), null);
  spawnSync('git', ['checkout', 'main'], { cwd: dir, stdio: 'ignore' });
  assert.equal(awayGuard(dir, bash(dir, `cd /tmp && git -C '${dir}' merge x`, agent)).rule, 'R40');
  // an unknown branch counts as main: a merge in a folder that is not a git folder is refused
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-away-plain-'));
  const g = awayGuard(dir, bash(plain, 'git merge x', {}));
  assert.equal(g.rule, 'R40');
  assert.equal(g.refusal, NEUTRAL);
});

test('X9: an away file that cannot be read or parsed counts as set (R40)', (t) => {
  stateHome();
  const dir = project({ git: true });
  const vc = { agent_id: 'a-2', agent_type: 'guilda:version-control' };
  setAway(dir);
  if (process.getuid && process.getuid() !== 0) {
    fs.chmodSync(awayPath(dir), 0o000);
    for (const who of [vc, {}]) {
      const g = awayGuard(dir, bash(dir, 'git push', who));
      assert.equal(g.refusal, NEUTRAL);
      assert.equal(g.rule, 'R40');
    }
    fs.chmodSync(awayPath(dir), 0o600);
  } else {
    t.diagnostic('root: the mode 000 case is skipped');
  }
  fs.writeFileSync(awayPath(dir), '{ not json');
  assert.equal(awayGuard(dir, bash(dir, 'git push', vc)).rule, 'R40');
  fs.writeFileSync(awayPath(dir), '{"schemaVersion":2,"since":"x"}');
  assert.equal(awayGuard(dir, bash(dir, 'git push', vc)).rule, 'R40');
});

test('S5-28: set, status, clear by the script; a worktree shares the state; the project folder does not change', () => {
  const state = stateHome();
  const dir = project({ git: true });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  const before = fs.readdirSync(dir, { recursive: true }).sort();
  const env = { XDG_STATE_HOME: state };
  assert.deepEqual(cli(dir, ['status', '--session', 's-main'], env), { code: 0, out: 'away: no\n', err: '' });
  assert.deepEqual(cli(dir, ['set', '--session', 's-main'], env), { code: 0, out: 'away: set\n', err: '' });
  const set = cli(dir, ['status', '--session', 's-main'], env);
  assert.match(set.out, /^away: yes since \d{4}-\d\d-\d\dT[\d:.]+Z\n$/);
  assert.deepEqual(fs.readdirSync(dir, { recursive: true }).sort(), before);
  const folder = fs.readdirSync(path.join(state, 'guilda', 's'));
  assert.equal(folder.length, 1);
  assert.match(folder[0], /^[0-9a-f]{16}\.json$/);
  assert.equal(fs.statSync(awayPath(dir)).mode & 0o777, 0o600);
  // a worktree has the same state file
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda away wt ')), 'w');
  assert.equal(spawnSync('git', ['worktree', 'add', '-b', 'wt-branch', wt], { cwd: dir, stdio: 'ignore' }).status, 0);
  assert.equal(cli(wt, ['status', '--session', 's-main'], env).out, set.out);
  assert.deepEqual(cli(dir, ['clear', '--session', 's-main'], env), { code: 0, out: 'away: clear\n', err: '' });
  assert.equal(cli(wt, ['status', '--session', 's-main'], env).out, 'away: no\n');
  assert.deepEqual(fs.readdirSync(path.join(state, 'guilda', 's')), []);
});

test('the script refuses the session of a live claim, a bad usage and an unreadable claim', () => {
  const state = stateHome();
  const dir = project();
  const env = { XDG_STATE_HOME: state };
  writeClaim(dir, 's-sup');
  const refused = cli(dir, ['set', '--session', 's-sup'], env);
  assert.equal(refused.code, 1);
  assert.equal(refused.err, `${NEUTRAL}\n`);
  assert.equal(fs.existsSync(awayPath(dir)), false);
  assert.equal(cli(dir, ['set', '--session', 's-main'], env).code, 0);
  for (const args of [[], ['set'], ['set', '--session'], ['bogus', '--session', 's'], ['set', '--session', 's', '--until', '2030-01-01'], ['set', '--session', 'a b']]) {
    const r = cli(dir, args, env);
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.err, /^usage: /);
  }
  fs.writeFileSync(path.join(dir, '.guilda', 'queue', 'writer.json'), '{ not json');
  assert.equal(cli(dir, ['status', '--session', 's-main'], env).code, 1);
});
