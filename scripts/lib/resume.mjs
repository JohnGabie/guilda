import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { splitCommands, isVariable, resolveDir } from './git-command.mjs';

/** Env var that points to a folder of stand-in programs (the test seam). */
export const BIN_DIR_ENV = 'GUILDA_RESUME_BIN_DIR';
/** The env var that must be set with the seam, so the seam never works by accident. */
export const TEST_ENV = 'GUILDA_RESUME_TEST';
/** The only form of a session id that the trigger accepts (it goes into the claude argv). */
export const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** An at job number. */
export const JOB_ID = /^\d+$/;
export const RECORD_VERSION = 1;
export const RECORD_STATES = Object.freeze(['armed', 'resumed', 'removed', 'waiting-user', 'fired']);
/** The accuracy of the timer. */
export const TIMER_ACCURACY = '1s';
/** The pause, in minutes, above which the supervisor arms the trigger. */
export const MIN_PAUSE_MIN = 30;
/** The prompt of the resumed session (step 6 of 5e). */
export const RESUME_PROMPT =
  'The usage limit has reset. Resume the stopped work: run the tick and go on with the queue.';

/** The real path of the main project root (X9): the parent of the git common directory, else the real path. */
export function mainRoot(projectDir) {
  try {
    let root = fs.realpathSync(projectDir);
    const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) root = fs.realpathSync(path.dirname(r.stdout.trim()));
    return root;
  } catch {
    return null;
  }
}

/** The 8 hex characters of the project hash of the main root (X9), or null. */
export function projectId(projectDir) {
  const root = mainRoot(projectDir);
  return root === null ? null : createHash('sha256').update(root).digest('hex').slice(0, 8);
}

/** The unit name: `guilda-resume-<8 hex>`. */
export function unitName(id) {
  return `guilda-resume-${id}`;
}

/** The record file of a project. */
export function recordPath(projectDir, id) {
  return path.join(projectDir, '.guilda', 'resume', `${id}.json`);
}

/** The pure form of the resume record (5e). */
export function makeRecord({ id, projectPath, session, notBefore, method, job = null, claude, now }) {
  return {
    schemaVersion: RECORD_VERSION,
    id,
    projectPath,
    createdAt: new Date(now).toISOString(),
    notBefore: new Date(notBefore).toISOString(),
    supervisorSession: session,
    unit: unitName(id),
    method,
    job,
    claude,
    state: 'armed',
  };
}

/** True for an absolute path to an existing regular file named `claude`. */
export function validClaudePath(p, projectRoot) {
  try {
    if (typeof p !== 'string' || !path.isAbsolute(p) || path.basename(p) !== 'claude') return false;
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    // The user owns the file, and neither the group nor others can write it.
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    if ((st.mode & 0o022) !== 0) return false;
    // A program inside the project is not trusted.
    if (typeof projectRoot === 'string') {
      const real = fs.realpathSync(p);
      const root = fs.realpathSync(projectRoot);
      if (real === root || real.startsWith(root + path.sep) || p.startsWith(root + path.sep)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Check a parsed record; returns null when it is valid, else the reason. */
export function checkRecord(r) {
  if (r === null || typeof r !== 'object' || Array.isArray(r)) return 'not an object';
  if (r.schemaVersion !== RECORD_VERSION) return 'bad schemaVersion';
  for (const k of ['id', 'projectPath', 'supervisorSession', 'unit', 'notBefore']) {
    if (typeof r[k] !== 'string' || r[k] === '') return `bad ${k}`;
  }
  if (!SESSION_UUID.test(r.supervisorSession)) return 'bad supervisorSession';
  if (Number.isNaN(Date.parse(r.notBefore))) return 'bad notBefore';
  if (typeof r.claude !== 'string' || !path.isAbsolute(r.claude) || path.basename(r.claude) !== 'claude') return 'bad claude';
  if (!RECORD_STATES.includes(r.state)) return 'bad state';
  return null;
}

/** Write a record by temp file and rename. */
export function writeRecord(projectDir, record) {
  const file = recordPath(projectDir, record.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Read a record: the object, or null when it is absent or unreadable. */
export function readRecord(projectDir, id) {
  try {
    const r = JSON.parse(fs.readFileSync(recordPath(projectDir, id), 'utf8'));
    return checkRecord(r) === null ? r : null;
  } catch {
    return null;
  }
}

/**
 * R41 for the hook: a `resume.mjs <dir> run` call is refused when <dir> is not the project of the session.
 * Returns { allow: true } or { allow: false, reason }. A call that cannot be read is refused (X9).
 */
export function resumeGuard(projectDir, command) {
  if (typeof command !== 'string' || !command.includes('resume.mjs')) return { allow: true };
  const mine = mainRoot(projectDir);
  let sawRun = false;
  for (const words of splitCommands(command)) {
    const at = words.findIndex((w) => path.basename(w) === 'resume.mjs');
    if (at < 0) continue;
    const args = words.slice(at + 1);
    if (!args.includes('run')) continue;
    sawRun = true;
    const target = args[0];
    if (target === undefined || target === 'run' || isVariable(target) || !/^[/~]/.test(target)) {
      return { allow: false, reason: 'R41: the project of the resume run cannot be read' };
    }
    const theirs = mainRoot(resolveDir(projectDir, target));
    if (mine === null || theirs === null || theirs !== mine) {
      return { allow: false, reason: 'R41: a resume run is only for the project of this session' };
    }
  }
  if (!sawRun && /\brun\b/.test(command)) {
    return { allow: false, reason: 'R41: the resume run cannot be read' };
  }
  return { allow: true };
}
