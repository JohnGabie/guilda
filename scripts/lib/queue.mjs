// The queue library (D14, X2 to X5, section 4a). It owns the queue files, the ID patterns, the fold, the lock and
// the signal paths. Only scripts/queue.mjs writes the journal and state.json through it (R32). Hooks and workers use
// only writeSignal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** The ack timeout: a dispatched task with no `started` signal after it is stalled (SC-G6, L1). */
export const ACK_TIMEOUT_MS = 120000;
/** The lease ends at least this long after the `busyUntil` of the last heartbeat. */
export const LEASE_AFTER_BUSY_MS = 300000;
/** The lease ends at least this long after the last heartbeat. */
export const LEASE_AFTER_HEARTBEAT_MS = 900000;
/** The timeout of a tool call with no timeout of its own, for `busyUntil`. */
export const DEFAULT_TOOL_TIMEOUT_MS = 600000;
/** The attempt limit: the next attempt after this one makes the task dead (R10, R11). */
export const MAX_ATTEMPTS = 3;

const ADDRESS_HEX_BYTES = 2;
const ADDRESS_DRAWS = 10;
const WORK_HEX_BYTES = 4;
const MS_PER_MINUTE = 60000;
const MS_PER_SECOND = 1000;

export const TASK_ID = /^[A-Za-z0-9]{1,24}$/;
export const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;
export const ADDRESS =
  /^(main|architect|supervisor|council-[0-9a-f]{4}|[A-Za-z0-9]{1,24}-[a-z]{2,4}-[0-9a-f]{4}|ext-[a-z0-9]{1,24}-[A-Za-z0-9]{1,24}-[0-9a-f]{4})$/;
export const WORK_ID = /^w-[0-9a-f]{8}$/;
export const RESERVED_TASK_IDS = Object.freeze(['main', 'architect', 'supervisor', 'council', 'ext']);
export const ROLE_NAMES = Object.freeze({
  arc: 'architect',
  exe: 'executor',
  rev: 'reviewer',
  qa: 'qa',
  sec: 'security',
  vc: 'version-control',
  lab: 'lab',
  dev: 'devops',
  ai: 'ai-lead',
});
export const ROLE_CODES = Object.freeze(Object.keys(ROLE_NAMES));
/** The roles of a check run (section 4a). */
export const CHECK_ROLES = Object.freeze(['rev', 'qa', 'sec']);
/** The kinds of a signal file, and the binding file of the identity hook. */
export const SIGNAL_KINDS = Object.freeze(['started', 'heartbeat', 'done', 'failed']);
export const DISPATCH_FILE = 'dispatch.json';
/** The states that use a slot. */
export const BUSY_STATES = Object.freeze(['dispatched', 'running']);

const PLUGIN_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude-plugin', 'plugin.json');

function pluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The generator field of state.json (section 3d). */
export const GENERATOR = `guilda ${pluginVersion()}`;

/** True when the value matches the pattern of its kind (X4). Kinds: task, attempt, agent, address, role, work. */
export function validId(kind, value) {
  switch (kind) {
    case 'task':
      return typeof value === 'string' && TASK_ID.test(value) && !RESERVED_TASK_IDS.includes(value);
    case 'attempt': {
      const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
      return Number.isInteger(n) && n >= 1 && n <= MAX_ATTEMPTS;
    }
    case 'agent':
      return typeof value === 'string' && AGENT_ID.test(value) && value !== '.' && value !== '..';
    case 'address':
      return typeof value === 'string' && ADDRESS.test(value);
    case 'role':
      return typeof value === 'string' && ROLE_CODES.includes(value);
    case 'work':
      return typeof value === 'string' && WORK_ID.test(value);
    default:
      return false;
  }
}

function invalidId() {
  return new Error('invalid ID');
}

/**
 * Make the address `<task>-<role>-<4 hex>` from crypto.randomBytes (X3, X4). It draws again on a match with a
 * known address, at most 10 times, then throws 'no free address'. `random` is for tests only.
 */
export function makeAddress(task, role, known, random = crypto.randomBytes) {
  if (!validId('task', task) || !validId('role', role)) throw invalidId();
  const taken = known instanceof Set ? known : new Set(known ?? []);
  for (let i = 0; i < ADDRESS_DRAWS; i++) {
    const address = `${task}-${role}-${Buffer.from(random(ADDRESS_HEX_BYTES)).toString('hex')}`;
    if (!taken.has(address)) return address;
  }
  throw new Error('no free address');
}

/** A new work ID `w-<8 hex>` that is not in `known`. */
export function makeWorkId(known = [], random = crypto.randomBytes) {
  const taken = known instanceof Set ? known : new Set(known);
  for (let i = 0; i < ADDRESS_DRAWS; i++) {
    const id = `w-${Buffer.from(random(WORK_HEX_BYTES)).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('no free address');
}

/** The paths of the queue files of a project. */
export function queuePaths(projectDir) {
  const root = path.resolve(projectDir);
  const dir = path.join(root, '.guilda', 'queue');
  return {
    root,
    guilda: path.join(root, '.guilda'),
    dir,
    journal: path.join(dir, 'journal.jsonl'),
    state: path.join(dir, 'state.json'),
    lock: path.join(dir, 'lock'),
    signals: path.join(dir, 'signals'),
  };
}

/** Parse the text of a journal. A last line with no newline is partial and skipped with no report. */
export function parseJournal(text) {
  const lines = text.split('\n');
  const last = lines.pop();
  const events = [];
  const skipped = [];
  lines.forEach((line, i) => {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      e = null;
    }
    if (e !== null && typeof e === 'object' && !Array.isArray(e)) events.push(e);
    else skipped.push(i + 1);
  });
  return { events, skipped, partial: last.length > 0 };
}

/** Read .guilda/queue/journal.jsonl: { events, skipped: [<line number>], partial }. A missing journal is empty. */
export function readJournal(projectDir) {
  let text = '';
  try {
    text = fs.readFileSync(queuePaths(projectDir).journal, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return parseJournal(text);
}

function toMs(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

const later = (a, b) => {
  if (!a) return b ?? null;
  if (!b) return a;
  return toMs(b) > toMs(a) ? b : a;
};

function usageTotal(usage) {
  if (!Array.isArray(usage)) return null;
  let sum = 0;
  for (const u of usage) {
    for (const k of ['input', 'cacheRead', 'cacheCreation', 'output']) {
      if (u && Number.isFinite(u[k])) sum += u[k];
    }
  }
  return sum;
}

function newTask(e) {
  return {
    work: e.work ?? null,
    key: e.key ?? null,
    state: 'pending',
    attempt: 1,
    address: null,
    agentId: null,
    role: null,
    tool: null,
    inSession: null,
    tier: null,
    title: e.title ?? '',
    deps: Array.isArray(e.deps) ? [...e.deps] : [],
    uses: Array.isArray(e.uses) ? [...e.uses] : [],
    owns: Array.isArray(e.owns) ? [...e.owns] : [],
    since: e.t ?? null,
    cause: null,
    startedAt: null,
    lastHeartbeat: null,
    busyUntil: null,
    tokens: null,
    agentSeconds: 0,
    checks: [],
  };
}

function resetAttempt(t) {
  t.attempt += 1;
  for (const k of ['address', 'agentId', 'role', 'tool', 'inSession', 'tier', 'startedAt', 'lastHeartbeat', 'busyUntil', 'tokens']) {
    t[k] = null;
  }
}

/**
 * Fold the journal events into the state of section 4a. Pure: no file read and no clock read. `now` only adds the
 * open time in `running` to agentSeconds. An unknown event type is ignored (D40).
 */
export function fold(events, { now, generator = GENERATOR } = {}) {
  const s = { generator, journalSeq: 0, slots: 1, works: {}, tasks: {} };
  const runningSince = {};
  const seconds = {};
  // address -> { task, check } of each dispatch.
  const runs = {};
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (Number.isFinite(e.seq)) s.journalSeq = Math.max(s.journalSeq, e.seq);
    const t = typeof e.task === 'string' && Object.hasOwn(s.tasks, e.task) ? s.tasks[e.task] : null;
    switch (e.type) {
      case 'plan':
        if (Number.isInteger(e.slots) && e.slots > 0) s.slots = e.slots;
        if (typeof e.work === 'string') s.works[e.work] = { plan: e.plan ?? null, part: e.part ?? null };
        break;
      case 'task':
        if (typeof e.task === 'string' && !t) {
          s.tasks[e.task] = newTask(e);
          seconds[e.task] = 0;
        }
        break;
      case 'dispatch':
        if (!t || typeof e.address !== 'string') break;
        runs[e.address] = { task: e.task, check: e.check === true };
        if (e.check === true) {
          t.checks.push({ address: e.address, role: e.role ?? null, agentId: null, attempt: e.attempt ?? t.attempt });
        } else {
          Object.assign(t, {
            address: e.address,
            agentId: null,
            role: e.role ?? null,
            tool: e.tool ?? null,
            inSession: e.inSession ?? null,
            tier: e.tier ?? null,
          });
        }
        break;
      case 'agent': {
        const run = runs[e.address];
        if (!run || !Object.hasOwn(s.tasks, run.task)) break;
        const owner = s.tasks[run.task];
        if (run.check) {
          const c = owner.checks.find((x) => x.address === e.address);
          if (c) c.agentId = e.agentId ?? null;
        } else if (owner.address === e.address) {
          owner.agentId = e.agentId ?? null;
        }
        break;
      }
      case 'signal': {
        if (!t || e.attempt !== t.attempt) break;
        if (e.address && runs[e.address]?.check) break;
        if (e.address && t.address && e.address !== t.address) break;
        if (e.kind === 'started') t.startedAt = later(t.startedAt, e.at);
        if (e.kind === 'heartbeat') {
          if (!t.lastHeartbeat || toMs(e.at) >= toMs(t.lastHeartbeat)) {
            t.lastHeartbeat = e.at ?? null;
            t.busyUntil = e.busyUntil ?? null;
            if (Number.isFinite(e.tokens)) t.tokens = e.tokens;
          }
        }
        if (e.kind === 'done' || e.kind === 'failed') {
          const total = usageTotal(e.usage);
          if (total !== null) t.tokens = total;
        }
        break;
      }
      case 'state': {
        if (!t) break;
        if (t.state === 'running' && runningSince[e.task] !== undefined) {
          seconds[e.task] += Math.max(0, toMs(e.t) - runningSince[e.task]) / MS_PER_SECOND;
          delete runningSince[e.task];
        }
        if ((e.cause === 'retry' || e.cause === 'reject') && e.to === 'ready') resetAttempt(t);
        t.state = e.to;
        t.since = e.t ?? t.since;
        t.cause = e.cause ?? null;
        if (e.to === 'running' && toMs(e.t) !== null) runningSince[e.task] = toMs(e.t);
        break;
      }
      default:
        break;
    }
  }
  const nowMs = toMs(now);
  for (const [id, t] of Object.entries(s.tasks)) {
    let sec = seconds[id] ?? 0;
    if (runningSince[id] !== undefined && nowMs !== null) sec += Math.max(0, nowMs - runningSince[id]) / MS_PER_SECOND;
    t.agentSeconds = Math.round(sec);
  }
  return s;
}

/** The last seq of the events, or 0. */
export function lastSeq(events) {
  return events.reduce((m, e) => (Number.isFinite(e.seq) ? Math.max(m, e.seq) : m), 0);
}

/**
 * state.json, or the fold of the journal when state.json is missing, bad JSON, of another generator, or older than
 * the journal (journalSeq lower than the last seq). It writes nothing.
 */
export function readState(projectDir, { now } = {}) {
  const { events } = readJournal(projectDir);
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(queuePaths(projectDir).state, 'utf8'));
  } catch {
    state = null;
  }
  const usable =
    state !== null &&
    typeof state === 'object' &&
    state.generator === GENERATOR &&
    Number.isFinite(state.journalSeq) &&
    state.journalSeq >= lastSeq(events) &&
    state.tasks !== null &&
    typeof state.tasks === 'object';
  return usable ? state : fold(events, { now });
}

/**
 * The late mark of a task at `now`: 'no-ack' for a dispatched task after the ack timeout, 'no heartbeat for <n>m'
 * for a running task after its lease, else null. The lease ends at the later of busyUntil + 5 min and the last
 * heartbeat + 15 min (section 4a).
 */
export function lateMark(task, now) {
  const nowMs = toMs(now);
  if (!task || nowMs === null) return null;
  if (task.state === 'dispatched') {
    const since = toMs(task.since);
    return since !== null && nowMs - since >= ACK_TIMEOUT_MS ? 'no-ack' : null;
  }
  if (task.state === 'running') {
    const base = toMs(task.lastHeartbeat) ?? toMs(task.startedAt) ?? toMs(task.since);
    if (base === null) return null;
    const busy = toMs(task.busyUntil);
    const leaseEnd = Math.max(base + LEASE_AFTER_HEARTBEAT_MS, busy === null ? 0 : busy + LEASE_AFTER_BUSY_MS);
    if (nowMs < leaseEnd) return null;
    return `no heartbeat for ${Math.floor((nowMs - base) / MS_PER_MINUTE)}m`;
  }
  return null;
}

function isRealDir(p) {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** The folder of a signal owner, after the ID checks. Throws 'invalid ID'. */
export function signalDir(projectDir, owner) {
  const p = queuePaths(projectDir);
  if (owner && owner.agentId !== undefined) {
    if (!validId('agent', owner.agentId)) throw invalidId();
    return path.join(p.signals, 'agents', owner.agentId);
  }
  if (!owner || !validId('task', owner.task) || !validId('attempt', owner.attempt)) throw invalidId();
  return path.join(p.signals, owner.task, String(Number(owner.attempt)));
}

/**
 * Write one signal file (section 4a). owner is { task, attempt } or { agentId }. started, done, failed and
 * dispatch.json are created with the flag wx (an existing file throws 'exists'); heartbeat is written again by a
 * temp file and a rename. Each ID is checked first ('invalid ID'). With no .guilda folder it throws and creates
 * nothing.
 */
export function writeSignal(projectDir, owner, kind, data) {
  const isAgent = owner && owner.agentId !== undefined;
  const kinds = isAgent ? [...SIGNAL_KINDS, DISPATCH_FILE] : SIGNAL_KINDS;
  if (!kinds.includes(kind)) throw invalidId();
  const dir = signalDir(projectDir, owner);
  const p = queuePaths(projectDir);
  if (!isRealDir(p.guilda)) throw new Error('refused: guilda is not set up');
  fs.mkdirSync(dir, { recursive: true });
  const real = fs.realpathSync(dir);
  if (real !== path.join(fs.realpathSync(p.root), path.relative(p.root, dir))) {
    throw new Error(`refused: ${dir} is a link`);
  }
  const file = path.join(dir, kind);
  const text = `${JSON.stringify(data)}\n`;
  if (kind === 'heartbeat') {
    const tmp = path.join(dir, `heartbeat.${process.pid}.tmp`);
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    return file;
  }
  try {
    fs.writeFileSync(file, text, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error('exists');
    throw err;
  }
  return file;
}

/**
 * Check a path before the queue script removes it. Return null when it may be removed, else the reason. It
 * deletes nothing. The path must be absolute, be one of `names` in .guilda/queue of the real project root, not be
 * a drive root or the home folder, and not be or pass through a symbolic link.
 */
export function checkRemovable(rootReal, file, names) {
  if (typeof rootReal !== 'string' || typeof file !== 'string' || rootReal === '' || file === '') return 'empty path';
  if (!path.isAbsolute(rootReal) || !path.isAbsolute(file)) return 'not absolute';
  const queueDir = path.join(rootReal, '.guilda', 'queue');
  if (path.dirname(file) !== queueDir || !names.includes(path.basename(file))) return 'not a queue file';
  for (const bad of [path.parse(file).root, os.homedir(), rootReal]) {
    if (path.resolve(file) === path.resolve(bad)) return 'a root or home folder';
  }
  try {
    if (fs.realpathSync(queueDir) !== queueDir) return 'the queue folder is a link';
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) return 'not a plain file';
  } catch {
    return 'cannot read';
  }
  return null;
}

// ---- The writer: lock, recovery and one run (X2, section 4a). Only the queue script calls these. ----

const LOCK_TRIES = 3;
const GIT_TIMEOUT_MS = 10000;
const STATE_TMP = 'state.json.tmp';

/** An error with the exit code of the queue script: 1 refused, 2 I/O error, 3 live lock. */
export class QueueError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

const ioError = (file) => new QueueError(2, `io-error: ${file}`);
const lockedError = (pid) => new QueueError(3, `queue locked by pid ${pid}`);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function removeOwn(rootReal, file, name) {
  if (checkRemovable(rootReal, file, [name]) !== null) return false;
  fs.unlinkSync(file);
  return true;
}

/**
 * Take .guilda/queue/lock. The content { pid, session, at } goes to a temp file first, and a hard link makes the
 * lock, so a lock is never empty (L1). A live pid throws exit 3. A dead pid is taken over: the result is
 * { oldPid, oldSession }; else null.
 */
export function takeLock(P, rootReal, session, nowIso) {
  const name = `lock.${process.pid}.tmp`;
  const tmp = path.join(P.dir, name);
  const body = `${JSON.stringify({ pid: process.pid, session: session ?? null, at: nowIso })}\n`;
  try {
    fs.writeFileSync(tmp, body);
  } catch {
    throw ioError(P.lock);
  }
  let tmpUsed = false;
  try {
    for (let i = 0; i < LOCK_TRIES; i++) {
      try {
        fs.linkSync(tmp, P.lock);
        return null;
      } catch (err) {
        if (err.code !== 'EEXIST') throw ioError(P.lock);
      }
      let oldText;
      try {
        oldText = fs.readFileSync(P.lock, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw ioError(P.lock);
      }
      let old = null;
      try {
        old = JSON.parse(oldText);
      } catch {
        old = null;
      }
      if (!old || !Number.isInteger(old.pid) || old.pid <= 0) throw lockedError('unknown');
      if (pidAlive(old.pid)) throw lockedError(old.pid);
      // A dead pid: replace the lock if it is still the same stale lock, then check that it is ours.
      let again;
      try {
        again = fs.readFileSync(P.lock, 'utf8');
      } catch {
        continue;
      }
      if (again !== oldText) continue;
      fs.renameSync(tmp, P.lock);
      tmpUsed = true;
      const mine = JSON.parse(fs.readFileSync(P.lock, 'utf8'));
      if (mine.pid !== process.pid) throw lockedError(mine.pid);
      return { oldPid: old.pid, oldSession: old.session ?? null };
    }
    throw lockedError('unknown');
  } finally {
    if (!tmpUsed) removeOwn(rootReal, tmp, name);
  }
}

/** Remove the lock only when it holds this pid (R20: one exact path, one file). */
export function releaseLock(P, rootReal) {
  let cur;
  try {
    cur = JSON.parse(fs.readFileSync(P.lock, 'utf8'));
  } catch {
    return false;
  }
  if (!cur || cur.pid !== process.pid) return false;
  return removeOwn(rootReal, P.lock, 'lock');
}

function readJsonFile(file) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

function gitHead(root) {
  try {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
    const out = r.status === 0 ? String(r.stdout).trim() : '';
    return /^[0-9a-f]{40,64}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** The runs of the journal: address -> { task, attempt, check }. */
export function runsOf(events) {
  const runs = new Map();
  for (const e of events) {
    if (e.type === 'dispatch' && typeof e.address === 'string') {
      runs.set(e.address, { task: e.task, attempt: e.attempt, check: e.check === true });
    }
  }
  return runs;
}

const ownerKey = (e) => (e.agentId ? `a/${e.agentId}` : `t/${e.task}/${e.attempt}`);
const signalKey = (e) => `${ownerKey(e)}/${e.kind}/${e.at}`;

/** Recovery step 3, part 1: one agent event for each dispatch.json of a known address (X3). */
function foldAgents(P, events, emit) {
  const runs = runsOf(events);
  const bound = new Set(events.filter((e) => e.type === 'agent').map((e) => `${e.address}/${e.agentId}`));
  for (const agentId of listDirs(path.join(P.signals, 'agents')).sort()) {
    if (!validId('agent', agentId)) continue;
    const d = readJsonFile(path.join(P.signals, 'agents', agentId, DISPATCH_FILE));
    if (!d || !validId('address', d.address) || !runs.has(d.address)) continue;
    if (bound.has(`${d.address}/${agentId}`)) continue;
    const run = runs.get(d.address);
    emit({ type: 'agent', address: d.address, task: run.task, attempt: run.attempt, agentId });
    bound.add(`${d.address}/${agentId}`);
  }
}

/** Recovery step 3, part 2: the new signal files, in the order of `at`. */
function newSignals(P, events) {
  const seen = new Set(events.filter((e) => e.type === 'signal').map(signalKey));
  const runs = runsOf(events);
  const found = [];
  const add = (owner, kind, body) => {
    if (!body || typeof body.at !== 'string' || Number.isNaN(Date.parse(body.at))) return;
    const e = {
      type: 'signal',
      address: owner.address ?? null,
      task: owner.task,
      attempt: owner.attempt,
      kind,
      at: body.at,
      reason: body.reason ?? null,
      usage: body.usage ?? null,
      tokens: body.tokens ?? null,
      busyUntil: body.busyUntil ?? null,
    };
    if (owner.agentId) e.agentId = owner.agentId;
    const key = signalKey(e);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(e);
  };
  for (const taskId of listDirs(P.signals)) {
    if (taskId === 'agents' || !validId('task', taskId)) continue;
    for (const att of listDirs(path.join(P.signals, taskId))) {
      if (!validId('attempt', att)) continue;
      const attempt = Number(att);
      let address = null;
      for (const [a, r] of runs) if (r.task === taskId && r.attempt === attempt && !r.check) address = a;
      for (const kind of SIGNAL_KINDS) {
        add({ task: taskId, attempt, address }, kind, readJsonFile(path.join(P.signals, taskId, att, kind)));
      }
    }
  }
  const bindings = new Map();
  for (const e of events) if (e.type === 'agent' && validId('agent', e.agentId)) bindings.set(e.agentId, e);
  for (const [agentId, b] of bindings) {
    for (const kind of SIGNAL_KINDS) {
      const owner = { task: b.task, attempt: b.attempt, address: b.address, agentId };
      add(owner, kind, readJsonFile(path.join(P.signals, 'agents', agentId, kind)));
    }
  }
  return found.map((e, i) => ({ e, i })).sort((a, b) => Date.parse(a.e.at) - Date.parse(b.e.at) || a.i - b.i).map((x) => x.e);
}

/** The state change of one signal of the current work run, or null (section 4a). */
export function signalTransition(state, e) {
  const t = state.tasks[e.task];
  if (!t || e.attempt !== t.attempt) return null;
  if (e.address && t.checks.some((c) => c.address === e.address)) return null;
  if (e.address && t.address && e.address !== t.address) return null;
  const go = (to, cause) => ({ task: e.task, from: t.state, to, cause });
  if (e.kind === 'started' && t.state === 'dispatched') return go('running', 'started');
  if (e.kind === 'heartbeat' && t.state === 'stalled') return go('running', 'heartbeat');
  if (e.kind === 'done' && t.state === 'running') return go('review', 'done');
  if (e.kind === 'done' && t.state === 'stalled') return go('review', 'late-done');
  if (e.kind === 'failed' && t.state === 'running') return go('failed', 'failed');
  return null;
}

/** Recovery steps 3 and 4: agent events, signal events and their states, the timeouts and the dependencies. */
export function recover(P, events, emit, nowIso, headOf) {
  foldAgents(P, events, emit);
  for (const sig of newSignals(P, events)) {
    if (sig.kind === 'done') sig.head = headOf();
    emit(sig);
    const tr = signalTransition(fold(events), sig);
    if (tr) emit({ type: 'state', ...tr });
  }
  let state = fold(events, { now: nowIso });
  for (const [id, t] of Object.entries(state.tasks)) {
    const mark = lateMark(t, nowIso);
    if (mark) emit({ type: 'state', task: id, from: t.state, to: 'stalled', cause: mark === 'no-ack' ? 'no-ack' : 'no-heartbeat' });
  }
  state = fold(events, { now: nowIso });
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.state === 'pending' && t.deps.every((d) => state.tasks[d]?.state === 'done')) {
      emit({ type: 'state', task: id, from: 'pending', to: 'ready', cause: 'deps-done' });
    }
  }
}

/** The real paths of the queue of a project, with .guilda/queue created when missing (never .guilda itself). */
export function openQueue(projectDir) {
  let rootReal;
  try {
    rootReal = fs.realpathSync(path.resolve(projectDir));
  } catch {
    throw ioError(path.resolve(projectDir));
  }
  const P = queuePaths(rootReal);
  if (!isRealDir(P.guilda)) throw new QueueError(1, 'refused: guilda is not set up');
  try {
    fs.mkdirSync(P.dir);
  } catch (err) {
    if (err.code !== 'EEXIST') throw ioError(P.dir);
  }
  try {
    if (fs.realpathSync(P.dir) !== P.dir) throw ioError(P.dir);
  } catch (err) {
    if (err instanceof QueueError) throw err;
    throw ioError(P.dir);
  }
  return { P, rootReal };
}

function readJournalText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw ioError(file);
  }
}

/**
 * One run of the queue writer (section 4a): take the lock, replay the journal, turn the signal files into events,
 * check the timeouts, run `work`, then write the new events and state.json, and remove the lock. `work(ctx)` gets
 * { state, events, emit, now }. It throws a QueueError with exit 1 to refuse: then nothing is written. The result:
 * { added, skipped, result }.
 */
export function runWriter(projectDir, { now, session = null } = {}, work = null) {
  const { P, rootReal } = openQueue(projectDir);
  const takeover = takeLock(P, rootReal, session, now);
  try {
    const text = readJournalText(P.journal);
    const { events, skipped } = parseJournal(text);
    let seq = lastSeq(events);
    const pending = [];
    const emit = (e) => {
      const ev = { seq: ++seq, t: now, ...e };
      pending.push(ev);
      events.push(ev);
      return ev;
    };
    if (takeover) emit({ type: 'takeover', ...takeover });
    let head;
    const headOf = () => {
      if (head === undefined) head = gitHead(rootReal);
      return head;
    };
    recover(P, events, emit, now, headOf);
    const result = work ? work({ state: fold(events, { now }), events, emit, now, session }) : null;
    const state = fold(events, { now });
    const tmp = path.join(P.dir, STATE_TMP);
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    } catch {
      throw ioError(P.state);
    }
    if (pending.length > 0) {
      try {
        // Cut a partial last line before the append, so that the new event is not joined to it (L1).
        if (text.length > 0 && !text.endsWith('\n')) fs.truncateSync(P.journal, Buffer.byteLength(text.slice(0, text.lastIndexOf('\n') + 1)));
        fs.appendFileSync(P.journal, pending.map((e) => `${JSON.stringify(e)}\n`).join(''));
      } catch {
        throw ioError(P.journal);
      }
    }
    try {
      fs.renameSync(tmp, P.state);
    } catch {
      throw ioError(P.state);
    }
    return { added: pending.length, skipped, result };
  } finally {
    releaseLock(P, rootReal);
  }
}
