import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { runWriter, writeClaimFile } from '../scripts/lib/queue.mjs';
import { resumeGuard, projectId, unitName, makeRecord, MIN_PAUSE_MIN } from '../scripts/lib/resume.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'resume.mjs');
const SESSION = '1010ec8e-1111-4222-8333-444455556666';
const SESSION2 = '2020ec8e-1111-4222-8333-444455556666';
const FUTURE = () => new Date(Date.now() + 3 * 3600000).toISOString();
const PAST = () => new Date(Date.now() - 60000).toISOString();
const ago = (dir, b, min = 31) => {
  // arm now refuses a past --at, so the test arms for 3 h and then moves notBefore into the past.
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(r.code, 0, r.out);
  const f = path.join(dir, '.guilda', 'resume', `${projectId(dir)}.json`);
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...rec, notBefore: new Date(Date.now() - min * 60000).toISOString() }));
  fs.writeFileSync(path.join(b, 'log'), '');
};
const armPast = (dir, b) => ago(dir, b, 1);

/** A folder of stand-in programs. Each one logs its arguments (and stdin for `at`) to `log`. */
function bins(list, { atJob = '7', claudeFail = false, noClaude = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda resume bins '));
  const names = noClaude || list.includes('claude') ? list : [...list, 'claude'];
  for (const n of names) {
    const body = n === 'claude' && claudeFail ? '#!/bin/sh\nexit 1\n' : n === 'at'
      ? `#!/bin/sh\nd="$(dirname "$0")"\nif [ "$1" = "-c" ]; then cat "$d/job-$2" 2>/dev/null; exit $?; fi\nprintf 'at %s\\n' "$*" >> "$d/log"\ncat > "$d/job-${atJob}"\ncat "$d/job-${atJob}" >> "$d/log"\nenv | grep '^GUILDA_RESUME' | sed 's/^/ENV /' >> "$(dirname "$0")/log"\necho "job ${atJob} at Mon" >&2\n`
      : n === 'cswap'
        ? '#!/bin/sh\ncat "$(dirname "$0")/cswap.json"\n'
        : `#!/bin/sh\nprintf '${n} %s\\n' "$*" >> "$(dirname "$0")/log"\n`;
    fs.writeFileSync(path.join(dir, n), body, { mode: 0o755 });
  }
  return dir;
}
const logOf = (b) => (fs.existsSync(path.join(b, 'log')) ? fs.readFileSync(path.join(b, 'log'), 'utf8') : '');

function resume(dir, args, b, extra = {}) {
  const env = { ...process.env, GUILDA_RESUME_BIN_DIR: b, GUILDA_RESUME_TEST: '1', ...extra };
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8', env });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const seed = (dir, events) => runWriter(dir, { now: '2026-11-20T10:00:00.000Z' }, ({ emit }) => {
  for (const e of events) emit({ t: '2026-11-20T10:00:00.000Z', ...e });
});
const LIMIT = [{ type: 'plan', slots: 2, work: 'w-00000001' }, { type: 'limit-stop', work: 'w-00000001', window: 'fiveHour', resetsAt: '2026-11-23T00:00:00Z' }];

const recFile = (dir) => path.join(dir, '.guilda', 'resume', `${projectId(dir)}.json`);
const recOf = (dir) => JSON.parse(fs.readFileSync(recFile(dir), 'utf8'));

test('arm calls systemd-run with AccuracySec=1s and the unit name, and writes the record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'at', 'atrm', 'claude']);
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(r.code, 0, r.out);
  const log = logOf(b);
  assert.match(log, /^systemd-run --user --on-active=\d+s --timer-property=AccuracySec=1s --unit=guilda-resume-[0-9a-f]{8} /m);
  assert.ok(log.includes(`--unit=${unitName(projectId(dir))}`));
  assert.ok(log.includes(`${dir} run ${projectId(dir)}`), log);
  assert.doesNotMatch(log, /^at /m);
  const rec = recOf(dir);
  assert.equal(rec.state, 'armed');
  assert.equal(rec.supervisorSession, SESSION);
  assert.equal(rec.method, 'systemd');
  assert.equal(rec.projectPath, fs.realpathSync(dir));
  assert.equal((fs.statSync(recFile(dir)).mode & 0o777), 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(recFile(dir))), [`${projectId(dir)}.json`]);
});

test('arm falls back to at when systemd-run is absent', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['at', 'atrm']);
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(r.code, 0, r.out);
  assert.match(logOf(b), /^at -t \d{12}$/m);
  assert.match(logOf(b), /resume\.mjs/);
  const rec = recOf(dir);
  assert.equal(rec.method, 'at');
  assert.equal(rec.job, '7');
});

test('arm with no trigger exits 1 with "refused: no trigger" and writes no record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['claude']);
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: no trigger/);
  assert.equal(fs.existsSync(recFile(dir)), false);
});

test('arm needs --at with a zone', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run']);
  const r = resume(dir, ['arm', '--session', SESSION, '--at', '2026-11-23T00:00:00'], b);
  assert.equal(r.code, 1);
  assert.equal(logOf(b), '');
});

test('arm again replaces the trigger: one armed record, the old timer is stopped', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  assert.equal(resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b).code, 0);
  assert.equal(resume(dir, ['arm', '--session', SESSION2, '--at', FUTURE()], b).code, 0);
  const log = logOf(b);
  assert.match(log, /^systemctl --user stop guilda-resume-[0-9a-f]{8}\.timer$/m);
  assert.equal((log.match(/^systemd-run /gm) ?? []).length, 2);
  assert.equal(recOf(dir).supervisorSession, SESSION2);
  assert.equal(fs.readdirSync(path.dirname(recFile(dir))).length, 1);
});

test('remove calls systemctl stop and marks the record removed', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  const r = resume(dir, ['remove', '--session', SESSION], b);
  assert.equal(r.code, 0, r.out);
  assert.ok(logOf(b).includes(`systemctl --user stop ${unitName(projectId(dir))}.timer`));
  assert.equal(recOf(dir).state, 'removed');
  assert.match(resume(dir, ['status'], b).out, /^removed /);
});

test('remove with an at job calls atrm', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['at', 'atrm']);
  resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(resume(dir, ['remove', '--session', SESSION], b).code, 0);
  assert.match(logOf(b), /^atrm 7$/m);
});

test('S5-15: run refuses another project, a missing record and a wrong id, and starts nothing', () => {
  const p1 = tempProject({ config: MINIMAL_CONFIG });
  const p2 = tempProject({ config: MINIMAL_CONFIG });
  const p3 = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  seed(p1, LIMIT);
  resume(p1, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  const before = fs.readFileSync(recFile(p1), 'utf8');
  // A copy of the record of p1 in p2 (under the id of p2, and under the id of p1).
  fs.mkdirSync(path.dirname(recFile(p2)), { recursive: true });
  fs.writeFileSync(recFile(p2), before);
  fs.writeFileSync(path.join(path.dirname(recFile(p2)), `${projectId(p1)}.json`), before);
  seed(p2, LIMIT);
  const copy = fs.readFileSync(recFile(p2), 'utf8');
  fs.writeFileSync(b + '/log', '');
  const r1 = resume(p2, ['run', projectId(p2)], b);
  assert.equal(r1.code, 5);
  assert.match(r1.out, /refused: project mismatch/);
  const r2 = resume(p2, ['run', projectId(p1)], b);
  assert.equal(r2.code, 5);
  assert.match(r2.out, /refused: project mismatch/);
  const r3 = resume(p3, ['run', projectId(p3)], b);
  assert.equal(r3.code, 5);
  assert.match(r3.out, /refused: no armed record/);
  const r4 = resume(p1, ['run', 'deadbeef'], b);
  assert.equal(r4.code, 5);
  assert.match(r4.out, /refused: project mismatch/);
  assert.equal(logOf(b), '');
  assert.equal(fs.readFileSync(recFile(p1), 'utf8'), before);
  assert.equal(fs.readFileSync(recFile(p2), 'utf8'), copy);
});

test('S5-17: a restart is not a limit stop', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  seed(dir, [
    { type: 'plan', slots: 2, work: 'w-00000001' },
    { type: 'task', task: 'T1', work: 'w-00000001', title: 'x' },
    { type: 'state', task: 'T1', from: 'pending', to: 'ready', cause: 'session-ended' },
  ]);
  armPast(dir, b);
  const before = fs.readFileSync(recFile(dir), 'utf8');
  fs.writeFileSync(b + '/log', '');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 5);
  assert.match(r.out, /refused: not a limit stop/);
  assert.equal(logOf(b), '');
  assert.equal(fs.readFileSync(recFile(dir), 'utf8'), before);
});

test('S5-16: run waits when no account has usage and arms the next reset', () => {
  const dir = tempProject({ config: { ...MINIMAL_CONFIG, usage: { source: 'cswap' } } });
  const b = bins(['systemd-run', 'systemctl', 'claude', 'cswap']);
  const next = new Date(Date.now() + 5 * 3600000).toISOString();
  fs.writeFileSync(path.join(b, 'cswap.json'), JSON.stringify({
    schemaVersion: 1, status: 'ok', advice: 'blocked',
    fleet: { accounts: 1, capacityUnits: 10, remainingUnits: 0, usableNow: 0, nextUsableAt: next },
    resets: [{ at: next }],
    accounts: [{ id: 'a', fiveHour: { usedPercent: 100, resetsAt: next }, sevenDay: { usedPercent: 100, resetsAt: next } }],
  }));
  seed(dir, LIMIT);
  armPast(dir, b);
  fs.writeFileSync(b + '/log', '');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  const log = logOf(b);
  assert.doesNotMatch(log, /^claude /m);
  assert.equal((log.match(/^systemd-run /gm) ?? []).length, 1);
  const rec = recOf(dir);
  assert.equal(rec.state, 'armed');
  assert.equal(rec.notBefore, next);
});

test('run resumes the session by claude with -p, removes the trigger, and counts usage state off as unknown', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  seed(dir, LIMIT);
  armPast(dir, b);
  fs.writeFileSync(b + '/log', '');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  const log = logOf(b);
  assert.match(log, new RegExp(`^claude --resume ${SESSION} -p .+`, 'm'));
  assert.match(log, /^systemctl --user stop guilda-resume-[0-9a-f]{8}\.timer$/m);
  assert.equal(recOf(dir).state, 'resumed');
});

test('run with a claude that fails sets waiting-user and exits 0', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl'], { claudeFail: true });
  seed(dir, LIMIT);
  armPast(dir, b);
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  assert.equal(recOf(dir).state, 'waiting-user');
});

test('resumeGuard: R41 cases', () => {
  const p1 = tempProject({ config: MINIMAL_CONFIG });
  const p2 = tempProject({ config: MINIMAL_CONFIG });
  const id = projectId(p1);
  const call = (dir, c) => resumeGuard(dir, c).allow;
  const q = (p) => `'${p}'`;
  assert.equal(call(p1, `node /x/scripts/resume.mjs ${q(p1)} run ${id}`), true);
  assert.equal(call(p1, `node /x/scripts/resume.mjs ${q(p2)} run ${id}`), false);
  assert.equal(call(p1, `cd ${q(p2)} && node /x/scripts/resume.mjs . run ${id}`), false, 'a relative path is refused, because a cd can change it');
  assert.equal(call(p1, `node /x/scripts/resume.mjs $P run ${id}`), false);
  assert.equal(call(p1, `node /x/scripts/resume.mjs run`), false);
  assert.equal(call(p1, `node /x/scripts/resume.mjs ${q(p2)} status`), true);
  assert.equal(call(p1, `node /x/scripts/resume.mjs ${q(p2)} arm --session s --at 2026-11-23T00:00:00Z`), true);
  assert.equal(call(p1, 'ls -la'), true);
  assert.equal(call(p1, undefined), true);
  assert.equal(call(path.join(p1, 'missing'), `node resume.mjs ${q(p1)} run ${id}`), false);
});

test('F1: a session id that is not a UUID is refused by arm and remove', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  for (const s of ['--dangerously-skip-permissions', 's-0001', `${SESSION} -x`]) {
    const r = resume(dir, ['arm', '--session', s, '--at', FUTURE()], b);
    assert.equal(r.code, 1, s);
  }
  assert.equal(resume(dir, ['remove', '--session', 'bad'], b).code, 1);
  assert.equal(logOf(b), '');
  assert.equal(fs.existsSync(recFile(dir)), false);
});

test('F1: an edited record with an option token as session never reaches the claude argv', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  seed(dir, LIMIT);
  armPast(dir, b);
  const rec = recOf(dir);
  fs.writeFileSync(recFile(dir), JSON.stringify({ ...rec, supervisorSession: '--dangerously-skip-permissions' }));
  fs.writeFileSync(b + '/log', '');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 5);
  assert.match(r.out, /refused: no armed record/);
  assert.equal(logOf(b), '');
});

test('F2: stop uses only the unit of this project and only a numeric at job', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'at', 'atrm']);
  resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  fs.writeFileSync(recFile(dir), JSON.stringify({ ...recOf(dir), unit: 'ssh' }));
  fs.writeFileSync(b + '/log', '');
  assert.equal(resume(dir, ['remove', '--session', SESSION], b).code, 0);
  assert.equal(logOf(b).trim(), `systemctl --user stop ${unitName(projectId(dir))}.timer`);
  const d2 = tempProject({ config: MINIMAL_CONFIG });
  const b2 = bins(['at', 'atrm']);
  resume(d2, ['arm', '--session', SESSION, '--at', FUTURE()], b2);
  fs.writeFileSync(recFile(d2), JSON.stringify({ ...recOf(d2), job: '1 -x' }));
  fs.writeFileSync(b2 + '/log', '');
  assert.equal(resume(d2, ['remove', '--session', SESSION], b2).code, 0);
  assert.doesNotMatch(logOf(b2), /atrm/);
});

test('run compares the id with the project before it reads any record', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  const r = resume(dir, ['run', '../../etc/passwd'], b);
  assert.equal(r.code, 5);
  assert.match(r.out, /refused: project mismatch/);
});

test('run does nothing before notBefore', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl', 'claude']);
  seed(dir, LIMIT);
  resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  const before = fs.readFileSync(recFile(dir), 'utf8');
  fs.writeFileSync(b + '/log', '');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  assert.equal(logOf(b), '');
  assert.equal(fs.readFileSync(recFile(dir), 'utf8'), before);
});

test('the at fallback refuses a path with $, a backtick or a newline', () => {
  for (const bad of ['a$b', 'a`b', 'a\nb']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `guilda ${bad} `));
    const b = bins(['at', 'atrm']);
    const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
    assert.equal(r.code, 1, JSON.stringify(bad));
    assert.match(r.out, /refused: no trigger/);
    assert.equal(logOf(b), '');
  }
});

test('the seam needs GUILDA_RESUME_TEST=1, and neither variable reaches the at job', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['at', 'atrm']);
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b, { GUILDA_RESUME_TEST: null });
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: test seam/);
  assert.equal(logOf(b), '');
  assert.equal(resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b).code, 0);
  assert.doesNotMatch(logOf(b), /^ENV /m);
});

test('at: a reset 3 days away keeps its date', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['at', 'atrm']);
  const when = new Date(Date.now() + 3 * 86400000);
  assert.equal(resume(dir, ['arm', '--session', SESSION, '--at', when.toISOString()], b).code, 0);
  const p2 = (n) => String(n).padStart(2, '0');
  const m = /^at -t (\d{12})$/m.exec(logOf(b));
  assert.ok(m, logOf(b));
  const got = new Date(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[1].slice(8, 10), +m[1].slice(10, 12));
  assert.ok(Math.abs(got - when) <= 60000, `${m[1]} vs ${when.toISOString()} ${p2(0)}`);
});

test('at: a foreign job number is not removed, an own job is', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['at', 'atrm']);
  resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  fs.writeFileSync(path.join(b, 'job-9'), 'rm -rf /tmp/other\n');
  fs.writeFileSync(recFile(dir), JSON.stringify({ ...recOf(dir), job: '9' }));
  fs.writeFileSync(b + '/log', '');
  assert.equal(resume(dir, ['remove', '--session', SESSION], b).code, 0);
  assert.doesNotMatch(logOf(b), /atrm/);
  const b2 = bins(['at', 'atrm']);
  const d2 = tempProject({ config: MINIMAL_CONFIG });
  resume(d2, ['arm', '--session', SESSION, '--at', FUTURE()], b2);
  assert.equal(resume(d2, ['remove', '--session', SESSION], b2).code, 0);
  assert.match(logOf(b2), /^atrm 7$/m);
});

// The limit-stop events of these tests are seeded in the journal: the tick record that writes them lands in another task.

test('review 2: a live claim of the same session means session live, and nothing starts', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  seed(dir, LIMIT);
  armPast(dir, b);
  writeClaimFile(dir, { session: SESSION, ttlSec: 600, aliveAt: new Date().toISOString(), pid: process.pid });
  const before = fs.readFileSync(recFile(dir), 'utf8');
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /session live/);
  assert.equal(logOf(b), '');
  assert.equal(fs.readFileSync(recFile(dir), 'utf8'), before);
});

test('review 2: a live claim of another session gives waiting-user, and claude does not start', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  seed(dir, LIMIT);
  armPast(dir, b);
  writeClaimFile(dir, { session: SESSION2, ttlSec: 600, aliveAt: new Date().toISOString(), pid: process.pid });
  const r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 0, r.out);
  assert.equal(recOf(dir).state, 'waiting-user');
  assert.doesNotMatch(logOf(b), /^claude /m);
});

test('review 2: an expired claim lets the run go on', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  seed(dir, LIMIT);
  armPast(dir, b);
  writeClaimFile(dir, { session: SESSION2, ttlSec: 60, aliveAt: new Date(Date.now() - 3600000).toISOString(), pid: process.pid });
  assert.equal(resume(dir, ['run', projectId(dir)], b).code, 0);
  assert.match(logOf(b), /^claude --resume /m);
});

test('review 3: systemd-run gets --expand-environment=no', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run']);
  assert.equal(resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b).code, 0);
  assert.match(logOf(b), /--unit=guilda-resume-[0-9a-f]{8} --expand-environment=no /);
});

test('review 3: the record keeps the absolute claude path, and run uses only that path', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  seed(dir, LIMIT);
  armPast(dir, b);
  assert.equal(recOf(dir).claude, path.join(b, 'claude'));
  const rec = recOf(dir);
  // A relative name in the record is refused.
  fs.writeFileSync(recFile(dir), JSON.stringify({ ...rec, claude: 'claude' }));
  let r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 5);
  assert.match(r.out, /refused: no armed record/);
  // An absolute path to a file that is not there is refused, and the record stays armed.
  fs.writeFileSync(recFile(dir), JSON.stringify({ ...rec, claude: path.join(b, 'gone', 'claude') }));
  r = resume(dir, ['run', projectId(dir)], b);
  assert.equal(r.code, 5);
  assert.match(r.out, /refused: no claude/);
  assert.equal(recOf(dir).state, 'armed');
  assert.equal(logOf(b), '');
});

test('review 3: arm refuses when claude cannot be found', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run'], { noClaude: true });
  const r = resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: no claude/);
  assert.equal(logOf(b), '');
});

test('review 4: arm refuses an --at less than 30 minutes ahead and one in the past', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run']);
  for (const at of [PAST(), new Date(Date.now() + MIN_PAUSE_MIN * 60000 - 60000).toISOString()]) {
    const r = resume(dir, ['arm', '--session', SESSION, '--at', at], b);
    assert.equal(r.code, 1, at);
    assert.match(r.out, /refused: --at must be at least 30 minutes ahead/);
  }
  assert.equal(logOf(b), '');
  assert.equal(fs.existsSync(recFile(dir)), false);
});

test('review 4: when arm fails after it stopped the old trigger, the record is removed, not armed', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const b = bins(['systemd-run', 'systemctl']);
  assert.equal(resume(dir, ['arm', '--session', SESSION, '--at', FUTURE()], b).code, 0);
  const b2 = bins(['systemctl']);
  const r = resume(dir, ['arm', '--session', SESSION2, '--at', FUTURE()], b2);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: no trigger/);
  assert.match(logOf(b2), /systemctl --user stop/);
  assert.equal(recOf(dir).state, 'removed');
});

test('pure parts: unit name, record form, pause limit', () => {
  assert.equal(unitName('abcd1234'), 'guilda-resume-abcd1234');
  const rec = makeRecord({ id: 'abcd1234', projectPath: '/p', session: 's', notBefore: '2026-11-23T00:00:00Z', method: 'systemd', claude: '/bin/claude', now: '2026-11-22T00:00:00Z' });
  assert.deepEqual(Object.keys(rec).sort(), ['claude', 'createdAt', 'id', 'job', 'method', 'notBefore', 'projectPath', 'schemaVersion', 'state', 'supervisorSession', 'unit']);
  assert.equal(rec.state, 'armed');
  assert.equal(rec.unit, 'guilda-resume-abcd1234');
  assert.equal(MIN_PAUSE_MIN, 30);
});
