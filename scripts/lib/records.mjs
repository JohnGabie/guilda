// User records (D31, R35, section 4g, part 2). A hook writes one record for each typed prompt of the main session and
// each answer to the question tool, signed with a key outside the project. `bus.mjs verify` checks a record.
// The key never goes to a log, an error text or the hook output. No path is built from a record ID.
// Limit: a process of the same OS user can still forge a record on purpose (for example, it reads the key in a form
// that the hooks do not see). R35 guards against mistakes and casual forgery, not against a determined agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectHash } from './project.mjs';
import { BusError, MAIN, RECORD_ID, openBus, withMailboxLock } from './bus.mjs';

/** The length of the key, in bytes. A key file of another length is a read error. */
export const KEY_BYTES = 32;
export const RECORD_VERSION = 1;
export const RECORD_KINDS = Object.freeze(['prompt', 'answer']);
/** The one user channel of 0.4.0 (C4-30). */
export const USER_CHANNEL = MAIN;
/** The entry point value of an interactive session (L4-2 C2, C7). Each other value is print mode. */
export const TYPED_ENTRYPOINT = 'cli';
export const USER_FILE = 'user.jsonl';
const RECORD_ID_BYTES = 4;
const KEY_FILE_MODE = 0o600;
const KEY_DIR_MODE = 0o700;
const USER_FILE_MODE = 0o600;
const MAC_HEX = /^[0-9a-f]{64}$/;
const NO_KEY = 'cannot read the key';

const noKey = () => new BusError(1, NO_KEY);

/** The key folder: `$XDG_STATE_HOME/guilda/keys`, else `~/.local/state/guilda/keys`. A relative XDG_STATE_HOME is not used. */
export function keyFolder(env = process.env) {
  const xdg = env.XDG_STATE_HOME;
  const home = typeof env.HOME === 'string' && path.isAbsolute(env.HOME) ? env.HOME : os.homedir();
  const base = typeof xdg === 'string' && path.isAbsolute(xdg) ? xdg : path.join(home, '.local', 'state');
  return path.join(base, 'guilda', 'keys');
}

/** The key file of a project: `<key folder>/<project hash>.key`. The hash comes from the main project root (X9). */
export function keyPath(projectDir, env = process.env) {
  const hash = projectHash(projectDir);
  if (typeof hash !== 'string' || !/^[0-9a-f]{16}$/.test(hash)) throw noKey();
  return path.join(keyFolder(env), `${hash}.key`);
}

/** Read the key through one fd that does not follow a link. Null when the file is missing. */
function readKeyFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw noKey();
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size !== KEY_BYTES) throw noKey();
    const key = Buffer.alloc(KEY_BYTES);
    if (fs.readSync(fd, key, 0, KEY_BYTES, 0) !== KEY_BYTES) throw noKey();
    return key;
  } catch {
    throw noKey();
  } finally {
    fs.closeSync(fd);
  }
}

/** Make the key folder (mode 0700) and a new key file (mode 0600). Another writer can win the race: then read its key. */
function createKey(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: KEY_DIR_MODE });
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, KEY_FILE_MODE);
    try {
      fs.fchmodSync(fd, KEY_FILE_MODE);
      fs.writeSync(fd, crypto.randomBytes(KEY_BYTES));
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    if (err.code !== 'EEXIST') throw noKey();
  }
  const key = readKeyFile(file);
  if (key === null) throw noKey();
  return key;
}

/**
 * The key of a project, 32 bytes. `create: true` makes the folder and the key when they are missing; only a hook that
 * writes a record passes it. Any read error, and a key that is not 32 bytes, gives BusError(1, 'cannot read the key').
 */
export function loadKey(projectDir, env = process.env, { create = false } = {}) {
  const file = keyPath(projectDir, env);
  const key = readKeyFile(file);
  if (key !== null) return key;
  if (!create) throw noKey();
  return createKey(file);
}

/** The value with the keys of each object in sorted order. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  }
  return value;
}

/** The lower-case hex HMAC-SHA256 of the record without `mac`: the UTF-8 bytes of JSON.stringify with sorted keys. */
export function signRecord(record, key) {
  const { mac: _mac, ...rest } = record;
  return crypto.createHmac('sha256', key).update(Buffer.from(JSON.stringify(sorted(rest)), 'utf8')).digest('hex');
}

/** A new signed record { v, id, channel, session, kind, text, question, time, mac }. `random` is for tests only. */
export function makeRecord({ session, kind, text, question = null }, key, random = crypto.randomBytes) {
  const record = {
    v: RECORD_VERSION,
    id: `u-${Buffer.from(random(RECORD_ID_BYTES)).toString('hex')}`,
    channel: USER_CHANNEL,
    session: typeof session === 'string' ? session : null,
    kind,
    text,
    question: kind === 'prompt' ? null : question,
    time: new Date().toISOString(),
  };
  record.mac = signRecord(record, key);
  return record;
}

/** Open the user file with O_NOFOLLOW; it must be a plain file with one link. Null when it is missing. */
function openUserFile(file, flags) {
  let fd;
  try {
    fd = fs.openSync(file, flags | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, USER_FILE_MODE);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new BusError(2, `io-error: ${USER_FILE}`);
  }
  let ok = false;
  try {
    const st = fs.fstatSync(fd);
    ok = st.isFile() && st.nlink === 1;
  } finally {
    if (!ok) fs.closeSync(fd);
  }
  if (!ok) throw new BusError(2, `io-error: ${USER_FILE}`);
  return fd;
}

/** The records of the user file text that parse, in file order. A line that is not JSON is skipped. */
function parseRecords(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line === '') continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === 'object' && !Array.isArray(r)) out.push(r);
    } catch {
      // a partial or forged line is skipped
    }
  }
  return out;
}

/** The records of the user file of a project. A missing file gives []. */
function readRecords(projectDir) {
  const file = path.join(projectDir, '.guilda', 'bus', USER_FILE);
  const fd = openUserFile(file, fs.constants.O_RDONLY);
  if (fd === null) return [];
  try {
    return parseRecords(fs.readFileSync(fd, 'utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Append one record line to `.guilda/bus/user.jsonl`, under the mailbox lock of main (the one user channel). The file
 * is made with mode 0600. An ID that the file holds already gives BusError(1, 'known record id'), so the caller draws again.
 */
export function appendRecord(projectDir, record) {
  if (!record || typeof record.id !== 'string' || !RECORD_ID.test(record.id)) throw new BusError(2, 'bad id');
  const P = openBus(projectDir);
  const file = path.join(P.bus, USER_FILE);
  return withMailboxLock(projectDir, MAIN, () => {
    if (readRecords(projectDir).some((r) => r.id === record.id)) throw new BusError(1, 'known record id');
    const fd = openUserFile(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT);
    try {
      const size = fs.fstatSync(fd).size;
      let lead = '';
      if (size > 0) {
        const last = Buffer.alloc(1);
        fs.readSync(fd, last, 0, 1, size - 1);
        if (last[0] !== 0x0a) lead = '\n';
      }
      fs.writeSync(fd, `${lead}${JSON.stringify(record)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return record;
  });
}

/** True when the record mac is the HMAC of the record, by a constant-time compare. */
function macOk(record, key) {
  if (typeof record.mac !== 'string' || !MAC_HEX.test(record.mac)) return false;
  const want = Buffer.from(signRecord(record, key), 'hex');
  return crypto.timingSafeEqual(Buffer.from(record.mac, 'hex'), want);
}

/**
 * Check one record: { ok: true, record } or { ok: false, reason }. The order: the ID pattern, the key, the lookup,
 * the mac, the channel. The reasons: `unknown record`, `cannot read the key`, `bad mac`, `not a user channel`.
 * It never creates a key.
 */
export function verifyRecord(projectDir, id, env = process.env) {
  if (typeof id !== 'string' || !RECORD_ID.test(id)) return { ok: false, reason: 'unknown record' };
  let key;
  try {
    key = loadKey(projectDir, env);
  } catch {
    return { ok: false, reason: NO_KEY };
  }
  let found;
  try {
    found = readRecords(projectDir).filter((r) => r.id === id);
  } catch {
    found = [];
  }
  if (found.length === 0) return { ok: false, reason: 'unknown record' };
  const record = found.find((r) => macOk(r, key));
  if (!record) return { ok: false, reason: 'bad mac' };
  if (record.channel !== USER_CHANNEL) return { ok: false, reason: 'not a user channel' };
  return { ok: true, record };
}

/**
 * True when the hook input comes from a typed prompt of an interactive main session: the entry point is exactly `cli`
 * (L4-2 C2: print mode is `sdk-cli`), the input has no `agent_id` (a subagent) and no `turn_id` (a Codex host, C6).
 */
export function isTypedSession(env, input) {
  if (!input || typeof input !== 'object') return false;
  if (!env || env.CLAUDE_CODE_ENTRYPOINT !== TYPED_ENTRYPOINT) return false;
  if (input.agent_id !== undefined && input.agent_id !== null) return false;
  return input.turn_id === undefined;
}

/** The text cut to `max` characters (code points). */
export function cutText(text, max) {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join('') : text;
}

/** The most draws of a record ID before the write gives up. */
export const RECORD_DRAWS = 10;

/**
 * Write one record from a hook: load or make the key, then append, with a new ID on a known one. Returns the record,
 * or null on any error. It never throws and never prints, so no key byte and no record text reach a log (X9).
 */
export function writeUserRecord(projectDir, fields, env = process.env, random = crypto.randomBytes) {
  try {
    openBus(projectDir);
    const key = loadKey(projectDir, env, { create: true });
    for (let i = 0; i < RECORD_DRAWS; i += 1) {
      try {
        return appendRecord(projectDir, makeRecord(fields, key, random));
      } catch (err) {
        if (!(err instanceof BusError) || err.message !== 'known record id') return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}
