#!/usr/bin/env node
// Write the cost record of one build (D35, section 4e): the tokens and the cost of each task, block and build at
// list price, in US dollars and reals. Sources: the `tokens` lines of .guilda/audit.jsonl, the `usage` list of the
// end signal of each external run, and an optional session level from analyze-token-usage.py. No network call and
// no cswap read (X10).
//
// A cost is at list price, from one base price row for each model. It does not cover a long-context row, fast mode,
// batch or a regional rate, and a subscription does not pay list price.
//
// Usage: node scripts/cost.mjs <projectDir> --prices <file> [--work <work ID>]
//        [--session <transcript> --analyzer <path>] [--date <YYYY-MM-DD>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readJournal, fold, validId, GENERATOR } from './lib/queue.mjs';
import { ensureIgnored } from './lib/violations.mjs';

const USAGE =
  'usage: node scripts/cost.mjs <projectDir> --prices <file> [--work <work ID>] [--session <transcript> --analyzer <path>] [--date <YYYY-MM-DD>]';
const TOKEN_KINDS = ['input', 'cacheRead', 'cacheCreation', 'output'];
const TOKENS_PER_PRICE = 1000000;
/** The rate of the record date, or the last rate at most this many days before it (section 4e). */
const MAX_RATE_AGE_DAYS = 7;
const MS_PER_DAY = 86400000;
const FILE_DECIMALS = 4;
const SUMMARY_DECIMALS = 2;
const ANALYZER_TIMEOUT_MS = 60000;
const TMP_BYTES = 4;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_HASH = /@[0-9a-f]{8}$/;
/** The total lines of analyze-token-usage.py and the token kind of each. */
const ANALYZER_LINES = [
  ['input', /^\s*Input tokens:\s*([\d,]+)\s*$/m],
  ['output', /^\s*Output tokens:\s*([\d,]+)\s*$/m],
  ['cacheRead', /^\s*Cache read tokens:\s*([\d,]+)\s*$/m],
  ['cacheCreation', /^\s*Cache creation tokens:\s*([\d,]+)\s*$/m],
];

class Refusal extends Error {}
const refuse = (text) => {
  throw new Refusal(text);
};

const zero = () => ({ input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
const isCount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const round = (n, d) => Number(n.toFixed(d));
const roundTokens = (t) => Object.fromEntries(TOKEN_KINDS.map((k) => [k, round(t[k], FILE_DECIMALS)]));
const tokenSum = (t) => TOKEN_KINDS.reduce((s, k) => s + t[k], 0);

/** The four token sums of the output of analyze-token-usage.py, or null when a line is missing. */
export function parseAnalyzerOutput(text) {
  const sums = {};
  for (const [kind, re] of ANALYZER_LINES) {
    const m = re.exec(String(text));
    if (!m) return null;
    sums[kind] = Number(m[1].replaceAll(',', ''));
  }
  return sums;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const valued = new Set(['--prices', '--work', '--session', '--analyzer', '--date']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valued.has(a)) {
      if (i + 1 >= argv.length) return null;
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  return positional.length === 1 && flags.prices ? { projectDir: positional[0], flags } : null;
}

const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const validDate = (d) => typeof d === 'string' && DATE.test(d) && !Number.isNaN(dayMs(d)) && new Date(dayMs(d)).toISOString().startsWith(d);

/** Read and check the prices file against the record date (section 4e). */
function readPrices(file, date) {
  let prices;
  try {
    prices = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    refuse(`refused: cannot read the prices file`);
  }
  if (!prices || typeof prices !== 'object' || !prices.models || typeof prices.models !== 'object') {
    refuse('refused: the prices file has no models');
  }
  if (prices.priceDate !== date) refuse(`refused: prices of ${prices.priceDate}, the record is ${date}`);
  if (prices.usdPerMTok !== true) refuse('refused: the prices are not US dollars for one million tokens');
  if (!isCount(prices.brlPerUsd) || prices.brlPerUsd === 0) refuse('refused: no brlPerUsd rate');
  if (!validDate(prices.rateDate)) refuse(`refused: rate of ${prices.rateDate} is not a date`);
  const age = (dayMs(date) - dayMs(prices.rateDate)) / MS_PER_DAY;
  if (age < 0) refuse(`refused: rate of ${prices.rateDate} is after the record date ${date}`);
  if (age > MAX_RATE_AGE_DAYS) refuse(`refused: rate of ${prices.rateDate} is more than ${MAX_RATE_AGE_DAYS} days before ${date}`);
  return prices;
}

/** The lines of .guilda/audit.jsonl. A missing file is empty; a bad line is skipped. */
function readAudit(projectDir) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(projectDir, '.guilda', 'audit.jsonl'), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const lines = [];
  for (const raw of text.split('\n')) {
    try {
      const l = JSON.parse(raw);
      if (l && typeof l === 'object') lines.push(l);
    } catch {
      // A bad or partial line is skipped.
    }
  }
  return lines;
}

/** The work of the record: --work, or the one work of the journal. */
function pickWork(events, work) {
  const plans = events.filter((e) => e.type === 'plan' && typeof e.work === 'string');
  const ids = [...new Set(plans.map((e) => e.work))];
  if (work !== undefined) {
    if (!validId('work', work)) refuse('invalid ID');
    const plan = plans.find((e) => e.work === work);
    if (!plan) refuse(`refused: no work ${work} in the journal`);
    return plan;
  }
  if (ids.length === 0) refuse('refused: no work in the journal');
  if (ids.length > 1) refuse(`refused: name the work: ${ids.join(', ')}`);
  return plans[0];
}

/** The plan name of section 4e: the plan file name without `.md` and without `.plan`. */
const planName = (plan) => path.basename(String(plan ?? 'plan')).replace(/\.md$/, '').replace(/\.plan$/, '') || 'plan';

/** The usage items of the work, each with its task: the tokens lines and the end signals of external runs. */
function usageOfWork(events, audit, taskIds) {
  const agentTask = new Map();
  const external = new Set();
  for (const e of events) {
    if (e.type === 'agent' && typeof e.agentId === 'string' && taskIds.has(e.task)) agentTask.set(e.agentId, e.task);
    if (e.type === 'dispatch' && e.inSession === false && taskIds.has(e.task) && typeof e.address === 'string') external.add(e.address);
  }
  const items = [];
  for (const l of audit) {
    if (l.kind !== 'tokens' || typeof l.model !== 'string') continue;
    const task = agentTask.get(l.agentId) ?? l.task;
    if (!taskIds.has(task)) continue;
    items.push({ task, model: l.model, t: l.t, usage: l });
  }
  for (const e of events) {
    if (e.type !== 'signal' || (e.kind !== 'done' && e.kind !== 'failed') || !external.has(e.address)) continue;
    if (!Array.isArray(e.usage)) continue;
    for (const u of e.usage) {
      if (u && typeof u.model === 'string') items.push({ task: e.task, model: u.model, t: e.at ?? e.t, usage: u });
    }
  }
  return items;
}

const costOf = (usage, price) => TOKEN_KINDS.reduce((s, k) => s + (isCount(usage[k]) ? usage[k] : 0) * (isCount(price[k]) ? price[k] : 0), 0) / TOKENS_PER_PRICE;

/** The session level, or null when python3, the analyzer or its total lines are missing. */
function sessionLevel(analyzer, transcript) {
  if (!fs.existsSync(analyzer)) {
    process.stderr.write('cost: analyze-token-usage.py not found at the --analyzer path\n');
    return null;
  }
  try {
    const out = execFileSync('python3', [analyzer, transcript], { encoding: 'utf8', timeout: ANALYZER_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    const sums = parseAnalyzerOutput(out);
    if (sums === null) process.stderr.write('cost: the analyzer output has no token totals\n');
    return sums;
  } catch {
    process.stderr.write('cost: the analyzer did not run (python3 or the analyzer is missing)\n');
    return null;
  }
}

/** Write the record by a temp file and a rename in .guilda/costs/. */
function writeRecord(projectDir, name, record) {
  const guildaDir = path.join(projectDir, '.guilda');
  const dir = path.join(guildaDir, 'costs');
  try {
    fs.mkdirSync(dir);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  if (!fs.lstatSync(dir).isDirectory()) refuse('refused: .guilda/costs is not a real folder');
  ensureIgnored(guildaDir);
  const dest = path.join(dir, name);
  const tmp = `${dest}.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(tmp, dest);
  return dest;
}

export function main(argv, { now = new Date() } = {}) {
  const args = parseArgs(argv);
  if (!args) return { code: 1, lines: [USAGE] };
  const { projectDir, flags } = args;
  try {
    if (flags.session !== undefined && flags.analyzer === undefined) refuse('refused: --session needs --analyzer');
    if (flags.date !== undefined && !validDate(flags.date)) refuse('refused: --date is not a YYYY-MM-DD date');
    const date = flags.date ?? now.toISOString().slice(0, 10);
    const prices = readPrices(flags.prices, date);
    const { events } = readJournal(projectDir);
    const plan = pickWork(events, flags.work);
    const work = plan.work;
    const taskEvents = events.filter((e) => e.type === 'task' && e.work === work && typeof e.task === 'string');
    const taskIds = new Set(taskEvents.map((e) => e.task));
    const items = usageOfWork(events, readAudit(projectDir), taskIds);

    const missing = [...new Set(items.map((i) => i.model))].filter((m) => !Object.hasOwn(prices.models, m) || !prices.models[m]);
    if (missing.length) refuse(`refused: no price for ${missing.join(', ')}`);

    const state = fold(events);
    const rate = prices.brlPerUsd;
    const tasks = {};
    const usdOf = {};
    for (const e of taskEvents) {
      if (Object.hasOwn(tasks, e.task)) continue;
      tasks[e.task] = { tokens: zero(), usd: 0, brl: 0, agentSeconds: state.tasks[e.task]?.agentSeconds ?? 0 };
      usdOf[e.task] = 0;
    }
    let to = plan.t ?? null;
    for (const it of items) {
      const tk = tasks[it.task].tokens;
      for (const k of TOKEN_KINDS) if (isCount(it.usage[k])) tk[k] += it.usage[k];
      usdOf[it.task] += costOf(it.usage, prices.models[it.model]);
      if (typeof it.t === 'string' && (to === null || Date.parse(it.t) > Date.parse(to))) to = it.t;
    }

    // Per block (U6): the tokens and the cost of a task go to the blocks of its Uses: line, in equal parts.
    const blocks = {};
    const blockUsd = {};
    for (const e of taskEvents) {
      const keys = [...new Set((Array.isArray(e.uses) ? e.uses : []).filter((k) => typeof k === 'string').map((k) => k.replace(KEY_HASH, '')))];
      if (!keys.length || !Object.hasOwn(usdOf, e.task)) continue;
      for (const key of keys) {
        blocks[key] ??= { tokens: zero(), usd: 0, brl: 0 };
        blockUsd[key] ??= 0;
        for (const k of TOKEN_KINDS) blocks[key].tokens[k] += tasks[e.task].tokens[k] / keys.length;
        blockUsd[key] += usdOf[e.task] / keys.length;
      }
    }
    for (const [key, b] of Object.entries(blocks)) {
      b.tokens = roundTokens(b.tokens);
      b.usd = round(blockUsd[key], FILE_DECIMALS);
      b.brl = round(blockUsd[key] * rate, FILE_DECIMALS);
    }

    const total = { tokens: zero(), usd: 0, brl: 0, agentSeconds: 0 };
    let totalUsd = 0;
    for (const [id, t] of Object.entries(tasks)) {
      for (const k of TOKEN_KINDS) total.tokens[k] += t.tokens[k];
      total.agentSeconds += t.agentSeconds;
      totalUsd += usdOf[id];
      t.usd = round(usdOf[id], FILE_DECIMALS);
      t.brl = round(usdOf[id] * rate, FILE_DECIMALS);
    }
    total.usd = round(totalUsd, FILE_DECIMALS);
    total.brl = round(totalUsd * rate, FILE_DECIMALS);

    // The session level has no model, so it has no price: its usd and brl are null (one price is for one model).
    let session = null;
    if (flags.session !== undefined) {
      const sums = sessionLevel(flags.analyzer, flags.session);
      session = sums === null ? null : { tokens: sums, usd: null, brl: null };
    }

    const name = planName(plan.plan);
    const record = { generator: GENERATOR, build: plan.plan ?? null, from: plan.t ?? null, to, prices, tasks, blocks, session, total };
    writeRecord(projectDir, `${name}-${work}-${date}.json`, record);
    let summary = `cost: ${name}: ${tokenSum(total.tokens)} tokens, US$ ${totalUsd.toFixed(SUMMARY_DECIMALS)}, R$ ${(totalUsd * rate).toFixed(SUMMARY_DECIMALS)} at list price (prices of ${prices.priceDate})`;
    if (flags.session !== undefined && session === null) summary += '; session: not measured';
    return { code: 0, lines: [summary] };
  } catch (err) {
    if (err instanceof Refusal) return { code: 1, lines: [err.message] };
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) (code === 0 ? process.stdout : process.stderr).write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
