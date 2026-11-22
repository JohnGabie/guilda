#!/usr/bin/env node
// The council script (D47, section 5h): the one writer of a council channel, `.guilda/bus/council-<4 hex>.jsonl`.
// It writes the channel only through `appendLine` of scripts/lib/bus.mjs, under the lock of the channel (R34).
// Usage: node scripts/council.mjs [<projectDir>] open --question <file> --members <list> --format <adversarial|debate>
//          --record <user record ID> [--max-rounds <n>]
//        node scripts/council.mjs [<projectDir>] say --id <council> --from <member> --type <type> [--to <member>]
//          [--call <ID>] [--claim <t> --evidence <t> --reason <t>] [--position <member>=<ID|none>]...
//          [--decision <t> --why <t>] [--record <user record ID>]
//        node scripts/council.mjs [<projectDir>] read --id <council> [--last <n>]
//        node scripts/council.mjs [<projectDir>] record --id <council> [--register <file>]
// The project folder is the first argument when it is not a command, else CLAUDE_PROJECT_DIR, else the cwd.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { projectState, SETUP_NOTICE } from './lib/project.mjs';
import { ensureIgnored } from './lib/violations.mjs';
import { verifyRecord } from './lib/records.mjs';
import {
  BusError,
  COUNCIL_NAME,
  MAX_TEXT_CHARS,
  RECORD_ID,
  appendLine,
  busPaths,
  mailboxPath,
  openBus,
  readLines,
  textChars,
  withMailboxLock,
} from './lib/bus.mjs';

/** The agent type of the Judge. The Judge is no member of the member list. */
export const JUDGE = 'guilda:judge';
/** The member name of the user. */
export const USER = 'user';
/** A council has this many rounds at most, unless `open` gives another number (U5-9). A round is one claim of each member. */
export const DEFAULT_MAX_ROUNDS = 3;
/** The most rounds that `open` accepts. */
export const MAX_ROUNDS_LIMIT = 10;
/** The most members of one council. */
export const MAX_MEMBERS = 12;
export const FORMATS = Object.freeze(['adversarial', 'debate']);
/** The line types of 5h. `create` is written by `open` only. */
export const JUDGE_TYPES = Object.freeze(['open', 'floor', 'grant', 'deny', 'close']);
export const FLOOR_TYPES = Object.freeze(['claim', 'call']);
export const SAY_TYPES = Object.freeze([...JUDGE_TYPES, ...FLOOR_TYPES, 'decision']);
export const COUNCIL_ID = /^c-[0-9a-f]{8}$/;

const MEMBER_NAME = /^(user|architect|guilda:[a-z0-9][a-z0-9-]{0,63})$/;
const COMMAND_NAMES = ['open', 'say', 'read', 'record'];
const VERSION = 1;
const LINE_ID_BYTES = 4;
const COUNCIL_ID_BYTES = 2;
const COUNCIL_DRAWS = 10;
const NO_POSITION = 'none';
const NO_APPROVAL = 'refused: no approval';
// The user channel lock of the bus: the user records are in its file.
const MAIN_LOCK = 'main';

const usage = (text) => new BusError(2, text);
const refused = (text) => new BusError(1, `refused: ${text}`);

/** Parse `--flag value` pairs. A flag in `many` may repeat and gives a list. A flag outside the lists exits 2. */
function parseFlags(args, valueFlags, many = []) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!valueFlags.includes(a) && !many.includes(a)) throw usage(`bad argument ${a}`);
    if (i + 1 >= args.length) throw usage(`bad ${a.slice(2)}`);
    const value = args[++i];
    const key = a.slice(2);
    if (many.includes(a)) (flags[key] ??= []).push(value);
    else if (Object.hasOwn(flags, key)) throw usage(`bad argument ${a}`);
    else flags[key] = value;
  }
  return flags;
}

/** The text of a flag when it is a non-blank string that fits the text limit, else exit 2 `bad <field>`. */
function text(flags, field) {
  const v = flags[field];
  if (typeof v !== 'string' || v.trim() === '' || textChars(v) > MAX_TEXT_CHARS) throw usage(`bad ${field}`);
  return v;
}

function councilId(flags) {
  const id = flags.id;
  if (typeof id !== 'string' || !COUNCIL_NAME.test(id)) throw usage('bad id');
  return id;
}

function member(flags, field) {
  const v = flags[field];
  if (typeof v !== 'string' || !MEMBER_NAME.test(v)) throw usage(`bad ${field}`);
  return v;
}

/** The user record of `--record` when `verify` accepts it, else exit 1 `refused: no approval` (R35). */
function approved(root, flags, env) {
  const id = flags.record;
  if (typeof id !== 'string' || !RECORD_ID.test(id)) throw new BusError(1, NO_APPROVAL);
  const result = verifyRecord(root, id, env);
  if (!result.ok) throw new BusError(1, NO_APPROVAL);
  return result.record;
}

const lineId = () => `c-${crypto.randomBytes(LINE_ID_BYTES).toString('hex')}`;
const makeLine = (council, from, type, fields) => ({
  v: VERSION,
  id: lineId(),
  council,
  from,
  type,
  ...fields,
  time: new Date().toISOString(),
});

/**
 * The state of a council from its lines: the create line, the phase, the member that holds the floor, the number of
 * claims, and the lines by ID. A member holds the floor after a `floor` or a `grant` that names it. It loses the
 * floor with its next `claim` or `call`. After a `deny`, and at the start, no member holds it (5h).
 */
export function councilState(lines) {
  const state = { create: null, opened: false, closed: false, decided: false, holder: null, openTime: null, claims: 0, byId: new Map() };
  for (const l of lines) {
    if (typeof l.id === 'string') state.byId.set(l.id, l);
    if (l.type === 'create' && state.create === null) {
      state.create = l;
    } else if (state.create === null) {
      continue;
    } else if (l.type === 'open') {
      state.opened = true;
      state.openTime ??= l.time;
    }
    else if (l.type === 'floor' || l.type === 'grant') state.holder = l.to;
    else if (l.type === 'deny') state.holder = null;
    else if (l.type === 'claim' || l.type === 'call') {
      if (l.type === 'claim') state.claims += 1;
      if (state.holder === l.from) state.holder = null;
    } else if (l.type === 'close') {
      state.closed = true;
      state.holder = null;
    } else if (l.type === 'decision') state.decided = true;
  }
  return state;
}

function readCouncil(root, id) {
  let lines;
  try {
    lines = readLines(root, id);
  } catch (err) {
    if (err instanceof BusError) throw new BusError(1, 'unknown council');
    throw err;
  }
  if (lines === null) throw new BusError(1, 'unknown council');
  const state = councilState(lines);
  if (state.create === null) throw new BusError(1, 'unknown council');
  return { lines, state };
}

/** The members of the councils that are open now: the create line is there, and no close line follows. */
export function openCouncilMembers(projectDir) {
  const members = new Set();
  const { bus } = busPaths(projectDir);
  let names;
  try {
    names = fs.readdirSync(bus);
  } catch {
    return members;
  }
  for (const file of names) {
    const id = file.endsWith('.jsonl') ? file.slice(0, -'.jsonl'.length) : '';
    if (!COUNCIL_NAME.test(id)) continue;
    const lines = readLines(projectDir, id);
    const state = lines === null ? null : councilState(lines);
    if (state === null || state.create === null || state.closed) continue;
    if (Array.isArray(state.create.members)) for (const m of state.create.members) members.add(m);
  }
  return members;
}

/** The IDs of the user records that a line of any council file cites: `create`, user `claim` and `decision` lines. */
function citedRecords(root) {
  const cited = new Set();
  let names;
  try {
    names = fs.readdirSync(busPaths(root).bus);
  } catch {
    return cited;
  }
  for (const file of names) {
    const id = file.endsWith('.jsonl') ? file.slice(0, -'.jsonl'.length) : '';
    if (!COUNCIL_NAME.test(id)) continue;
    for (const l of readLines(root, id) ?? []) if (typeof l.record === 'string') cited.add(l.record);
  }
  return cited;
}

/**
 * Run `fn` under the lock of the user channel, so two councils cannot take one record at the same time. The caller
 * holds the council lock first, then this lock: the order is fixed, so no deadlock.
 */
const withRecordLock = (root, fn) => withMailboxLock(root, MAIN_LOCK, fn);

/** A user record is for one use: refuse an ID that a line of any council already cites (R35). Call under the lock. */
function freshRecord(root, recordId) {
  if (citedRecords(root).has(recordId)) throw refused('record already used');
}

function newCouncilName(root) {
  for (let i = 0; i < COUNCIL_DRAWS; i++) {
    const name = `council-${crypto.randomBytes(COUNCIL_ID_BYTES).toString('hex')}`;
    if (!fs.existsSync(mailboxPath(root, name))) return name;
  }
  throw new BusError(1, 'no free council id');
}

function cmdOpen(root, args, cwd, env) {
  const f = parseFlags(args, ['--question', '--members', '--format', '--record', '--max-rounds']);
  approved(root, f, env);
  const questionFile = typeof f.question === 'string' && f.question !== '' ? path.resolve(cwd, f.question) : null;
  if (questionFile === null) throw usage('bad question');
  let question;
  try {
    question = fs.readFileSync(questionFile, 'utf8');
  } catch {
    throw usage('bad question');
  }
  if (question.trim() === '' || textChars(question) > MAX_TEXT_CHARS) throw usage('bad question');
  const members = typeof f.members === 'string' ? f.members.split(',') : [];
  if (members.length < 2 || members.length > MAX_MEMBERS || new Set(members).size !== members.length) throw usage('bad members');
  if (!members.every((m) => MEMBER_NAME.test(m) && m !== JUDGE)) throw usage('bad members');
  if (!FORMATS.includes(f.format)) throw usage('bad format');
  let maxRounds = DEFAULT_MAX_ROUNDS;
  if (f['max-rounds'] !== undefined) {
    if (!/^\d{1,2}$/.test(f['max-rounds'])) throw usage('bad max-rounds');
    maxRounds = Number(f['max-rounds']);
    if (maxRounds < 1 || maxRounds > MAX_ROUNDS_LIMIT) throw usage('bad max-rounds');
  }
  openBus(root);
  ensureIgnored(path.join(root, '.guilda'));
  const name = newCouncilName(root);
  withMailboxLock(root, name, () => {
    withRecordLock(root, () => {
      freshRecord(root, f.record);
      appendLine(
        root,
        name,
        makeLine(name, 'architect', 'create', { question, members, format: f.format, maxRounds, record: f.record }),
      );
    });
  });
  return [name];
}

/** The refusal of a line that the state of the council does not allow, or null. */
function phaseRefusal(type, state) {
  if (state.decided) return 'council closed';
  if (state.closed) return type === 'decision' ? null : 'council closed';
  if (type === 'decision') return 'not closed';
  if (type === 'open') return state.opened ? 'already open' : null;
  if (FLOOR_TYPES.includes(type)) return null;
  return state.opened ? null : 'not open';
}

// The --from binding is not checked here: the script refuses a --from that is not a member, the Judge or user. Who may
// write as the Judge, as a lead or as user is the job of the PreToolUse hook (R34, the integration task).
function checkJudgeLine(type, f, state) {
  const { members, maxRounds } = state.create;
  const fields = {};
  if (type === 'floor' || type === 'grant' || type === 'deny') {
    const to = member(f, 'to');
    if (!members.includes(to)) throw usage('bad to');
    fields.to = to;
  }
  if ((type === 'floor' || type === 'grant') && state.claims >= maxRounds * members.length) throw refused('round limit');
  if (type === 'grant' || type === 'deny') {
    if (f.call !== undefined) {
      if (!COUNCIL_ID.test(f.call) || state.byId.get(f.call)?.type !== 'call') throw usage('bad call');
      fields.call = f.call;
    }
  }
  if (type === 'close') {
    const given = new Map();
    for (const p of f.position ?? []) {
      const eq = p.indexOf('=');
      const who = eq < 0 ? '' : p.slice(0, eq);
      const ref = eq < 0 ? '' : p.slice(eq + 1);
      if (given.has(who)) throw usage('bad position');
      given.set(who, ref);
    }
    const leads = members.filter((m) => m !== USER);
    if (given.size !== leads.length || !leads.every((m) => given.has(m))) throw usage('bad position');
    const positions = {};
    for (const lead of leads) {
      const ref = given.get(lead);
      if (ref === NO_POSITION) {
        positions[lead] = null;
        continue;
      }
      const line = state.byId.get(ref);
      if (!COUNCIL_ID.test(ref) || line?.type !== 'claim' || line.from !== lead) throw usage('bad position');
      positions[lead] = ref;
    }
    fields.positions = positions;
  }
  return fields;
}

function checkFloorLine(root, type, from, f, state, env) {
  if (state.holder !== from) throw refused('no floor');
  const { members } = state.create;
  if (type === 'call') {
    const to = member(f, 'to');
    if (!members.includes(to) || to === from) throw usage('bad to');
    return { to };
  }
  if (from === USER) {
    const record = approved(root, f, env);
    const claim = text(f, 'claim');
    if (claim.trim() !== String(record.text).trim()) throw refused('the text is not the record');
    freshRecord(root, f.record);
    return { claim, record: f.record };
  }
  return { claim: text(f, 'claim'), evidence: text(f, 'evidence'), reason: text(f, 'reason') };
}

function checkDecision(root, from, f, env, state) {
  if (from !== USER) throw refused('not the user');
  const record = approved(root, f, env);
  const decision = text(f, 'decision');
  if (decision.trim() !== String(record.text).trim()) throw refused('the text is not the record');
  freshRecord(root, f.record);
  // A decision record is newer than the open of this council, so an old record cannot decide it (R35).
  const asked = Date.parse(record.time);
  if (!Number.isFinite(asked) || asked < Date.parse(state.openTime)) throw refused('record is older than the council');
  return { decision, why: text(f, 'why'), record: f.record };
}

function cmdSay(root, args, cwd, env) {
  const f = parseFlags(args, ['--id', '--from', '--type', '--to', '--call', '--claim', '--evidence', '--reason',
    '--decision', '--why', '--record'], ['--position']);
  const id = councilId(f);
  const from = f.from === JUDGE ? JUDGE : member(f, 'from');
  if (!SAY_TYPES.includes(f.type)) throw usage('bad type');
  const type = f.type;
  const isJudgeType = JUDGE_TYPES.includes(type);
  return withMailboxLock(root, id, () => withRecordLock(root, () => {
    const { state } = readCouncil(root, id);
    if (isJudgeType && from !== JUDGE) throw refused('not the Judge');
    if (!isJudgeType && from === JUDGE && type !== 'decision') throw refused('no floor');
    let fields;
    if (FLOOR_TYPES.includes(type)) {
      // The floor check comes before the phase check: before `open` and after `close`, no member holds the floor.
      fields = checkFloorLine(root, type, from, f, state, env);
      const phase = phaseRefusal(type, state);
      if (phase) throw refused(phase);
    } else {
      const phase = phaseRefusal(type, state);
      if (phase) throw refused(phase);
      fields = type === 'decision' ? checkDecision(root, from, f, env, state) : checkJudgeLine(type, f, state);
    }
    const line = makeLine(id, from, type, fields);
    appendLine(root, id, line);
    return [JSON.stringify({ id: line.id })];
  }));
}

function cmdRead(root, args) {
  const f = parseFlags(args, ['--id', '--last']);
  const id = councilId(f);
  let last = null;
  if (f.last !== undefined) {
    if (!/^[1-9]\d{0,5}$/.test(f.last)) throw usage('bad last');
    last = Number(f.last);
  }
  const { lines } = readCouncil(root, id);
  return (last === null ? lines : lines.slice(-last)).map((l) => JSON.stringify(l));
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

/** The register entry of a decided council (S5-26): the question, each position, the decision and why. */
export function registerEntry(lines, state) {
  const { create } = state;
  const decision = lines.find((l) => l.type === 'decision');
  const close = lines.find((l) => l.type === 'close');
  const out = [
    `### Council ${create.council} — ${oneLine(create.question).slice(0, 80)}`,
    '',
    `Question: ${oneLine(create.question)}`,
    `Members: ${create.members.join(', ')}. Format: ${create.format}.`,
    'Positions:',
  ];
  for (const [who, ref] of Object.entries(close.positions)) {
    const c = ref === null ? null : state.byId.get(ref);
    out.push(
      c ? `- ${who}: ${oneLine(c.claim)} Evidence: ${oneLine(c.evidence ?? 'none')}. Reason: ${oneLine(c.reason ?? 'none')}.` : `- ${who}: none`,
    );
  }
  out.push(`Decision: ${oneLine(decision.decision)}`, `Why: ${oneLine(decision.why)}`, `Record: ${decision.record}`, '');
  return out;
}

/**
 * The real path of the register file: the folder is resolved with realpath, so a link cannot move the write. The
 * target must be inside the project and outside .guilda/bus (the channel files). Else exit 2 `bad register`.
 */
function registerTarget(root, cwd, value) {
  if (typeof value !== 'string' || value === '') throw usage('bad register');
  const inside = (base, target) => {
    const rel = path.relative(base, target);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  try {
    const wanted = path.resolve(cwd, value);
    const real = path.join(fs.realpathSync(path.dirname(wanted)), path.basename(wanted));
    const target = fs.existsSync(real) ? fs.realpathSync(real) : real;
    const project = fs.realpathSync(root);
    const bus = path.join(project, '.guilda', 'bus');
    if (!inside(project, target) || target === bus || inside(bus, target)) throw usage('bad register');
    return target;
  } catch {
    throw usage('bad register');
  }
}

function cmdRecord(root, args, cwd) {
  const f = parseFlags(args, ['--id', '--register']);
  const id = councilId(f);
  const { lines, state } = readCouncil(root, id);
  if (!state.decided) throw refused('not decided');
  const entry = registerEntry(lines, state);
  if (f.register !== undefined) {
    const file = registerTarget(root, cwd, f.register);
    try {
      fs.appendFileSync(file, `${entry.join('\n')}\n`);
    } catch {
      throw usage('bad register');
    }
  }
  return entry;
}

const COMMANDS = { open: cmdOpen, say: cmdSay, read: cmdRead, record: cmdRecord };

/** Run the script; return { code, lines }. It never calls process.exit. `cwd` and `env` are for tests. */
export function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  try {
    let args = argv;
    let dir = env.CLAUDE_PROJECT_DIR || cwd;
    if (args.length > 0 && !COMMAND_NAMES.includes(args[0]) && !args[0].startsWith('--')) {
      dir = path.resolve(cwd, args[0]);
      args = args.slice(1);
    }
    if (args.length === 0 || !Object.hasOwn(COMMANDS, args[0])) {
      throw usage('usage: node scripts/council.mjs [<projectDir>] <open|say|read|record> [args]');
    }
    const root = path.resolve(cwd, dir);
    if (projectState(root).state === 'none') return { code: 1, lines: [SETUP_NOTICE] };
    return { code: 0, lines: COMMANDS[args[0]](root, args.slice(1), cwd, env) };
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
