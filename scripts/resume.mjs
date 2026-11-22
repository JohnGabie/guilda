#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJournal, readClaim } from './lib/queue.mjs';
import { projectState } from './lib/project.mjs';
import { readUsage } from './lib/usage.mjs';
import { paceOf } from './lib/pace.mjs';
import {
  MIN_PAUSE_MIN, validClaudePath, BIN_DIR_ENV, TEST_ENV, SESSION_UUID, JOB_ID, RESUME_PROMPT, TIMER_ACCURACY, mainRoot, projectId, unitName, makeRecord, readRecord, writeRecord,
} from './lib/resume.mjs';

const SELF = fileURLToPath(import.meta.url);
const USAGE = 'usage: node scripts/resume.mjs <projectDir> (arm --session <id> --at <ISO with zone> | remove --session <id> | status | run <record id>)';
const ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

const out = (s) => process.stdout.write(`${s}\n`);
const fail = (code, s) => {
  process.stderr.write(`${s}\n`);
  process.exit(code);
};

/** Find a program: only in the seam folder when it is set, else on PATH (and ~/.local/bin). Absolute path or null. */
function findBin(name) {
  const seam = process.env[BIN_DIR_ENV];
  const dirs = seam ? [seam] : [...(process.env.PATH ?? '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin')];
  for (const d of dirs) {
    if (!d) continue;
    const f = path.join(d, name);
    try {
      fs.accessSync(f, fs.constants.X_OK);
      if (fs.statSync(f).isFile()) return path.resolve(f);
    } catch { /* next */ }
  }
  return null;
}

/** The env of each child: no seam variable reaches a timer or an at job. */
const cleanEnv = () => {
  const env = { ...process.env };
  delete env[BIN_DIR_ENV];
  delete env[TEST_ENV];
  return env;
};
const call = (bin, args, input) => spawnSync(bin, args, { encoding: 'utf8', shell: false, input, timeout: 30000, env: cleanEnv() });

/** Stop the trigger of a record, by its own method. It stops only the unit of this project. Never throws. */
function stopTrigger(record, id) {
  if (record.method === 'systemd') {
    const bin = findBin('systemctl');
    if (bin) call(bin, ['--user', 'stop', `${unitName(id)}.timer`]);
  } else if (record.method === 'at' && JOB_ID.test(String(record.job ?? ''))) {
    const bin = findBin('atrm');
    const at = findBin('at');
    // Remove only a job that is ours: its text holds the path of this script and the project id.
    const text = at ? call(at, ['-c', String(record.job)]) : null;
    if (bin && text && text.status === 0 && text.stdout.includes(SELF) && text.stdout.includes(id)) {
      call(bin, [String(record.job)]);
    }
  }
}

/** Set one trigger. Returns { method, job } or null (no method works). */
function setTrigger(projectDir, id, whenMs) {
  const secs = Math.max(1, Math.ceil((whenMs - Date.now()) / 1000));
  const cmd = [process.execPath, SELF, projectDir, 'run', id];
  const sd = findBin('systemd-run');
  if (sd) {
    const r = call(sd, ['--user', `--on-active=${secs}s`, `--timer-property=AccuracySec=${TIMER_ACCURACY}`, `--unit=${unitName(id)}`, '--expand-environment=no', ...cmd]);
    if (r.status === 0) return { method: 'systemd', job: null };
  }
  const at = findBin('at');
  // The at job runs through sh: a path with $, a backtick or a newline could expand. Refuse it.
  if (at && !cmd.some((w) => /[$`\n]/.test(w))) {
    // `at -t CCYYMMDDhhmm`, in local time, rounded up to the next minute: it keeps a reset more than 24 h away.
    const d = new Date(Math.ceil(whenMs / 60000) * 60000);
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`;
    const quoted = cmd.map((w) => `'${w.replace(/'/g, `'\\''`)}'`).join(' ');
    const r = call(at, ['-t', stamp],`${quoted}\n`);
    if (r.status === 0) {
      const m = /job\s+(\d+)/.exec(`${r.stderr}${r.stdout}`);
      return { method: 'at', job: m ? m[1] : null };
    }
  }
  return null;
}

function arm(projectDir, root, id, session, at) {
  const ms = Date.parse(at ?? '');
  if (!session || !at || !ZONE.test(at) || Number.isNaN(ms)) fail(1, 'invalid arguments: need --session and --at with a zone');
  if (!SESSION_UUID.test(session)) fail(1, 'invalid session id');
  if (ms - Date.now() < MIN_PAUSE_MIN * 60000) fail(1, `refused: --at must be at least ${MIN_PAUSE_MIN} minutes ahead`);
  const claude = findBin('claude');
  if (!claude || !validClaudePath(claude)) fail(1, 'refused: no claude');
  const old = readRecord(projectDir, id);
  if (old && old.state === 'armed') {
    stopTrigger(old, id);
    // The old trigger is gone: the old record must not stay armed, whatever happens next.
    writeRecord(projectDir, { ...old, state: 'removed' });
  }
  const trig = setTrigger(projectDir, id, ms);
  if (!trig) fail(1, 'refused: no trigger');
  writeRecord(projectDir, makeRecord({ id, projectPath: root, session, notBefore: ms, method: trig.method, job: trig.job, claude, now: Date.now() }));
  out(`armed ${id} ${new Date(ms).toISOString()}`);
}

function remove(projectDir, id) {
  const rec = readRecord(projectDir, id);
  if (!rec) fail(5, 'refused: no armed record');
  if (rec.state === 'armed') stopTrigger(rec, id);
  writeRecord(projectDir, { ...rec, state: 'removed' });
  out(`removed ${id}`);
}

/** Is the last stop of the journal a limit stop (G5)? A restart is not. */
function lastStopIsLimit(projectDir) {
  const { events } = readJournal(projectDir);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'limit-stop') return true;
    if (e.type === 'state' && e.cause === 'session-ended') return false;
  }
  return false;
}

function run(projectDir, root, id) {
  // Steps 1 to 3 (R41): the record belongs to this folder, the folder exists, the state is armed. A read error refuses.
  if (id !== projectId(projectDir)) fail(5, 'refused: project mismatch');
  const rec = readRecord(projectDir, id);
  if (!rec || rec.state !== 'armed') fail(5, 'refused: no armed record');
  if (rec.projectPath !== root || rec.id !== id || rec.unit !== unitName(id)) fail(5, 'refused: project mismatch');
  // The at fallback can fire early: do nothing before notBefore.
  if (Date.now() < Date.parse(rec.notBefore)) {
    out(`too early ${id} ${rec.notBefore}`);
    return;
  }
  // Step 4: a restart is not a limit stop.
  let limit = false;
  try { limit = lastStopIsLimit(projectDir); } catch { limit = false; }
  if (!limit) fail(5, 'refused: not a limit stop');
  // The claim: a live claim of this session means the first supervisor still runs. Another session holds the queue.
  const claim = readClaim(projectDir);
  if (claim && claim.live) {
    if (claim.session === rec.supervisorSession) {
      out(`session live ${id}`);
      return;
    }
    stopTrigger(rec, id);
    writeRecord(projectDir, { ...rec, state: 'waiting-user' });
    out('the work can go on; start the supervisor');
    return;
  }
  // Step 5: no usage left means a new trigger for the next reset. Off or error counts as unknown, so go on.
  const st = projectState(projectDir);
  const cswap = findBin('cswap');
  const usage = readUsage(st.config, cswap && process.env[BIN_DIR_ENV]
    ? { run: (_f, a, o) => spawnSync(cswap, a, { ...o, shell: false, encoding: 'utf8', env: cleanEnv() }) }
    : undefined);
  const pace = paceOf(usage, { planSlots: 1 });
  if (pace.slots === 0) {
    const when = Date.parse(pace.resumeAt);
    stopTrigger(rec, id);
    const trig = setTrigger(projectDir, id, when);
    if (!trig) fail(1, 'refused: no trigger');
    writeRecord(projectDir, { ...rec, method: trig.method, job: trig.job, notBefore: new Date(when).toISOString() });
    out(`waiting ${id} ${new Date(when).toISOString()}`);
    return;
  }
  // Step 6: resume the session of the record (the same session_id, L5-2), then remove the trigger.
  const claude = rec.claude;
  if (!validClaudePath(claude)) fail(5, 'refused: no claude');
  writeRecord(projectDir, { ...rec, state: 'resumed' });
  stopTrigger(rec, id);
  const r = claude
    ? spawnSync(claude, ['--resume', rec.supervisorSession, '-p', RESUME_PROMPT], { cwd: root, shell: false, stdio: 'ignore', env: cleanEnv() })
    : { status: 1 };
  if (r.status !== 0) {
    writeRecord(projectDir, { ...rec, state: 'waiting-user' });
    out('the work can go on; start the supervisor');
    return;
  }
  out(`resumed ${id}`);
}

function main(argv) {
  const [dir, cmd, ...rest] = argv;
  if (!dir || !cmd) fail(1, USAGE);
  if (process.env[BIN_DIR_ENV] && process.env[TEST_ENV] !== '1') fail(1, 'refused: test seam');
  const flag = (n) => {
    const i = rest.indexOf(n);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  let projectDir;
  try { projectDir = fs.realpathSync(dir); } catch { fail(5, 'refused: project mismatch'); }
  const root = mainRoot(projectDir);
  const id = projectId(projectDir);
  if (root === null || id === null) fail(5, 'refused: project mismatch');
  try {
    if (cmd === 'arm') arm(projectDir, root, id, flag('--session'), flag('--at'));
    else if (cmd === 'remove') {
      if (!SESSION_UUID.test(flag('--session') ?? '')) fail(1, 'invalid session id');
      remove(projectDir, id);
    } else if (cmd === 'status') {
      const r = readRecord(projectDir, id);
      out(r ? `${r.state} ${id} ${r.notBefore} ${r.method}` : 'none');
    } else if (cmd === 'run') {
      if (rest[0] === undefined) fail(1, USAGE);
      run(projectDir, root, rest[0]);
    } else fail(1, USAGE);
  } catch (err) {
    fail(2, `I/O error: ${err?.message ?? err}`);
  }
}

main(process.argv.slice(2));
