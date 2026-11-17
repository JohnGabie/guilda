#!/usr/bin/env node
// The signal script (D14, D35, section 4a): a worker writes its signals, and `run` wraps an external command.
// Usage: node scripts/signal.mjs <projectDir> <started|heartbeat|done|failed|run> <task> <attempt> [args]
// It never takes the queue lock and never reads or writes the journal.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validId, writeSignal, readState, queuePaths, END_REASONS, checkSignalBody, DEFAULT_TOOL_TIMEOUT_MS } from './lib/queue.mjs';

const USAGE =
  'usage: node scripts/signal.mjs <projectDir> <started|heartbeat|done|failed|run> <task> <attempt> [args] (run: [--timeout <seconds>] -- <command...>)';
const KILL_GRACE_MS = 5000;
const MESSAGE_MAX = 500;
const EXIT_NO_COMMAND = 127;
const SIGNAL_EXIT_BASE = 128;
const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
const LIMIT_OK_STATUSES = ['allowed', 'allowed_warning'];
const USAGE_FILE_MAX = 1 << 20;

class Refused extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const iso = () => new Date().toISOString();

/** Run a signal write and turn its errors into exit 1 (refused) or exit 2 (I/O). */
function write(projectDir, owner, kind, data) {
  try {
    writeSignal(projectDir, owner, kind, data);
  } catch (err) {
    if (err.message === 'exists') throw new Refused(`signal: ${kind} exists`);
    if (err.message === 'invalid ID' || String(err.message).startsWith('refused:')) throw new Refused(err.message);
    throw new Refused(`io-error: ${path.join(projectDir, '.guilda', 'queue', 'signals')}`, 2);
  }
}

function readUsageFile(file) {
  let text;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > USAGE_FILE_MAX) throw new Error('bad');
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Refused('signal: bad --usage file');
  }
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw new Refused('signal: bad --usage file');
  }
  const body = Array.isArray(list) ? checkSignalBody('done', { at: iso(), usage: list }) : null;
  if (!body) throw new Refused('signal: bad --usage file');
  return body.usage;
}

/** Split argv into positional words and the flags in `valueFlags`. Anything else that starts with -- is refused. */
function parseFlags(argv, valueFlags) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valueFlags.includes(a)) {
      if (i + 1 >= argv.length) throw new Refused(USAGE);
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      throw new Refused(USAGE);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function checkOwner(task, attempt) {
  if (!validId('task', task) || !validId('attempt', attempt)) throw new Refused('invalid ID');
  return { task, attempt: Number(attempt) };
}

// ---- The usage of an external run ----

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Reads the usage fields of the JSON events of `claude -p --output-format stream-json` (lab L2, I10). */
class UsageReader {
  constructor() {
    this.perCall = new Map();
    this.session = null;
    this.limit = false;
  }

  /** Returns the total so far when the event has usage fields, else null. */
  feed(ev) {
    if (!ev || typeof ev !== 'object') return null;
    if (ev.type === 'rate_limit_event') {
      const status = ev.rate_limit_info?.status;
      if (typeof status === 'string' && !LIMIT_OK_STATUSES.includes(status)) this.limit = true;
      return null;
    }
    if (ev.type === 'assistant' && ev.message?.usage && typeof ev.message.usage === 'object') {
      const u = ev.message.usage;
      const model = typeof ev.message.model === 'string' ? ev.message.model : 'unknown';
      const cur = this.perCall.get(model) ?? { model, input: 0, cacheRead: 0, cacheCreation: 0, output: 0 };
      cur.input += num(u.input_tokens);
      cur.cacheRead += num(u.cache_read_input_tokens);
      cur.cacheCreation += num(u.cache_creation_input_tokens);
      cur.output += num(u.output_tokens);
      this.perCall.set(model, cur);
      return this.total();
    }
    if (ev.type === 'result' && ev.modelUsage && typeof ev.modelUsage === 'object') {
      const list = Object.entries(ev.modelUsage).map(([model, u]) => ({
        model,
        input: num(u?.inputTokens),
        cacheRead: num(u?.cacheReadInputTokens),
        cacheCreation: num(u?.cacheCreationInputTokens),
        output: num(u?.outputTokens),
      }));
      if (list.length > 0) {
        this.session = list;
        return this.total();
      }
    }
    return null;
  }

  list() {
    if (this.session) return this.session;
    return this.perCall.size > 0 ? [...this.perCall.values()] : null;
  }

  total() {
    return (this.list() ?? []).reduce((n, u) => n + u.input + u.cacheRead + u.cacheCreation + u.output, 0);
  }
}

// ---- The log of the panel (section 4h) ----

function openLog(projectDir, address) {
  if (address === null || !validId('address', address)) return null;
  try {
    const p = queuePaths(projectDir);
    const dir = path.join(p.guilda, 'logs');
    let st = null;
    try {
      st = fs.lstatSync(dir);
    } catch (err) {
      if (err.code !== 'ENOENT') return null;
    }
    if (st === null) fs.mkdirSync(dir);
    else if (st.isSymbolicLink() || !st.isDirectory()) return null;
    const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW;
    return fs.openSync(path.join(dir, `${address}.jsonl`), flags, 0o600);
  } catch {
    return null;
  }
}

// ---- The run wrapper ----

function runCommand(projectDir, owner, rest) {
  const split = rest.indexOf('--');
  if (split < 0 || split === rest.length - 1) throw new Refused(USAGE);
  const { positional, flags } = parseFlags(rest.slice(0, split), ['--timeout']);
  if (positional.length > 0) throw new Refused(USAGE);
  let timeoutMs = null;
  if (flags.timeout !== undefined) {
    const s = Number(flags.timeout);
    if (!/^[0-9]+(\.[0-9]+)?$/.test(flags.timeout) || !(s > 0)) throw new Refused('signal: --timeout must be a positive number');
    timeoutMs = s * 1000;
  }
  const [cmd, ...cmdArgs] = rest.slice(split + 1);

  // started first: with no .guilda folder, or a started file that exists, the command does not run.
  write(projectDir, owner, 'started', { at: iso() });
  let address = null;
  try {
    const t = readState(projectDir).tasks?.[owner.task];
    if (t && t.attempt === owner.attempt && typeof t.address === 'string') address = t.address;
  } catch {
    address = null;
  }
  const logFd = openLog(projectDir, address);
  const log = (kind, text) => {
    if (logFd === null) return;
    try {
      fs.writeSync(logFd, `${JSON.stringify({ t: iso(), kind, text })}\n`);
    } catch {
      // The log is for the panel. A failed line does not stop the run.
    }
  };
  log('state', 'started');

  const reader = new UsageReader();
  const busyMs = timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const beat = (tokens) => {
    try {
      writeSignal(projectDir, owner, 'heartbeat', {
        at: iso(),
        busyUntil: new Date(Date.now() + busyMs).toISOString(),
        tokens,
      });
    } catch {
      // A missed heartbeat only shortens the lease.
    }
  };

  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    let spawnFailed = false;
    let tokens = null;
    let buffer = '';
    let killTimer = null;
    let timeoutTimer = null;

    const onLine = (line) => {
      process.stdout.write(`${line}\n`);
      let total = null;
      if (line.startsWith('{')) {
        try {
          total = reader.feed(JSON.parse(line));
        } catch {
          total = null;
        }
      }
      if (total !== null) {
        tokens = total;
        log('tokens', String(total));
      } else {
        log('message', line.slice(0, MESSAGE_MAX));
      }
      beat(tokens);
    };

    try {
      child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
    } catch {
      spawnFailed = true;
    }
    const finish = (code, sigName) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      if (buffer.length > 0) onLine(buffer);
      buffer = '';
      const exit = code ?? (SIGNAL_EXIT_BASE + (SIGNAL_NUMBERS[sigName] ?? 0));
      const usage = reader.list();
      let reason = null;
      if (timedOut) reason = 'timeout';
      else if (reader.limit) reason = 'limit';
      else if (exit !== 0) reason = 'error';
      let writeFailed = false;
      try {
        if (reason === null) writeSignal(projectDir, owner, 'done', { at: iso(), reason: 'finished', usage });
        else writeSignal(projectDir, owner, 'failed', { at: iso(), reason, usage });
      } catch (err) {
        writeFailed = true;
        process.stderr.write(`signal: ${err.message === 'exists' ? 'end signal exists' : 'io-error'}\n`);
      }
      log('state', reason === null ? 'done' : `failed ${reason}`);
      if (logFd !== null) {
        try {
          fs.closeSync(logFd);
        } catch {
          // Nothing to do.
        }
      }
      resolve(exit === 0 && writeFailed ? 2 : exit);
    };

    if (spawnFailed || !child) {
      finish(EXIT_NO_COMMAND);
      return;
    }
    child.on('error', () => {
      spawnFailed = true;
      finish(EXIT_NO_COMMAND);
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).replace(/\r$/, '');
        buffer = buffer.slice(i + 1);
        onLine(line);
      }
    });
    child.on('close', (code, sigName) => {
      if (!spawnFailed) finish(code, sigName);
    });
    if (timeoutMs !== null) {
      const kill = (sig) => {
        try {
          process.kill(-child.pid, sig);
        } catch {
          try {
            child.kill(sig);
          } catch {
            // The command is gone.
          }
        }
      };
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        kill('SIGTERM');
        killTimer = setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS);
      }, timeoutMs);
    }
  });
}

// ---- Commands ----

async function main(argv) {
  const [projectDir, command, task, attempt, ...rest] = argv;
  if (!projectDir || !command) throw new Refused(USAGE);
  if (!['started', 'heartbeat', 'done', 'failed', 'run'].includes(command)) throw new Refused(USAGE);
  const owner = checkOwner(task, attempt);

  if (command === 'run') return runCommand(projectDir, owner, rest);

  if (command === 'started') {
    if (rest.length > 0) throw new Refused(USAGE);
    write(projectDir, owner, 'started', { at: iso() });
  } else if (command === 'heartbeat') {
    const { positional, flags } = parseFlags(rest, ['--busy-until', '--tokens']);
    if (positional.length > 0) throw new Refused(USAGE);
    const data = { at: iso(), busyUntil: null, tokens: null };
    if (flags['busy-until'] !== undefined) {
      if (Number.isNaN(Date.parse(flags['busy-until']))) throw new Refused('signal: bad --busy-until');
      data.busyUntil = new Date(flags['busy-until']).toISOString();
    }
    if (flags.tokens !== undefined) {
      if (!/^[0-9]{1,15}$/.test(flags.tokens)) throw new Refused('signal: bad --tokens');
      data.tokens = Number(flags.tokens);
    }
    write(projectDir, owner, 'heartbeat', data);
  } else {
    const { positional, flags } = parseFlags(rest, command === 'failed' ? ['--reason', '--usage'] : ['--usage']);
    if (positional.length > 0) throw new Refused(USAGE);
    let reason = 'finished';
    if (command === 'failed') {
      if (!END_REASONS.includes(flags.reason) || flags.reason === 'finished') throw new Refused('signal: bad --reason');
      reason = flags.reason;
    }
    const usage = flags.usage !== undefined ? readUsageFile(flags.usage) : null;
    write(projectDir, owner, command, { at: iso(), reason, usage });
  }
  process.stdout.write(`signal: ${command}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(err instanceof Refused ? err.code : 2);
    },
  );
}
