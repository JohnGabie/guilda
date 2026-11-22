#!/usr/bin/env node
// The queue script (D14, R32, section 4a): the one writer of .guilda/queue/journal.jsonl and state.json.
// Usage: node scripts/queue.mjs <projectDir> <command> [args] [--session <id>] [--now <ISO>]
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectState, projectHash, SETUP_NOTICE } from './lib/project.mjs';
import { renderStatus } from './lib/status.mjs';
import { renderHandoff, HANDOFF_FILE } from './lib/handoff.mjs';
import {
  validId,
  makeAddress,
  makeWorkId,
  runWriter,
  QueueError,
  MAX_ATTEMPTS,
  CHECK_ROLES,
  BUSY_STATES,
  ROLE_NAMES,
  readJournal,
  lastSeq,
  readState,
  readClaim,
  writeClaimFile,
  MAX_SLOTS,
} from './lib/queue.mjs';

const USAGE = 'usage: node scripts/queue.mjs <projectDir> <init|add|sync|dispatch|approve|reject|retry|hold|release|claim|unclaim|slots|handoff> [args] [--session <id>] [--now <ISO>]';
const DEFAULT_TTL_SEC = 600;
const MIN_TTL_SEC = 60;
const MAX_TTL_SEC = 3600;
const MS_PER_SECOND = 1000;
const VALUE_FLAGS = ['--session', '--now', '--ttl', '--worktree', '--slots', '--part', '--title', '--deps', '--role', '--tool', '--tier', '--brief', '--base', '--note'];
const BOOL_FLAGS = ['--external', '--check'];
const TOOL = /^[a-z0-9]{1,24}$/;
const TIER = /^[A-Za-z0-9_-]{1,32}$/;
const COMMIT = /^[0-9a-f]{4,64}$/;
const SESSION = /^[A-Za-z0-9._:-]{1,128}$/;
const WRITER_ROLE = 'arc';
const ARROW = '→';

const refuse = (message) => new QueueError(1, message);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const notes = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.includes(a)) {
      if (i + 1 >= argv.length) throw refuse(USAGE);
      if (a === '--note') notes.push(argv[++i]);
      else flags[a.slice(2)] = argv[++i];
    } else if (BOOL_FLAGS.includes(a)) {
      flags[a.slice(2)] = true;
    } else if (a.startsWith('--')) {
      throw refuse(USAGE);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) throw refuse(USAGE);
  const [projectDir, command, ...args] = positional;
  return { projectDir, command, args, flags, notes };
}

const checkTask = (id) => {
  if (!validId('task', id)) throw refuse('invalid ID');
  return id;
};

function positiveInt(v, name) {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,5}$/.test(v)) throw refuse(`queue: ${name} must be a positive number`);
  return Number(v);
}

// ---- Plans ----

const HEADING = /^(#{1,3}) /;
const FENCE = /^\s*(```|~~~)/;
const TASK_HEADING = /^### (T[0-9]+[A-Za-z]*) — (.*)$/;
const PART_HEADING = /^## Plan: Part ([0-9]+)\b/;
const PLAN_TASK_REF = /^T[0-9]+[A-Za-z]*$/;

/** The headings of a text outside code fences: [{ line, level, text }]. */
function headings(lines) {
  const out = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fence = !fence;
    else if (!fence && HEADING.test(line)) out.push({ line: i, level: HEADING.exec(line)[1].length, text: line });
  });
  return out;
}

function field(body, name) {
  const re = new RegExp(`^\\s*(?:[-*]\\s+)?${name}:\\s*(.*)$`);
  for (const line of body) {
    const m = re.exec(line);
    if (m) return m[1];
  }
  return null;
}

const list = (v) => (v === null ? [] : v.split(/[,;]/).map((x) => x.trim()).filter((x) => x !== '' && x.toLowerCase() !== 'none'));

/**
 * The tasks of a plan file: [{ id, planId, title, deps, uses, owns, key }]. With `part`, only the tasks of
 * `## Plan: Part <part>`, with the prefix P<part>. A dependency that is not a task of the same plan or Part (a lab,
 * a gate, a user decision) is not a queue dependency.
 */
export function parsePlan(text, stem, part) {
  const lines = text.split(/\r?\n/);
  const heads = headings(lines);
  const parts = heads.filter((h) => h.level === 2 && PART_HEADING.test(h.text));
  let from = 0;
  let to = lines.length;
  if (part === null) {
    if (parts.length > 0) throw refuse('queue: the plan has Parts; use --part');
  } else {
    const start = parts.find((h) => Number(PART_HEADING.exec(h.text)[1]) === part);
    if (!start) throw refuse(`queue: the plan has no Part ${part}`);
    from = start.line;
    const end = heads.find((h) => h.line > start.line && h.level <= 2);
    to = end ? end.line : lines.length;
  }
  const inRange = heads.filter((h) => h.line >= from && h.line < to);
  const tasks = [];
  inRange.forEach((h) => {
    const m = h.level === 3 ? TASK_HEADING.exec(h.text) : null;
    if (!m) return;
    const next = inRange.find((x) => x.line > h.line);
    const body = lines.slice(h.line + 1, next ? next.line : to);
    const prefix = part === null ? '' : `P${part}`;
    tasks.push({
      planId: m[1],
      id: `${prefix}${m[1]}`,
      title: m[2].trim(),
      depsRaw: list(field(body, 'Dependencies')).filter((d) => PLAN_TASK_REF.test(d)),
      uses: list(field(body, 'Uses')),
      owns: list(field(body, 'Owns')),
      key: part === null ? `${stem}#${m[1]}` : `${stem}#Part${part}.${m[1]}`,
    });
  });
  const ids = new Set(tasks.map((t) => t.planId));
  const prefix = part === null ? '' : `P${part}`;
  for (const t of tasks) {
    t.deps = [...new Set(t.depsRaw.filter((d) => ids.has(d)))].map((d) => `${prefix}${d}`);
    delete t.depsRaw;
  }
  return tasks;
}

/** The first dependency cycle, as a list of IDs that ends with its first ID, or null (SC-G14). */
export function findCycle(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, t.deps]));
  const mark = new Map();
  const stack = [];
  const visit = (id) => {
    mark.set(id, 'open');
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      if (mark.get(d) === 'open') return [...stack.slice(stack.indexOf(d)), d];
      if (!mark.has(d)) {
        const c = visit(d);
        if (c) return c;
      }
    }
    stack.pop();
    mark.set(id, 'closed');
    return null;
  };
  for (const t of tasks) {
    if (!mark.has(t.id)) {
      const c = visit(t.id);
      if (c) return c;
    }
  }
  return null;
}

// ---- Commands ----

function cmdInit({ args, flags, root }) {
  if (args.length !== 1 || flags.slots === undefined) throw refuse(USAGE);
  const slots = positiveInt(flags.slots, '--slots');
  const part = flags.part === undefined ? null : positiveInt(flags.part, '--part');
  const file = path.resolve(root, args[0]);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw refuse(`queue: cannot read ${args[0]}`);
  }
  const stem = path.basename(file).replace(/\.md$/, '');
  const tasks = parsePlan(text, stem, part);
  const seen = new Set();
  for (const t of tasks) {
    checkTask(t.id);
    if (seen.has(t.id)) throw refuse(`queue: task ${t.id} exists`);
    seen.add(t.id);
  }
  const cycle = findCycle(tasks);
  if (cycle) throw refuse(`queue: dependency cycle ${cycle.join(' -> ')}`);
  const rel = path.relative(root, file);
  const planPath = rel.startsWith('..') || path.isAbsolute(rel) ? args[0] : rel.split(path.sep).join('/');
  return ({ state, emit }) => {
    for (const t of tasks) if (Object.hasOwn(state.tasks, t.id)) throw refuse(`queue: task ${t.id} exists`);
    const work = makeWorkId(Object.keys(state.works));
    emit({ type: 'plan', plan: planPath, part, work, slots });
    for (const t of tasks) {
      emit({ type: 'task', task: t.id, work, key: t.key, title: t.title, deps: t.deps, uses: t.uses, owns: t.owns });
    }
    return [`queue: ${tasks.length} tasks, work ${work}`];
  };
}

function cmdAdd({ args, flags }) {
  if (args.length !== 1) throw refuse(USAGE);
  const id = checkTask(args[0]);
  if (typeof flags.title !== 'string' || flags.title.trim() === '') throw refuse(USAGE);
  const deps = flags.deps === undefined ? [] : flags.deps.split(',').map((d) => d.trim()).filter(Boolean);
  deps.forEach(checkTask);
  if (deps.includes(id)) throw refuse(`queue: dependency cycle ${id} -> ${id}`);
  return ({ state, events, emit }) => {
    if (Object.hasOwn(state.tasks, id)) throw refuse(`queue: task ${id} exists`);
    for (const d of deps) if (!Object.hasOwn(state.tasks, d)) throw refuse(`queue: unknown task ${d}`);
    const plan = events.filter((e) => e.type === 'plan').at(-1);
    emit({ type: 'task', task: id, work: plan?.work ?? null, key: null, title: flags.title, deps: [...new Set(deps)], uses: [], owns: [] });
    return [`queue: added ${id}`];
  };
}

function readBriefUses(root, file) {
  let text;
  try {
    text = fs.readFileSync(path.resolve(root, file), 'utf8');
  } catch {
    throw refuse(`queue: cannot read ${file}`);
  }
  const v = field(text.split(/\r?\n/), 'Uses');
  return v === null ? null : list(v);
}

function cmdDispatch({ args, flags, root, session }) {
  if (args.length !== 1 || !flags.role || !flags.tool || !flags.tier) throw refuse(USAGE);
  const id = checkTask(args[0]);
  if (!validId('role', flags.role)) throw refuse('invalid ID');
  if (!TOOL.test(flags.tool) || !TIER.test(flags.tier)) throw refuse(USAGE);
  if (flags.base !== undefined && !COMMIT.test(flags.base)) throw refuse(USAGE);
  const check = flags.check === true;
  if (check && !CHECK_ROLES.includes(flags.role)) throw refuse(`${id}: a check run needs the role rev, qa or sec`);
  let worktree = null;
  if (flags.worktree !== undefined) {
    const w = flags.worktree;
    // A subfolder of the project: no control character, no backslash, no absolute path, no `.` or `..` part.
    const bad = w === '' || /[\x00-\x1f\x7f\\]/.test(w) || path.isAbsolute(w) || w.split('/').some((p) => p === '.' || p === '..' || p === '');
    if (bad) {
      throw refuse('invalid worktree');
    }
    worktree = w;
  }
  const briefUses = flags.brief === undefined ? null : readBriefUses(root, flags.brief);
  return ({ state, events, emit }) => {
    const t = state.tasks[id];
    if (!Object.hasOwn(state.tasks, id)) throw refuse(`queue: unknown task ${id}`);
    const allowed = check ? ['running', 'review', 'stalled'] : ['ready'];
    if (!allowed.includes(t.state)) throw refuse(`${id}: dispatch not allowed in ${t.state}`);
    if (!check) {
      const busy = Object.values(state.tasks).filter((x) => BUSY_STATES.includes(x.state)).length;
      if (busy >= state.slots) throw refuse(`${id}: no free slot`);
    }
    const known = new Set(events.filter((e) => typeof e.address === 'string').map((e) => e.address));
    let address;
    try {
      address = makeAddress(id, flags.role, known);
    } catch (err) {
      throw refuse(err.message);
    }
    emit({
      type: 'dispatch',
      task: id,
      attempt: t.attempt,
      address,
      role: flags.role,
      tool: flags.tool,
      inSession: flags.external !== true && flags.tool === 'claude',
      check,
      tier: flags.tier,
      worktree,
      session,
      briefFile: flags.brief ?? null,
      baseCommit: flags.base ?? null,
      uses: briefUses ?? t.uses,
    });
    if (!check) emit({ type: 'state', task: id, from: 'ready', to: 'dispatched', cause: 'dispatch' });
    return [`dispatched ${id} attempt ${t.attempt} address ${address}`];
  };
}

/** approve, reject and retry: one decision event and one state event. */
function cmdDecide(decision) {
  const from = { approve: ['review'], reject: ['review'], retry: ['failed', 'stalled'] }[decision];
  return ({ args }) => {
    if (args.length !== 1) throw refuse(USAGE);
    const id = checkTask(args[0]);
    return ({ state, emit }) => {
      if (!Object.hasOwn(state.tasks, id)) throw refuse(`queue: unknown task ${id}`);
      const t = state.tasks[id];
      if (!from.includes(t.state)) throw refuse(`${id}: ${decision} not allowed in ${t.state}`);
      let to = 'done';
      let cause = 'approve';
      if (decision !== 'approve') {
        const last = t.attempt + 1 > MAX_ATTEMPTS;
        to = last ? 'dead' : 'ready';
        cause = last ? 'attempts-used' : decision;
      }
      emit({ type: 'decision', tasks: [id], decision, by: WRITER_ROLE });
      emit({ type: 'state', task: id, from: t.state, to, cause });
      return [`${id}: ${t.state} ${ARROW} ${to}`];
    };
  };
}

/** hold and release of one or more tasks: one decision event and one state event for each task (D48). */
function cmdHoldRelease(decision) {
  return ({ args }) => {
    if (args.length < 1) throw refuse(USAGE);
    const ids = [...new Set(args.map(checkTask))];
    return ({ state, emit }) => {
      const lines = [];
      const moves = ids.map((id) => {
        if (!Object.hasOwn(state.tasks, id)) throw refuse(`queue: unknown task ${id}`);
        const s = state.tasks[id].state;
        if (decision === 'hold' && !['pending', 'ready'].includes(s)) throw refuse(`${id}: cannot hold ${s}`);
        if (decision === 'release' && s !== 'held') throw refuse(`${id}: release not allowed in ${s}`);
        return { id, from: s, to: decision === 'hold' ? 'held' : 'pending' };
      });
      emit({ type: 'decision', tasks: ids, decision, by: WRITER_ROLE });
      for (const m of moves) {
        emit({ type: 'state', task: m.id, from: m.from, to: m.to, cause: decision });
        lines.push(`${m.id}: ${m.from} ${ARROW} ${m.to}`);
      }
      return lines;
    };
  };
}

/** claim: the session becomes the writer while the claim is live (0.5.0 spec 5a). */
function cmdClaim({ args, flags, root, session }) {
  if (args.length !== 0 || session === null) throw refuse(USAGE);
  let ttlSec = DEFAULT_TTL_SEC;
  if (flags.ttl !== undefined) {
    if (!/^[0-9]{1,5}$/.test(flags.ttl)) throw refuse('invalid ttl');
    ttlSec = Number(flags.ttl);
    if (ttlSec < MIN_TTL_SEC || ttlSec > MAX_TTL_SEC) throw refuse('invalid ttl');
  }
  // A claim decision uses the real clock, never --now: a caller cannot make a live claim look old (R32).
  return ({ emit }) => {
    const old = readClaim(root);
    if (old?.live && old.session !== session) throw new QueueError(3, `claimed by session ${old.session}`);
    const takeover = old !== null && !old.live;
    writeClaimFile(root, { session, ttlSec, aliveAt: new Date().toISOString(), pid: null });
    emit({ type: 'claim', session, ttlSec, takeover });
    return [`claim: session ${session} ttl ${ttlSec}${takeover ? ' takeover' : ''}`];
  };
}

/** unclaim: only the claim session. The file stays, with an aliveAt that makes the claim not live. */
function cmdUnclaim({ args, root, session }) {
  if (args.length !== 0 || session === null) throw refuse(USAGE);
  return ({ emit }) => {
    const old = readClaim(root);
    if (old === null || old.session !== session) throw refuse('refused: not the claim session');
    const aliveAt = new Date(Date.now() - old.ttlSec * MS_PER_SECOND).toISOString();
    writeClaimFile(root, { session, ttlSec: old.ttlSec, aliveAt, pid: old.pid });
    emit({ type: 'unclaim', session });
    return [`unclaim: session ${session}`];
  };
}

/** slots <n>: the `slots` decision; the fold sets state.slots from the last one. */
function cmdSlots({ args, session }) {
  if (args.length !== 1 || session === null) throw refuse(USAGE);
  if (!/^[0-9]$/.test(args[0]) || Number(args[0]) > MAX_SLOTS) throw refuse('invalid slots');
  const slots = Number(args[0]);
  return ({ emit }) => {
    emit({ type: 'decision', decision: 'slots', slots, by: WRITER_ROLE });
    return [`slots: ${slots}`];
  };
}

const COMMANDS = {
  claim: cmdClaim,
  unclaim: cmdUnclaim,
  slots: cmdSlots,
  init: cmdInit,
  add: cmdAdd,
  sync: ({ args, root, records }) => {
    if (args.length !== 0) throw refuse(USAGE);
    return ({ events }) => {
      // The journal on disk is the state before this run (the lock is held): later seqs are new.
      const before = lastSeq(readJournal(root).events);
      records.push(...endRecords(events, before));
      return null;
    };
  },
  dispatch: cmdDispatch,
  approve: cmdDecide('approve'),
  reject: cmdDecide('reject'),
  retry: cmdDecide('retry'),
  hold: cmdHoldRelease('hold'),
  release: cmdHoldRelease('release'),
};

// ---- Status file and record lines (D21, X10) ----

const STATUS_FILE = 'status.md';
const TMP_BYTES = 6;
// The tool name of a run in the session (X10); joined so that it is not read as a model name.
const SESSION_TOOL = ['claude', 'code'].join('-');

/** Write .guilda/status.md by a temp file and a rename. The file is a copy of the state, so it fails open. */
function writeStatusFile(root, now) {
  try {
    const guilda = path.join(root, '.guilda');
    const state = readState(root, { now });
    const { events } = readJournal(root);
    const text = `${renderStatus(state, events, { now })}<!-- generator: ${state.generator} -->\n`;
    const tmp = path.join(guilda, `${STATUS_FILE}.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`);
    fs.writeFileSync(tmp, text, { flag: 'wx' });
    try {
      fs.renameSync(tmp, path.join(guilda, STATUS_FILE));
    } catch (err) {
      fs.unlinkSync(tmp);
      throw err;
    }
  } catch {
    // A status file that cannot be written stops no work.
  }
}

/** Write .guilda/handoff.md by a temp file and a rename (T25). Unlike the status file, a failure is an error. */
function writeHandoffFile(root, now, notes) {
  const guilda = path.join(root, '.guilda');
  const state = readState(root, { now });
  const { events } = readJournal(root);
  const text = renderHandoff(state, events, { now, notes });
  const tmp = path.join(guilda, `${HANDOFF_FILE}.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, text, { flag: 'wx' });
  try {
    fs.renameSync(tmp, path.join(guilda, HANDOFF_FILE));
  } catch (err) {
    fs.unlinkSync(tmp);
    throw err;
  }
}

/** The end signals (done or failed) of the events after `before`, one for each run: [{ dispatch, signal, agentId }]. */
function endRecords(events, before) {
  const dispatchOf = (e) =>
    events.find((d) => d.type === 'dispatch' && (e.address ? d.address === e.address : d.task === e.task && d.attempt === e.attempt && d.check !== true));
  const out = [];
  const seen = new Set();
  for (const e of events) {
    if (e.type !== 'signal' || !(e.seq > before) || !['done', 'failed'].includes(e.kind)) continue;
    const dispatch = dispatchOf(e);
    if (!dispatch || seen.has(dispatch.address)) continue;
    seen.add(dispatch.address);
    const bound = events.find((a) => a.type === 'agent' && a.address === dispatch.address);
    out.push({ dispatch, signal: e, agentId: e.agentId ?? bound?.agentId ?? null });
  }
  return out;
}

/** The `record_task` line of one folded end (X10). It has no path: the project is its hash. */
function recordLine({ dispatch, signal, agentId }, { config, hash, session }) {
  const model = config.tiers?.[dispatch.tier];
  const rec = {
    role: ROLE_NAMES[dispatch.role] ?? dispatch.role,
    started_at: dispatch.t,
    ended_at: signal.at,
    tier: dispatch.tier ?? null,
    ...(typeof model === 'string' ? { model } : {}),
    tool: dispatch.inSession === false ? dispatch.tool : SESSION_TOOL,
    task_id: dispatch.task,
    address: dispatch.address,
    attempt: dispatch.attempt,
    agent_id: agentId,
    session_id: session ?? dispatch.session ?? null,
    project_hash: hash,
    outcome: signal.reason ?? null,
  };
  return `record_task ${JSON.stringify(rec)}`;
}

/** Run the script; return { code, lines }. It never calls process.exit. */
export function main(argv) {
  const out = [];
  try {
    const parsed = parseArgs(argv);
    const root = path.resolve(parsed.projectDir);
    if (projectState(root).state === 'none') return { code: 1, lines: ['refused: guilda is not set up', SETUP_NOTICE] };
    if (parsed.command === 'handoff' && parsed.args.length > 0) throw refuse(USAGE);
    const make = parsed.command === 'handoff' ? null : COMMANDS[parsed.command];
    if (!make && parsed.command !== 'handoff') throw refuse(USAGE);
    const session = parsed.flags.session ?? null;
    if (session !== null && !SESSION.test(session)) throw refuse('invalid ID');
    let now = new Date().toISOString();
    if (parsed.flags.now !== undefined) {
      const ms = Date.parse(parsed.flags.now);
      if (Number.isNaN(ms)) throw refuse(USAGE);
      now = new Date(ms).toISOString();
    }
    if (parsed.command === 'handoff') {
      if (readJournal(root).events.length === 0) throw refuse('handoff: no queue yet');
      writeHandoffFile(root, now, parsed.notes);
      return { code: 0, lines: [`handoff: .guilda/${HANDOFF_FILE}`] };
    }
    const records = [];
    const work = make({ ...parsed, root, session, records });
    const r = runWriter(root, { now, session }, work);
    writeStatusFile(root, now);
    out.push(...(r.result ?? [`queue: ${r.added} events`]));
    const project = projectState(root);
    if (records.length > 0 && project.state === 'valid' && project.config.usage?.source === 'cswap') {
      const ctx = { config: project.config, hash: projectHash(root), session };
      out.push(...records.map((x) => recordLine(x, ctx)));
    }
    for (const n of r.skipped) out.push(`queue: skipped bad line ${n}`);
    if (r.badSignals > 0) out.push(`queue: skipped ${r.badSignals} bad signal files`);
    return { code: 0, lines: out };
  } catch (err) {
    if (err instanceof QueueError) return { code: err.exitCode, lines: [err.message] };
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
