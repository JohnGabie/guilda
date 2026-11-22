// Integration B: one end-to-end call of the real PreToolUse hook script for each 0.5.0 guard.
// S5-15 (R41 hook part), S5-18 to S5-22, S5-25, S5-28 to S5-32.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, MINIMAL_CONFIG, tempProject } from './helpers.mjs';
import { writeUserRecord } from '../scripts/lib/records.mjs';
import { setAway } from '../scripts/lib/away.mjs';
import { readMailbox } from '../scripts/lib/bus.mjs';
import { main as councilMain, JUDGE } from '../scripts/council.mjs';

const HOOK = path.join(REPO_ROOT, 'scripts', 'hooks', 'pre-tool-use.mjs');
const NEUTRAL = 'This waits. Go on with the rest.';
const SX = 'guilda:security-executor';
const SEC = 'guilda:security-lead';
const DEVOPS = 'guilda:devops-advisor';

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-wiring-state-'));
process.env.XDG_STATE_HOME = state;

// Each folder that this file creates is removed in after(); nothing else is.
const made = [state];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const project = () => {
  const dir = fs.realpathSync(tempProject({ config: MINIMAL_CONFIG, git: true }));
  made.push(dir);
  return dir;
};

/** Run the real hook script with the input on stdin. */
function hook(dir, input, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's-main', cwd: dir, ...input }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT, CLAUDE_CODE_ENTRYPOINT: 'cli', ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
}
const bash = (command, who = {}) => ({ tool_name: 'Bash', tool_input: { command }, ...who });
const agent = (type) => ({ agent_id: 'a-1', agent_type: type });
const violations = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, '.guilda', 'violations.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const refused = (out) => {
  assert.ok(out, 'a refusal is expected');
  assert.equal(out.permissionDecision, 'deny');
  return out.permissionDecisionReason;
};

test('matcher: the first PreToolUse entry reaches the eight tools of X6', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = hooks.PreToolUse.find((e) => e.hooks.some((h) => h.args.some((a) => a.endsWith('hooks/pre-tool-use.mjs'))));
  assert.deepEqual(entry.matcher.split('|').sort(), ['Agent', 'Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Skill', 'Write']);
});

test('S5-19: R37 through the hook, with the rule ID in the record and no command text', () => {
  const dir = project();
  const out = refused(hook(dir, bash('curl http://example.com/x', agent(SX))));
  assert.match(out, /^R37:/);
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R37']);
  assert.equal(JSON.stringify(violations(dir)).includes('example.com'), false);
  assert.equal(hook(dir, bash('curl http://example.com/x', agent('guilda:executor'))), null);
  assert.equal(hook(dir, { tool_name: 'Read', tool_input: { file_path: path.join(dir, 'a.js') }, ...agent(SX) }), null);
  assert.match(refused(hook(dir, { tool_name: 'Skill', tool_input: { skill: 'x' }, ...agent(SX) })), /^R37:/);
});

test('S5-29: R39 refuses a read of the away folder for an agent, with the neutral text and the rule in the record', () => {
  const dir = project();
  setAway(dir);
  const away = path.join(state, 'guilda', 's');
  const text = refused(hook(dir, { tool_name: 'Glob', tool_input: { pattern: `${away}/**` }, ...agent('guilda:executor') }));
  assert.equal(text, NEUTRAL);
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R39']);
  assert.equal(refused(hook(dir, bash('cat ' + away + '/s/x.json', agent('guilda:executor')))), NEUTRAL);
  assert.equal(hook(dir, { tool_name: 'Glob', tool_input: { pattern: 'src/**' }, ...agent('guilda:executor') }), null);
});

test('S5-30: R40 refuses a publish while away; the Architect gets the reason, other callers get a notice', () => {
  const dir = project();
  setAway(dir);
  const arch = hook(dir, bash('git push origin x'));
  assert.equal(arch.permissionDecisionReason, NEUTRAL);
  assert.match(arch.additionalContext, /^R40:/);
  assert.deepEqual(readMailbox(dir, 'architect'), []);
  const other = hook(dir, bash('gh pr create', agent('guilda:version-control')));
  assert.equal(other.permissionDecisionReason, NEUTRAL);
  assert.equal(other.additionalContext, undefined);
  const lines = readMailbox(dir, 'architect');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'guilda:version-control was refused: gh pr create');
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R40', 'R40']);
  assert.equal(JSON.stringify(violations(dir)).includes('origin'), false);
});

test('S5-30: with no away file the Architect side passes and an agent is still refused', () => {
  const dir = project();
  assert.equal(hook(dir, bash('git status')), null);
  const out = hook(dir, bash('gh release create v1', agent('guilda:version-control')));
  assert.equal(out.permissionDecisionReason, NEUTRAL);
});

test('S5-15: R41 refuses a resume run of another project and allows the own project', () => {
  const dir = project();
  const other = project();
  const resume = path.join(REPO_ROOT, 'scripts', 'resume.mjs');
  assert.match(refused(hook(dir, bash(`node ${resume} '${other}' run abc`))), /^R41:/);
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R41']);
  assert.equal(hook(dir, bash(`node ${resume} '${dir}' run abc`)), null);
});

// ---- the council ----
const council = (dir, ...args) => councilMain(args, { cwd: dir, env: { ...process.env, XDG_STATE_HOME: state, CLAUDE_PROJECT_DIR: '' } });

function openCouncil(dir) {
  fs.writeFileSync(path.join(dir, 'q.md'), 'Which database?\n');
  const rec = writeUserRecord(dir, { session: 's1', kind: 'answer', text: 'Yes, open the council.', question: 'open?' }, { ...process.env, XDG_STATE_HOME: state });
  const r = council(dir, 'open', '--question', 'q.md', '--members', `${SEC},${DEVOPS}`, '--format', 'debate', '--record', rec.id);
  assert.equal(r.code, 0, r.lines.join('\n'));
  const id = r.lines[0];
  assert.equal(council(dir, 'say', '--id', id, '--from', JUDGE, '--type', 'open').code, 0);
  assert.equal(council(dir, 'say', '--id', id, '--from', JUDGE, '--type', 'floor', '--to', SEC).code, 0);
  return id;
}
const claim = (id, from) =>
  `node ${REPO_ROOT}/scripts/council.mjs say --id ${id} --from ${from} --type claim --claim x --evidence y --reason z`;

test('S5-25: council say is bound to the caller (R34) and to the floor (CNL1)', () => {
  const dir = project();
  const id = openCouncil(dir);
  // The holder, as itself: passes.
  assert.equal(hook(dir, bash(claim(id, SEC), agent(SEC))), null);
  // A caller of another type, with the --from of the holder: R34.
  assert.match(refused(hook(dir, bash(claim(id, SEC), agent('guilda:executor')))), /^R34:/);
  // The caller that does not hold the floor, as itself: CNL1.
  assert.match(refused(hook(dir, bash(claim(id, DEVOPS), agent(DEVOPS)))), /^CNL1:/);
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R34', 'CNL1']);
  // An unreadable channel refuses.
  assert.match(refused(hook(dir, bash(claim('council-ffff', SEC), agent(SEC)))), /^CNL1:/);
  // The Judge only from its own type; the user only from the typed main session.
  const judgeSay = `node ${REPO_ROOT}/scripts/council.mjs say --id ${id} --from ${JUDGE} --type close`;
  assert.match(refused(hook(dir, bash(judgeSay, agent(SEC)))), /^R34:/);
  assert.equal(hook(dir, bash(judgeSay, agent(JUDGE))), null);
  const userSay = `node ${REPO_ROOT}/scripts/council.mjs say --id ${id} --from user --type decision --decision a --why b --record u-00000001`;
  assert.match(refused(hook(dir, bash(userSay, agent(SEC)))), /^R34:/);
  assert.match(refused(hook(dir, bash(userSay), { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' })), /^R34:/);
  assert.equal(hook(dir, bash(userSay), { CLAUDE_CODE_ENTRYPOINT: 'cli' }), null);
  // The Architect only from the main session with no agent_id.
  const archSay = `node ${REPO_ROOT}/scripts/council.mjs say --id ${id} --from architect --type decision --decision a --why b`;
  assert.equal(hook(dir, bash(archSay)), null);
  assert.match(refused(hook(dir, bash(archSay, agent('guilda:executor')))), /^R34:/);
});

test('S5-25: a Write to the council file is refused with R34', () => {
  const dir = project();
  const id = openCouncil(dir);
  assert.match(refused(hook(dir, { tool_name: 'Write', tool_input: { file_path: path.join(dir, '.guilda', 'bus', `${id}.jsonl`), content: 'x' } })), /^R34:/);
});

test('S5-30: council open is refused while away (R40)', () => {
  const dir = project();
  setAway(dir);
  const out = hook(dir, bash(`node ${REPO_ROOT}/scripts/council.mjs open --question q.md --members a --format debate --record u-1`));
  assert.equal(out.permissionDecisionReason, NEUTRAL);
  assert.match(out.additionalContext, /council open/);
});

test('S5-22: the Security Lead is refused the R4 shell write forms, and reads pass', () => {
  const dir = project();
  assert.match(refused(hook(dir, bash('echo x > a.js', agent(SEC)))), /^R4:/);
  assert.match(refused(hook(dir, bash('cp a b', agent(SEC)))), /^R4:/);
  assert.deepEqual(violations(dir).map((v) => v.rule), ['R4', 'R4']);
  assert.equal(hook(dir, bash('echo x > a.js', agent('guilda:executor'))), null);
  assert.equal(hook(dir, bash('git log --oneline 2>/dev/null', agent(SEC))), null);
});

test('a hook error fails closed for the 0.5.0 guards', () => {
  const dir = project();
  const out = hook(dir, bash('echo hi'), { GUILDA_TEST_HOOK_THROW: '1' });
  assert.match(refused(out), /^R32:/);
});
