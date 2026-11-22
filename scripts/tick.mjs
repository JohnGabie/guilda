#!/usr/bin/env node
// The decision engine of the supervisor (0.5.0 supervisor, T4).
// Usage: node scripts/tick.mjs <projectDir> --session <id> [--now <ISO>]
//          (--json | --record <type> [--task <id>] [--attempt <n>] [--until <ISO>] [--reason <text>] [--ids <m-id,...>] | --summary)
// Exit codes: 0 done, 1 refused or bad input, 2 I/O error.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runWriter, readClaim, validId, QueueError } from './lib/queue.mjs';
import { MESSAGE_ID } from './lib/bus.mjs';
import { readFacts, nextStep, renderSummary, worktreeInfo, isLateRunning, RECORD_TYPES } from './lib/tick.mjs';

const USAGE =
  'usage: node scripts/tick.mjs <projectDir> --session <id> [--now <ISO>] (--json | --record <save-request|stop|needs-user|sleep|read> [--task <id>] [--attempt <n>] [--until <ISO>] [--reason <text>] [--ids <m-id,...>] | --summary)';
const VALUE_FLAGS = ['--session', '--now', '--record', '--task', '--attempt', '--until', '--reason', '--ids'];
const BOOL_FLAGS = ['--json', '--summary'];
const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const SUMMARY_FILE = 'supervisor-summary.md';
const MAX_REASON_CHARS = 500;
const TMP_BYTES = 6;
const SUPERVISOR_ROLE = 'sup';

const refuse = (message) => new QueueError(1, message.startsWith('refused:') ? message : `refused: ${message}`);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.includes(a)) {
      if (i + 1 >= argv.length) throw refuse(USAGE);
      flags[a.slice(2)] = argv[++i];
    } else if (BOOL_FLAGS.includes(a)) {
      flags[a.slice(2)] = true;
    } else if (a.startsWith('--')) {
      throw refuse(USAGE);
    } else positional.push(a);
  }
  if (positional.length !== 1 || flags.session === undefined) throw refuse(USAGE);
  const modes = ['json', 'record', 'summary'].filter((m) => flags[m] !== undefined);
  if (modes.length !== 1) throw refuse(USAGE);
  return { projectDir: positional[0], flags, mode: modes[0] };
}

/** The checked fields of a record command. */
function recordFields(flags, taskOf) {
  const type = flags.record;
  if (![...RECORD_TYPES, 'stop'].includes(type)) throw refuse(`unknown record type ${type}`);
  if (type === 'read') {
    const ids = typeof flags.ids === 'string' ? flags.ids.split(',') : [];
    if (ids.length === 0 || !ids.every((id) => MESSAGE_ID.test(id))) throw refuse('bad --ids');
    return { type, ids };
  }
  if (type === 'sleep') {
    if (flags.until === undefined) throw refuse('sleep needs --until');
    if (typeof flags.until !== 'string' || !ISO_ZONED.test(flags.until) || Number.isNaN(Date.parse(flags.until))) throw refuse('bad --until');
    return { type, until: new Date(flags.until).toISOString() };
  }
  if (!validId('task', flags.task)) throw refuse('invalid task');
  const t = taskOf(flags.task);
  if (!t) throw refuse(`unknown task ${flags.task}`);
  const attempt = flags.attempt === undefined ? t.attempt : validId('attempt', flags.attempt) ? Number(flags.attempt) : null;
  if (attempt === null) throw refuse('invalid attempt');
  if (attempt !== t.attempt) throw refuse(`attempt ${attempt} is not the current attempt of ${flags.task}`);
  if (type === 'needs-user') {
    const reason = flags.reason;
    if (typeof reason !== 'string' || reason.trim() === '' || [...reason].length > MAX_REASON_CHARS) throw refuse('invalid reason');
    return { type, task: flags.task, attempt, reason: reason.trim() };
  }
  return { type, task: flags.task, attempt, task_state: t };
}

function cmdRecord(root, flags, now, session) {
  const run = runWriter(root, { now, session }, ({ state, events, emit }) => {
    const f = recordFields(flags, (id) => (Object.hasOwn(state.tasks, id) ? state.tasks[id] : null));
    if (f.type === 'read') {
      emit({ type: 'read', ids: f.ids, by: SUPERVISOR_ROLE });
      return `read ${f.ids.length}`;
    }
    if (f.type === 'sleep') {
      emit({ type: 'sleep', until: f.until, by: SUPERVISOR_ROLE });
      return `sleep until ${f.until}`;
    }
    if (f.type === 'needs-user') {
      emit({ type: 'needs-user', task: f.task, attempt: f.attempt, reason: f.reason, by: SUPERVISOR_ROLE });
      return `needs-user ${f.task}`;
    }
    const t = f.task_state;
    if (!isLateRunning(t, now) && t.state !== 'running') throw refuse(`${f.task} has no running attempt`);
    if (f.type === 'save-request') {
      emit({ type: 'save-request', task: f.task, attempt: f.attempt, address: t.address, by: SUPERVISOR_ROLE });
      return `save-request ${f.task}`;
    }
    // stop (SUP3): a commit in the worktree after the save request.
    const sr = events.filter((e) => e.type === 'save-request' && e.task === f.task && e.attempt === f.attempt).at(-1);
    if (!sr) throw refuse('no save');
    const w = worktreeInfo(root, t.worktree);
    if (!w.exists) throw refuse(w.outside ? 'worktree outside the project' : 'worktree missing');
    if (w.commitAt === null || !(Date.parse(w.commitAt) > Date.parse(sr.t))) throw refuse('no save');
    emit({ type: 'decision', decision: 'stop', tasks: [f.task], attempt: f.attempt, by: SUPERVISOR_ROLE });
    emit({ type: 'state', task: f.task, from: t.state, to: 'stalled', cause: 'stop' });
    return `stop ${f.task}`;
  });
  return run.result;
}

function cmdSummary(root, now, session) {
  const facts = readFacts(root, { now, session });
  const text = renderSummary(facts);
  const dir = path.join(root, '.guilda');
  const file = path.join(dir, SUMMARY_FILE);
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, text, { flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // The temp file was not written.
    }
    throw new QueueError(2, `io-error: ${file}`);
  }
  return file;
}

function main() {
  const { projectDir, flags, mode } = parseArgs(process.argv.slice(2));
  const root = path.resolve(projectDir);
  const now = flags.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) throw refuse('invalid --now');
  if (!validId('session', flags.session)) throw refuse('invalid session');
  const claim = readClaim(root, { now });
  if (!claim || !claim.live || claim.session !== flags.session) throw refuse('no claim');
  if (mode === 'json') return JSON.stringify(nextStep(readFacts(root, { now, session: flags.session })));
  if (mode === 'summary') return cmdSummary(root, now, flags.session);
  return cmdRecord(root, flags, now, flags.session);
}

try {
  process.stdout.write(`${main()}\n`);
} catch (err) {
  if (err instanceof QueueError) {
    process.stdout.write(`${err.message}\n`);
    process.exit(err.exitCode);
  }
  process.stdout.write(`io-error: ${err?.message ?? err}\n`);
  process.exit(2);
}
