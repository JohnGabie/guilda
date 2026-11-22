#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJournal } from './lib/queue.mjs';
import { projectState } from './lib/project.mjs';
import { readUsage } from './lib/usage.mjs';
import { paceOf } from './lib/pace.mjs';
import {
  BIN_DIR_ENV, RESUME_PROMPT, TIMER_ACCURACY, mainRoot, projectId, unitName, makeRecord, readRecord, writeRecord,
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

const call = (bin, args, input) => spawnSync(bin, args, { encoding: 'utf8', shell: false, input, timeout: 30000 });

/** Stop the trigger of a record, by its own method. Never throws. */
function stopTrigger(record) {
  if (record.method === 'systemd') {
    const bin = findBin('systemctl');
    if (bin) call(bin, ['--user', 'stop', `${record.unit}.timer`]);
  } else if (record.method === 'at' && record.job) {
    const bin = findBin('atrm');
    if (bin) call(bin, [String(record.job)]);
  }
}

/** Set one trigger. Returns { method, job } or null (no method works). */
function setTrigger(projectDir, id, whenMs) {
  const secs = Math.max(1, Math.ceil((whenMs - Date.now()) / 1000));
  const cmd = [process.execPath, SELF, projectDir, 'run', id];
  const sd = findBin('systemd-run');
  if (sd) {
    const r = call(sd, ['--user', `--on-active=${secs}s`, `--timer-property=AccuracySec=${TIMER_ACCURACY}`, `--unit=${unitName(id)}`, ...cmd]);
    if (r.status === 0) return { method: 'systemd', job: null };
  }
  const at = findBin('at');
  if (at) {
    const d = new Date(whenMs);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const quoted = cmd.map((w) => `'${w.replace(/'/g, `'\\''`)}'`).join(' ');
    const r = call(at, [hhmm], `${quoted}\n`);
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
  const old = readRecord(projectDir, id);
  if (old && old.state === 'armed') stopTrigger(old);
  const trig = setTrigger(projectDir, id, ms);
  if (!trig) fail(1, 'refused: no trigger');
  writeRecord(projectDir, makeRecord({ id, projectPath: root, session, notBefore: ms, method: trig.method, job: trig.job, now: Date.now() }));
  out(`armed ${id} ${new Date(ms).toISOString()}`);
}

function remove(projectDir, id) {
  const rec = readRecord(projectDir, id);
  if (!rec) fail(5, 'refused: no armed record');
  if (rec.state === 'armed') stopTrigger(rec);
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
  const rec = readRecord(projectDir, id);
  if (!rec || rec.state !== 'armed') fail(5, 'refused: no armed record');
  if (rec.projectPath !== root || rec.id !== id || id !== projectId(projectDir)) fail(5, 'refused: project mismatch');
  // Step 4: a restart is not a limit stop.
  let limit = false;
  try { limit = lastStopIsLimit(projectDir); } catch { limit = false; }
  if (!limit) fail(5, 'refused: not a limit stop');
  // Step 5: no usage left means a new trigger for the next reset. Off or error counts as unknown, so go on.
  const st = projectState(projectDir);
  const cswap = findBin('cswap');
  const usage = readUsage(st.config, cswap && process.env[BIN_DIR_ENV]
    ? { run: (_f, a, o) => spawnSync(cswap, a, { ...o, shell: false, encoding: 'utf8' }) }
    : undefined);
  const pace = paceOf(usage, { planSlots: 1 });
  if (pace.slots === 0) {
    const when = Date.parse(pace.resumeAt);
    stopTrigger(rec);
    const trig = setTrigger(projectDir, id, when);
    if (!trig) fail(1, 'refused: no trigger');
    writeRecord(projectDir, { ...rec, method: trig.method, job: trig.job, notBefore: new Date(when).toISOString() });
    out(`waiting ${id} ${new Date(when).toISOString()}`);
    return;
  }
  // Step 6: resume the session of the record (the same session_id, L5-2), then remove the trigger.
  const claude = findBin('claude');
  writeRecord(projectDir, { ...rec, state: 'resumed' });
  stopTrigger(rec);
  const r = claude
    ? spawnSync(claude, ['--resume', rec.supervisorSession, '-p', RESUME_PROMPT], { cwd: root, shell: false, stdio: 'ignore' })
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
      if (!flag('--session')) fail(1, USAGE);
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
