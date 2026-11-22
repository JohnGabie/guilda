// The bus library (D17, D24, sections 4c and 4n). It owns the mailbox files, the mailbox lock, the receipts and the
// hop count of the loop guard. scripts/bus.mjs is the one writer of the bus through it (R34). Each path from an
// address or a message ID is built only after its pattern check. No path is built from a message text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validId, TASK_ID, readClaim } from './queue.mjs';

/** The longest message text, in characters (4c). */
export const MAX_TEXT_CHARS = 8000;
/** The longest wait for a live mailbox lock, then exit 3 (4c). */
export const LOCK_WAIT_MS = 2000;
/** The shortest and the longest poll pause while the lock is held. */
export const LOCK_POLL_MIN_MS = 5;
export const LOCK_POLL_MAX_MS = 25;
/** A lock of a dead holder that is older than this is stale (4c). */
export const STALE_LOCK_MS = 10000;
/** The message types of 4c. `receipt` is not a message type. */
export const MESSAGE_TYPES = Object.freeze(['request', 'question', 'answer', 'decision', 'reply', 'report', 'notice', 'ack', 'error']);
/** The receipt states of 4c. */
export const RECEIPT_STATES = Object.freeze(['delivered', 'injected', 'read', 'failed']);
/** The states that end the delivery of a message. */
export const DONE_STATES = Object.freeze(['delivered', 'read']);
/** The senders that may set `interrupt` (C4-5). */
export const LEAD_ROLES = Object.freeze(['main', 'architect']);
/** The addresses that are always known for a send (4a). */
export const FIXED_ADDRESSES = Object.freeze(['main', 'architect']);
export const MAIN = 'main';
export const MESSAGE_ID = /^m-[0-9a-f]{8}$/;
export const RECORD_ID = /^u-[0-9a-f]{8}$/;
const RESERVED_ADDRESS = /^(supervisor|council-[0-9a-f]{4})$/;
const MESSAGE_ID_BYTES = 4;
const TMP_BYTES = 4;
const VERSION = 1;
const NOTICE = 'notice';
const RECEIPT = 'receipt';
const NO_TYPE_ACK = 'ack';
const UNKNOWN_PID = 'unknown';

/** An error with the exit code of the bus script: 1 refused, 2 bad input, 3 busy. */
export class BusError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

const bad = (field) => new BusError(2, `bad ${field}`);

/** The paths of the bus of a project. */
export function busPaths(projectDir) {
  const root = path.resolve(projectDir);
  const guilda = path.join(root, '.guilda');
  const bus = path.join(guilda, 'bus');
  return { root, guilda, bus, signals: path.join(bus, 'signals') };
}

/** The mailbox file of an address, after the address check. Throws BusError 'bad address'. */
export function mailboxPath(projectDir, address) {
  if (!validId('address', address)) throw bad('address');
  return path.join(busPaths(projectDir).bus, `${address}.jsonl`);
}

/** The address of a mailbox file name, or null when the name is not `<address>.jsonl`. */
export function mailboxAddress(file) {
  if (typeof file !== 'string' || !file.endsWith('.jsonl')) return null;
  const address = file.slice(0, -'.jsonl'.length);
  return validId('address', address) ? address : null;
}

function isRealDir(p) {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Make `dir` (one level) when it is missing. It must be a real folder after that, not a link. */
function mkdirOne(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  if (!isRealDir(dir)) throw new BusError(2, `io-error: ${path.basename(dir)} is not a folder`);
}

/** Make .guilda/bus when it is missing. .guilda must exist: the bus never creates it (D40). */
export function openBus(projectDir) {
  const P = busPaths(projectDir);
  if (!isRealDir(P.guilda)) throw new BusError(1, 'refused: guilda is not set up');
  mkdirOne(P.bus);
  return P;
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));
function sleep(ms) {
  Atomics.wait(sleeper, 0, 0, ms);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Remove one file by its exact path. A missing file is no error. */
function unlinkOwn(file) {
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The stale check of one lock text (4c, L4-3): { stale, pid }. A JSON lock { pid, time } is stale when its pid is
 * dead and its time is more than 10 s ago. A lock that is not JSON is stale when its mtime is more than 10 s ago.
 */
function staleOf(file, text, nowMs) {
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body && Number.isInteger(body.pid) && body.pid > 0 && Number.isFinite(body.time)) {
    return { stale: !pidAlive(body.pid) && nowMs - body.time > STALE_LOCK_MS, pid: body.pid };
  }
  let mtime;
  try {
    mtime = fs.lstatSync(file).mtimeMs;
  } catch {
    return { stale: false, pid: UNKNOWN_PID };
  }
  return { stale: nowMs - mtime > STALE_LOCK_MS, pid: UNKNOWN_PID };
}

const DELIVER_SUFFIX = '.deliver';

/** A lock name is `join`, an address, or `<address>.deliver` (the delivery lock of 4d). */
function validLockName(name) {
  if (name === 'join' || validId('address', name)) return true;
  return typeof name === 'string' && name.endsWith(DELIVER_SUFFIX) && validId('address', name.slice(0, -DELIVER_SUFFIX.length));
}

const pollPause = () => LOCK_POLL_MIN_MS + crypto.randomInt(LOCK_POLL_MAX_MS - LOCK_POLL_MIN_MS + 1);

/**
 * Take the lock `.guilda/bus/<name>.lock`, where `name` is an address, `join` or `<address>.deliver`. The content { pid, time } goes to
 * a temp file first, and a hard link makes the lock, so a lock is never empty. A live holder: poll for 2 s, then
 * BusError 3 'busy'. A stale lock is replaced under the guard `<name>.lock.takeover.<old pid>`: the sender re-reads
 * the lock and replaces it only when the bytes did not change. The result: { file, body, stalePid } with stalePid
 * null when no stale lock was replaced. The lock is not fair (L4-3). `beforeTakeover` is a test hook, called after
 * the stale check and before the takeover.
 */
export function takeBusLock(projectDir, name, { beforeTakeover } = {}) {
  if (!validLockName(name)) throw bad('address');
  const P = openBus(projectDir);
  const file = path.join(P.bus, `${name}.lock`);
  const body = `${JSON.stringify({ pid: process.pid, time: Date.now() })}\n`;
  const tmp = path.join(P.bus, `.${name}.lock.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, body, { flag: 'wx' });
  let tmpUsed = false;
  const deadline = Date.now() + LOCK_WAIT_MS;
  try {
    for (;;) {
      try {
        fs.linkSync(tmp, file);
        return { file, body, stalePid: null };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      const oldText = readText(file);
      if (oldText !== null) {
        const old = staleOf(file, oldText, Date.now());
        if (old.stale) {
          if (beforeTakeover) beforeTakeover();
          const taken = takeOver(file, tmp, body, oldText, old.pid);
          if (taken) {
            tmpUsed = true;
            return { file, body, stalePid: old.pid };
          }
        }
      }
      if (Date.now() >= deadline) throw new BusError(3, 'busy');
      sleep(pollPause());
    }
  } finally {
    if (!tmpUsed) unlinkOwn(tmp);
  }
}

/**
 * Replace one stale lock under its takeover guard. Exactly one sender holds the guard, as it is made with a hard
 * link. A guard of a dead holder that is older than the stale limit is removed, so it never stops a sender for good.
 * True when this sender now holds the lock.
 */
function takeOver(file, tmp, body, oldText, oldPid) {
  const guard = `${file}.takeover.${oldPid}`;
  try {
    fs.linkSync(tmp, guard);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const held = readText(guard);
    if (held !== null && staleOf(guard, held, Date.now()).stale && readText(guard) === held) unlinkOwn(guard);
    return false;
  }
  try {
    if (readText(file) !== oldText) return false;
    fs.renameSync(tmp, file);
    return readText(file) === body;
  } finally {
    if (readText(guard) === body) unlinkOwn(guard);
  }
}

/** Remove the lock only when it holds this pid and this content. True when it removed the lock. */
export function releaseBusLock(held) {
  const text = readText(held.file);
  if (text === null || text !== held.body) return false;
  let cur;
  try {
    cur = JSON.parse(text);
  } catch {
    return false;
  }
  if (!cur || cur.pid !== process.pid) return false;
  return unlinkOwn(held.file);
}

/** Run `fn(held)` under the mailbox lock of `address`, and release the lock after it. */
export function withMailboxLock(projectDir, address, fn) {
  const held = takeBusLock(projectDir, address);
  try {
    return fn(held);
  } finally {
    releaseBusLock(held);
  }
}

/** Open a bus file with O_NOFOLLOW; it must be a plain file with one link. Returns null when it is missing. */
function openPlain(file, flags) {
  let fd;
  try {
    fd = fs.openSync(file, flags | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o644);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new BusError(2, `io-error: ${path.basename(file)}`);
  }
  let ok = false;
  try {
    const st = fs.fstatSync(fd);
    ok = st.isFile() && st.nlink === 1;
  } finally {
    if (!ok) fs.closeSync(fd);
  }
  if (!ok) throw new BusError(2, `io-error: ${path.basename(file)}`);
  return fd;
}

/**
 * Append lines to a mailbox. The caller holds the mailbox lock. A last partial line of a crashed writer stays, and
 * a newline comes first, so the new line is whole and the reader skips the partial line.
 */
function appendLines(projectDir, address, records) {
  const file = mailboxPath(projectDir, address);
  openBus(projectDir);
  const fd = openPlain(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT);
  try {
    const size = fs.fstatSync(fd).size;
    let lead = '';
    if (size > 0) {
      const last = Buffer.alloc(1);
      fs.readSync(fd, last, 0, 1, size - 1);
      if (last[0] !== 0x0a) lead = '\n';
    }
    fs.writeSync(fd, lead + records.map((r) => `${JSON.stringify(r)}\n`).join(''));
  } finally {
    fs.closeSync(fd);
  }
}

const isHops = (v) => Number.isInteger(v) && v >= 0;

/** One checked line of a mailbox, or null when the line is skipped (4c, D40). */
function readLine(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.type === RECEIPT) {
    if (typeof raw.ref !== 'string' || !MESSAGE_ID.test(raw.ref) || !RECEIPT_STATES.includes(raw.state)) return null;
    return { ...raw, v: raw.v ?? VERSION };
  }
  if (typeof raw.id !== 'string' || !MESSAGE_ID.test(raw.id)) return null;
  if (!validId('address', raw.from) || !validId('address', raw.to) || typeof raw.text !== 'string') return null;
  const line = {
    ...raw,
    v: raw.v ?? VERSION,
    task: typeof raw.task === 'string' && TASK_ID.test(raw.task) ? raw.task : null,
    type: MESSAGE_TYPES.includes(raw.type) ? raw.type : NOTICE,
    reply_to: typeof raw.reply_to === 'string' && MESSAGE_ID.test(raw.reply_to) ? raw.reply_to : null,
    hops: isHops(raw.hops) ? raw.hops : 0,
  };
  if (raw.interrupt === true) line.interrupt = true;
  else delete line.interrupt;
  return line;
}

/** Parse the text of a mailbox. A last line with no newline is partial and skipped. */
export function parseMailbox(text) {
  const parts = text.split('\n');
  parts.pop();
  const out = [];
  for (const part of parts) {
    let raw;
    try {
      raw = JSON.parse(part);
    } catch {
      continue;
    }
    const line = readLine(raw);
    if (line) out.push(line);
  }
  return out;
}

/**
 * The checked lines of the mailbox of an address, messages and receipts in file order (D40). It never throws,
 * creates no folder and does not follow a link. A bad address or a missing mailbox gives [].
 */
export function readMailbox(projectDir, address) {
  try {
    const file = mailboxPath(projectDir, address);
    const fd = openPlain(file, fs.constants.O_RDONLY);
    if (fd === null) return [];
    try {
      return parseMailbox(fs.readFileSync(fd, 'utf8'));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

/** The addresses of the mailbox files of the bus. A file name that is not `<address>.jsonl` is never read. */
export function mailboxAddresses(projectDir) {
  const { bus } = busPaths(projectDir);
  if (!isRealDir(bus)) return [];
  try {
    return fs.readdirSync(bus).map(mailboxAddress).filter((a) => a !== null);
  } catch {
    return [];
  }
}

const isMessage = (l) => l.type !== RECEIPT;

/** The last receipt state of the message `id` in the lines of one mailbox, or null. */
export function receiptState(lines, id) {
  let state = null;
  for (const l of lines) if (l.type === RECEIPT && l.ref === id) state = l.state;
  return state;
}

/** The pending messages of the lines of one mailbox, in file order (4c). An `ack` is never pending. */
export function pendingOf(lines) {
  const states = new Map();
  for (const l of lines) if (l.type === RECEIPT) states.set(l.ref, l.state);
  return lines.filter((l) => isMessage(l) && l.type !== NO_TYPE_ACK && !DONE_STATES.includes(states.get(l.id)));
}

/**
 * Append one receipt { v, type: 'receipt', ref, state, by, time } to the mailbox of `address`, under its lock.
 * `ref` must be a message of that mailbox, else BusError 2 'unknown message'.
 */
export function appendReceipt(projectDir, address, ref, state, by) {
  if (!validId('address', address)) throw bad('address');
  if (typeof ref !== 'string' || !MESSAGE_ID.test(ref)) throw bad('ref');
  if (!RECEIPT_STATES.includes(state)) throw bad('state');
  if (!validId('address', by)) throw bad('by');
  return withMailboxLock(projectDir, address, () => {
    if (!readMailbox(projectDir, address).some((l) => isMessage(l) && l.id === ref)) throw new BusError(2, 'unknown message');
    const receipt = { v: VERSION, type: RECEIPT, ref, state, by, time: new Date().toISOString() };
    appendLines(projectDir, address, [receipt]);
    return receipt;
  });
}

/**
 * The hop count of a new message (4n). `from` main: 0. A `replyTo` that a mailbox holds: 1 + its hops. Else 1 + the
 * hops of the last message of the mailbox of `from` that has a receipt, or 1.
 */
export function computeHops(projectDir, from, replyTo) {
  if (from === MAIN) return 0;
  if (typeof replyTo === 'string' && MESSAGE_ID.test(replyTo)) {
    for (const address of mailboxAddresses(projectDir)) {
      const parent = readMailbox(projectDir, address).find((l) => isMessage(l) && l.id === replyTo);
      if (parent) return 1 + parent.hops;
    }
  }
  const own = readMailbox(projectDir, from);
  const receipted = new Set(own.filter((l) => l.type === RECEIPT).map((l) => l.ref));
  const last = own.filter((l) => isMessage(l) && receipted.has(l.id)).at(-1);
  return last ? 1 + last.hops : 1;
}

/** A new message ID `m-<8 hex>`. */
export function makeMessageId(random = crypto.randomBytes) {
  return `m-${Buffer.from(random(MESSAGE_ID_BYTES)).toString('hex')}`;
}

/**
 * True when a send may go to `to` (4a): main and architect always, supervisor while a claim is live in `root`
 * (no root or a claim read error: unknown), else a bound task or ext address.
 */
export function knownAddress(bindings, to, root = null) {
  if (FIXED_ADDRESSES.includes(to)) return true;
  if (to === 'supervisor') return root !== null && readClaim(root)?.live === true;
  if (RESERVED_ADDRESS.test(to)) return false;
  return Object.hasOwn(bindings, to) && bindings[to].state === 'bound';
}

const chainPrefix = (a, b) => {
  const [x, y] = [a, b].sort();
  return `Loop guard stopped chain ${x} <-> ${y}:`;
};

/** The time of the last message from main in any mailbox, in ms, or -1. */
function lastMainTime(projectDir) {
  let last = -1;
  for (const address of mailboxAddresses(projectDir)) {
    for (const l of readMailbox(projectDir, address)) {
      if (isMessage(l) && l.from === MAIN) {
        const ms = Date.parse(l.time);
        if (Number.isFinite(ms) && ms > last) last = ms;
      }
    }
  }
  return last;
}

/**
 * Append the loop notice to the mailbox of main, unless that mailbox has a notice of the same pair that is newer
 * than the last message from main (4n). True when it wrote the notice.
 */
export function loopNotice(projectDir, from, to, hops, max) {
  const prefix = chainPrefix(from, to);
  return withMailboxLock(projectDir, MAIN, () => {
    const since = lastMainTime(projectDir);
    const armed = !readMailbox(projectDir, MAIN).some(
      (l) => isMessage(l) && l.type === NOTICE && l.text.startsWith(`${prefix} `) && Date.parse(l.time) > since,
    );
    if (!armed) return false;
    appendLines(projectDir, MAIN, [
      message({ from, to: MAIN, task: null, type: NOTICE, text: `${prefix} hop ${hops} over ${max}.`, replyTo: null, hops: 0 }),
    ]);
    return true;
  });
}

/** One message line of 4c. `record` and `interrupt` are set only when given. */
export function message({ from, to, task = null, type, text, replyTo = null, hops, record = null, interrupt = false }) {
  const line = {
    v: VERSION,
    id: makeMessageId(),
    from,
    to,
    task,
    type,
    text,
    reply_to: replyTo,
    hops,
    time: new Date().toISOString(),
  };
  if (record !== null) line.record = record;
  if (interrupt) line.interrupt = true;
  return line;
}

/**
 * Append one message to the mailbox of `msg.to` under its lock. A stale lock gives one `notice` line first. The
 * caller checks the fields first. Returns the message line.
 */
export function appendMessage(projectDir, fields) {
  return withMailboxLock(projectDir, fields.to, (held) => {
    const lines = [];
    if (held.stalePid !== null) {
      lines.push(message({ from: fields.from, to: fields.to, type: NOTICE, text: `stale lock of pid ${held.stalePid} removed`, hops: 0 }));
    }
    const msg = message(fields);
    lines.push(msg);
    appendLines(projectDir, fields.to, lines);
    return msg;
  });
}

/** The text length in characters (code points), as 4c counts it. */
export const textChars = (text) => [...text].length;
