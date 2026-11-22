import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readState, readJournal, readClaim, lateMark, BUSY_STATES, MAX_ATTEMPTS } from './queue.mjs';
import { readMailbox, pendingOf } from './bus.mjs';
import { projectState } from './project.mjs';
import { readUsage } from './usage.mjs';
import { paceOf } from './pace.mjs';

/** The mailbox address of the supervisor. */
export const SUPERVISOR = 'supervisor';
/** The save request must be this old, in ms, before the supervisor checks for a commit (7a, item 2). */
export const SAVE_WAIT_MS = 120000;
/** The time limit of one git call, in ms. */
export const GIT_TIMEOUT_MS = 10000;
/** The record types of the supervisor in the journal. */
export const RECORD_TYPES = Object.freeze(['save-request', 'needs-user', 'sleep']);
/** The idle causes of a task that does not move. */
export const IDLE_CAUSES = Object.freeze(['waits-user', 'waits-reset', 'failed-check', 'no-ready', 'stuck']);

const toMs = (v) => {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * The worktree folder of a task: { dir } for a real folder under the real project path, { missing: true } when it
 * is not a folder, { outside: true } when the field or a link leads out of the project.
 */
export function worktreeDir(projectDir, worktree) {
  if (typeof worktree !== 'string' || worktree === '') return { missing: true };
  if (path.isAbsolute(worktree) || worktree.split(/[\\/]/).includes('..')) return { outside: true };
  try {
    const rootReal = fs.realpathSync(path.resolve(projectDir));
    const dir = fs.realpathSync(path.join(rootReal, worktree));
    const rel = path.relative(rootReal, dir);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return { outside: true };
    return fs.statSync(dir).isDirectory() ? { dir } : { missing: true };
  } catch {
    return { missing: true };
  }
}

/** The git arguments of the commit time read: a worktree config cannot run code (fsmonitor, hooks, signature program). */
export function gitLogArgs(dir) {
  return [
    '-c', 'core.fsmonitor=false',
    '-c', 'log.showSignature=false',
    '-c', 'core.hooksPath=/dev/null',
    '-C', dir,
    'log', '-1', '--no-show-signature', '--format=%cI',
  ];
}

/** The environment of the git read: no system config, and no variable that points git at another repository. */
export function gitEnv(env = process.env) {
  const out = { ...env, GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete out[k];
  return out;
}

/** { exists, outside, commitAt } of a task worktree. No shell; a git error gives commitAt null. */
export function worktreeInfo(projectDir, worktree) {
  const w = worktreeDir(projectDir, worktree);
  if (!w.dir) return { exists: false, outside: w.outside === true, commitAt: null };
  try {
    const out = execFileSync('git', gitLogArgs(w.dir), {
      encoding: 'utf8',
      env: gitEnv(),
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { exists: true, outside: false, commitAt: out === '' ? null : out };
  } catch {
    return { exists: true, outside: false, commitAt: null };
  }
}

/** One line of plain text for the summary: no line break and no Markdown control character. */
export function mdText(v) {
  return String(v ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\\#*_`[\]<>|]/g, (c) => `\\${c}`);
}

export const isLateRunning = (t, now) =>
  (t.state === 'running' && lateMark(t, now) !== null) || (t.state === 'stalled' && t.cause === 'no-heartbeat');

/** The last record of `type` for the attempt of a task. */
function recordOf(records, type, id, attempt) {
  let found = null;
  for (const r of records) if (r.type === type && r.task === id && r.attempt === attempt) found = r;
  return found;
}

/**
 * Read the files that the decision needs: { now, session, claim, state, pace, usage, unread, records, worktrees }.
 * `git: false` skips every git call: `worktrees` stays empty. `run` is the seam of readUsage. It never runs cswap by itself in a test.
 */
export function readFacts(projectDir, { now, session, run, git = true } = {}) {
  const root = path.resolve(projectDir);
  const at = now ?? new Date().toISOString();
  const state = readState(root, { now: at });
  const claim = readClaim(root, { now: at });
  const config = projectState(root).config ?? {};
  const usage = run ? readUsage(config, { run }) : readUsage(config);
  const pace = paceOf(usage, { planSlots: state.slots, now: at });
  const unread = pendingOf(readMailbox(root, SUPERVISOR)).map((l) => l.id);
  const { events } = readJournal(root);
  const records = events.filter((e) => RECORD_TYPES.includes(e.type) || (e.type === 'decision' && e.decision === 'stop'));
  const worktrees = {};
  for (const [id, t] of Object.entries(state.tasks)) {
    if (git && recordOf(records, 'save-request', id, t.attempt)) worktrees[id] = worktreeInfo(root, t.worktree);
  }
  return { now: at, session: session ?? null, claim, state, pace, usage, unread, records, worktrees };
}

/** The pure decision (spec 7a, T4): the first rule that applies wins. No I/O. */
export function nextStep(facts) {
  const { now, state, pace, unread = [], records = [], worktrees = {} } = facts;
  const nowMs = toMs(now);
  const entries = Object.entries(state.tasks);
  const busy = entries.filter(([, t]) => BUSY_STATES.includes(t.state)).length;
  const slots = { pace: pace.slots, busy, free: Math.max(0, pace.slots - busy) };
  const asked = (id, t) => recordOf(records, 'needs-user', id, t.attempt) !== null;

  const idle = [];
  for (const [id, t] of entries) {
    let cause = null;
    if (t.state === 'done') continue;
    if (asked(id, t) || ((t.state === 'stalled' || t.state === 'failed') && t.attempt > 1 && t.cause !== 'no-ack')) cause = 'waits-user';
    else if (isLateRunning(t, now)) cause = 'stuck';
    else if (t.state === 'failed') cause = 'failed-check';
    else if (['ready', 'pending'].includes(t.state)) cause = pace.slots === 0 ? 'waits-reset' : 'no-ready';
    if (cause) idle.push({ task: id, cause });
  }
  const done = (step) => ({ ...step, now, slots, paceWhy: pace.why, idle });

  // 1. The pace is 0.
  if (pace.slots === 0) return done({ step: 'pause', until: pace.resumeAt, why: pace.why });

  // 2. A late running attempt with no save request.
  for (const [id, t] of entries) {
    if (!isLateRunning(t, now) || asked(id, t)) continue;
    if (!recordOf(records, 'save-request', id, t.attempt)) {
      return done({ step: 'save-request', task: id, attempt: t.attempt, address: t.address });
    }
  }

  // 3. A save request that is 2 min old or more.
  for (const [id, t] of entries) {
    if (!isLateRunning(t, now) || asked(id, t)) continue;
    const sr = recordOf(records, 'save-request', id, t.attempt);
    if (!sr || nowMs - toMs(sr.t) < SAVE_WAIT_MS) continue;
    const w = worktrees[id];
    if (!w || !w.exists) {
      const reason = w?.outside ? 'worktree outside the project' : 'worktree missing';
      return done({ step: 'needs-user', task: id, attempt: t.attempt, reason });
    }
    const commitMs = w.commitAt === null ? null : toMs(w.commitAt);
    if (commitMs !== null && commitMs > toMs(sr.t)) {
      return done({ step: 'stop', task: id, attempt: t.attempt, address: t.address });
    }
    return done({ step: 'needs-user', task: id, attempt: t.attempt, reason: 'no commit after the save request' });
  }

  // 4. A stalled or failed attempt.
  for (const [id, t] of entries) {
    if (!['stalled', 'failed'].includes(t.state) || asked(id, t)) continue;
    if (t.state === 'stalled' && t.cause === 'no-heartbeat') continue;
    const retry = t.cause === 'no-ack' ? t.attempt < MAX_ATTEMPTS : t.attempt === 1;
    if (retry) return done({ step: 'retry', task: id });
    return done({ step: 'needs-user', task: id, attempt: t.attempt, reason: t.cause ?? t.state });
  }

  // 5. A task in review with no check run.
  for (const [id, t] of entries) {
    if (t.state === 'review' && (t.checks ?? []).length === 0) return done({ step: 'dispatch-check', task: id, role: 'rev' });
  }

  // 6. Unread messages for the supervisor.
  if (unread.length > 0) return done({ step: 'read-bus', ids: unread });

  // 7. The slots of the queue differ from the pace.
  if (state.slots !== pace.slots) return done({ step: 'set-slots', slots: pace.slots });

  // 8. A ready task and a free slot.
  if (slots.free > 0) {
    const ready = entries.find(([, t]) => t.state === 'ready');
    if (ready) return done({ step: 'dispatch', task: ready[0], lowTier: pace.lowTier === true });
  }

  // 9. Each task is done.
  if (entries.every(([, t]) => t.state === 'done')) return done({ step: 'finish', why: 'done' });

  // 10. No task can move.
  if (!entries.some(([, t]) => ['dispatched', 'running', 'review', 'ready'].includes(t.state))) {
    return done({ step: 'finish', why: 'needs-user' });
  }

  // 11. Wait.
  return done({ step: 'watch' });
}

/** The text of the summary file (T4): tasks done, needs-user items, idle causes, the pace at the end. */
export function renderSummary(facts) {
  const { state, records, pace, now } = facts;
  const step = nextStep(facts);
  const lines = ['# Supervisor summary', '', `Written at ${now}.`, '', '## Tasks done', ''];
  const done = Object.entries(state.tasks).filter(([, t]) => t.state === 'done');
  if (done.length === 0) lines.push('- none');
  for (const [id, t] of done) lines.push(`- ${id}${t.title ? ` — ${mdText(t.title)}` : ''}`);
  lines.push('', '## Needs the user', '');
  const items = new Map();
  for (const r of records) if (r.type === 'needs-user') items.set(`${r.task}:${r.attempt}`, r);
  if (items.size === 0) lines.push('- none');
  for (const r of items.values()) lines.push(`- ${mdText(r.task)} (attempt ${r.attempt}): ${mdText(r.reason)}`);
  lines.push('', '## Idle causes', '');
  if (step.idle.length === 0) lines.push('- none');
  for (const i of step.idle) lines.push(`- ${mdText(i.task)}: ${i.cause}`);
  lines.push('', '## Pace at the end', '');
  lines.push(`- slots: ${pace.slots}`, `- why: ${pace.why}`, `- resume at: ${pace.resumeAt ?? 'none'}`, '');
  return lines.join('\n');
}
