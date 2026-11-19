#!/usr/bin/env node
// The bus script (D24, R34, section 4h): the one writer of .guilda/bus. Agents and hooks run it; the user does not.
// Usage: node scripts/bus.mjs <projectDir> <send|join|who|pending|deliver|verify> [args]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { projectState, busSettings, adapterSettings, SETUP_NOTICE } from './lib/project.mjs';
import { ensureIgnored } from './lib/violations.mjs';
import { validId, makeAddress, readBindings } from './lib/queue.mjs';
import { deliverPlan } from './lib/router.mjs';
import { verifyRecord } from './lib/records.mjs';
import {
  BusError,
  MAX_TEXT_CHARS,
  MESSAGE_TYPES,
  MESSAGE_ID,
  RECORD_ID,
  LEAD_ROLES,
  appendMessage,
  computeHops,
  knownAddress,
  loopNotice,
  openBus,
  readMailbox,
  pendingOf,
  takeBusLock,
  releaseBusLock,
  textChars,
} from './lib/bus.mjs';

const TOOLS = Object.freeze({ codex: 'codex', claude: 'peer' });
const TEST_RANDOM = /^(?:[0-9a-fA-F]{2})+$/;
const JOIN_LOCK = 'join';

const usage = (text) => new BusError(2, text);

/** Parse `--flag value` pairs and the boolean flags of one command. A flag outside the lists exits 2. */
function parseFlags(args, valueFlags, boolFlags = []) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.includes(a)) {
      if (i + 1 >= args.length) throw usage(`bad ${a.slice(2)}`);
      flags[a.slice(2)] = args[++i];
    } else if (boolFlags.includes(a)) {
      flags[a.slice(2)] = true;
    } else {
      throw usage(`bad argument ${a}`);
    }
  }
  return flags;
}

/** The value of a flag when it matches, else BusError 2 'bad <field>'. */
function need(flags, field, ok) {
  const v = flags[field];
  if (typeof v !== 'string' || !ok(v)) throw usage(`bad ${field}`);
  return v;
}

const isAddress = (v) => validId('address', v);

/** The random source of a command: GUILDA_TEST_RANDOM (hex) only when NODE_ENV is test (4h). */
function randomSource() {
  const hex = process.env.GUILDA_TEST_RANDOM;
  if (process.env.NODE_ENV !== 'test' || typeof hex !== 'string' || !TEST_RANDOM.test(hex)) return crypto.randomBytes;
  const bytes = Buffer.from(hex, 'hex');
  return (n) => {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) out[i] = bytes[i % bytes.length];
    return out;
  };
}

function cmdSend(root, args, config) {
  const f = parseFlags(args, ['--from', '--to', '--type', '--text', '--task', '--reply-to', '--record'], ['--interrupt']);
  const from = need(f, 'from', isAddress);
  const to = need(f, 'to', isAddress);
  if (typeof f.type !== 'string') throw usage('bad type');
  if (typeof f.text !== 'string') throw usage('bad text');
  const task = f.task === undefined ? null : need(f, 'task', (v) => validId('task', v));
  const replyTo = f['reply-to'] === undefined ? null : need(f, 'reply-to', (v) => MESSAGE_ID.test(v));
  const record = f.record === undefined ? null : need(f, 'record', (v) => RECORD_ID.test(v));
  if (!MESSAGE_TYPES.includes(f.type)) throw usage('bad type');
  if (f.text === '') throw usage('empty text');
  if (textChars(f.text) > MAX_TEXT_CHARS) throw usage(`text over ${MAX_TEXT_CHARS} characters; send a file path in the text`);
  const interrupt = f.interrupt === true;
  if (interrupt && !LEAD_ROLES.includes(from)) throw usage(`interrupt needs a lead role (${LEAD_ROLES.join(' or ')})`);
  if (!knownAddress(readBindings(root), to)) throw usage(`unknown address ${to}`);
  const hops = computeHops(root, from, replyTo);
  const { maxHops } = busSettings(config);
  ensureIgnored(path.join(root, '.guilda'));
  if (hops > maxHops) {
    loopNotice(root, from, to, hops, maxHops);
    throw usage(`loop limit: hop ${hops} over ${maxHops} (bus.maxHops); a message from main continues the chain`);
  }
  const msg = appendMessage(root, { from, to, task, type: f.type, text: f.text, replyTo, hops, record, interrupt });
  return [JSON.stringify({ id: msg.id })];
}

/** Write the join signal as a temp file and a rename, in .guilda/bus/signals (4b). */
function writeJoinSignal(root, body) {
  const P = openBus(root);
  try {
    fs.mkdirSync(P.signals);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  if (!fs.lstatSync(P.signals).isDirectory()) throw new BusError(2, 'io-error: signals is not a folder');
  const tmp = path.join(P.signals, `.join-${body.address}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`, { flag: 'wx' });
  try {
    fs.renameSync(tmp, path.join(P.signals, `join-${body.address}.json`));
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // the temp file is gone already
    }
    throw err;
  }
}

function cmdJoin(root, args, config) {
  const f = parseFlags(args, ['--tool', '--name']);
  const tool = need(f, 'tool', (v) => validId('tool', v));
  const name = need(f, 'name', (v) => validId('name', v));
  if (!Object.hasOwn(TOOLS, tool)) throw usage(`unknown tool ${tool}`);
  const adapters = adapterSettings(config);
  if (!adapters.codex.enabled && !adapters.peer.enabled) {
    throw usage(`adapter ${tool} is off (adapters.${TOOLS[tool]}.enabled)`);
  }
  ensureIgnored(path.join(root, '.guilda'));
  const held = takeBusLock(root, JOIN_LOCK);
  try {
    const bindings = readBindings(root);
    const same = Object.values(bindings).find(
      (b) => b.tool === tool && b.name === name && b.inSession === false && b.state === 'bound',
    );
    if (same) return [JSON.stringify({ address: same.address })];
    let address;
    try {
      address = makeAddress('ext', { tool, name }, Object.keys(bindings), randomSource());
    } catch (err) {
      throw new BusError(1, err.message);
    }
    writeJoinSignal(root, { address, tool, name, at: new Date().toISOString() });
    return [JSON.stringify({ address })];
  } finally {
    releaseBusLock(held);
  }
}

/** Exactly one of two flags, else exit 2. */
function oneOf(f, a, b) {
  if ((f[a] === undefined) === (f[b] === undefined)) throw usage(`give --${a} or --${b}`);
  return f[a] !== undefined ? a : b;
}

function cmdWho(root, args) {
  const f = parseFlags(args, ['--address', '--role']);
  const which = oneOf(f, 'address', 'role');
  const bound = Object.values(readBindings(root)).filter((b) => b.state === 'bound');
  let found;
  if (which === 'address') {
    const address = need(f, 'address', isAddress);
    found = bound.filter((b) => b.address === address);
  } else {
    const role = need(f, 'role', (v) => validId('role', v));
    found = bound.filter((b) => b.role === role);
  }
  if (found.length === 0) throw new BusError(1, 'no binding');
  if (found.length > 1) throw new BusError(1, 'more than one binding');
  return [JSON.stringify(found[0])];
}

function cmdPending(root, args) {
  const f = parseFlags(args, ['--address', '--session']);
  const which = oneOf(f, 'address', 'session');
  let addresses;
  if (which === 'address') {
    addresses = [need(f, 'address', isAddress)];
  } else {
    const session = need(f, 'session', (v) => validId('session', v));
    addresses = Object.values(readBindings(root))
      .filter((b) => Array.isArray(b.sessions) && b.sessions.includes(session))
      .map((b) => b.address);
  }
  const out = [];
  for (const a of addresses) for (const m of pendingOf(readMailbox(root, a))) out.push(JSON.stringify(m));
  return out;
}

/** List the pending messages of one address with their routes. It starts nothing and writes no receipt (4d). */
function cmdDeliver(root, args) {
  const f = parseFlags(args, ['--address']);
  const address = need(f, 'address', isAddress);
  if (!knownAddress(readBindings(root), address)) throw usage(`unknown address ${address}`);
  return deliverPlan(root, address).map(({ id, route, header }) => JSON.stringify({ id, route, header }));
}

const SHOW_FLAG = '--show';
// The signs that JSON.stringify leaves as they are but a terminal reads: DEL, the C1 controls, the line and paragraph
// separators and the bidi controls.
const RAW_CONTROLS = /[\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** A record field as one line of JSON, with each control sign escaped, so a field cannot fake a line or a colour. */
const shown = (value) =>
  JSON.stringify(value ?? null).replace(RAW_CONTROLS, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * Check one user record (R35, 4g). Exit 0 prints `ok`; with --show, then the kind, the question (`none` when there is
 * none) and the text, each as JSON on one line. Exit 1 prints the reason. It never creates a key.
 */
function cmdVerify(root, args) {
  const [id, ...rest] = args;
  if (typeof id !== 'string' || id === '' || id === SHOW_FLAG) throw usage('bad id');
  const show = rest.length === 1 && rest[0] === SHOW_FLAG;
  if (rest.length > 0 && !show) throw usage(`bad argument ${rest[0]}`);
  const result = verifyRecord(root, id, process.env);
  if (!result.ok) throw new BusError(1, result.reason);
  if (!show) return ['ok'];
  const { kind, question, text } = result.record;
  return ['ok', `kind: ${shown(kind)}`, `question: ${question === null || question === undefined ? 'none' : shown(question)}`, `text: ${shown(text)}`];
}

const COMMANDS = { send: cmdSend, join: cmdJoin, who: cmdWho, pending: cmdPending, deliver: cmdDeliver, verify: cmdVerify };

/** Run the script; return { code, lines }. It never calls process.exit. */
export function main(argv) {
  try {
    if (argv.length < 2) throw usage('usage: node scripts/bus.mjs <projectDir> <send|join|who|pending|deliver|verify> [args]');
    const [projectDir, command, ...args] = argv;
    const root = path.resolve(projectDir);
    const project = projectState(root);
    if (project.state === 'none') return { code: 1, lines: [SETUP_NOTICE] };
    if (!Object.hasOwn(COMMANDS, command)) throw usage(`unknown command ${command}`);
    return { code: 0, lines: COMMANDS[command](root, args, project.config) };
  } catch (err) {
    if (err instanceof BusError) return { code: err.exitCode, lines: [err.message] };
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
