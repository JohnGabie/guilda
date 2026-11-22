import { spawnSync } from 'node:child_process';

/** The time limit of one `cswap budget --json` call, in ms. */
export const USAGE_TIMEOUT_MS = 10000;

/** The notice of each exit code of `cswap budget --json` (spec 5d). */
const EXIT_NOTICES = { 2: 'no accounts', 3: 'usage source unavailable', 4: 'usage command error' };
/** The advice words that pass the data guard. Another value reads as 'unknown'. */
const ADVICE_WORDS = new Set(['can_speed_up', 'ok', 'slow_down', 'blocked']);

const defaultRun = (file, args, opts) => spawnSync(file, args, { ...opts, shell: false, encoding: 'utf8' });

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The longest string the guard keeps. */
const MAX_STRING = 64;
const isText = (v) => typeof v === 'string' && v.length <= MAX_STRING && !v.includes('@');
/** The types of a kept value. A value of another type is dropped. */
const TYPES = {
  str: isText,
  strOrNull: (v) => v === null || isText(v),
  num: (v) => typeof v === 'number' && Number.isFinite(v),
  int: (v) => Number.isInteger(v),
};
/** Keep each field of the schema { key: type } whose value has that type. */
const pick = (obj, schema) => {
  const out = {};
  if (isObject(obj)) for (const [k, type] of Object.entries(schema)) if (TYPES[type](obj[k])) out[k] = obj[k];
  return out;
};
const WINDOW = { usedPercent: 'num', resetsAt: 'strOrNull' };
const windowOf = (w) => (isObject(w) ? pick(w, WINDOW) : undefined);

/**
 * The data guard (D22): keep only the listed fields. An account id with an `@` becomes `account-<n>` (1-based).
 * Returns { budget, notices }. The raw object is never kept, written or logged.
 */
function guard(raw) {
  const notices = [];
  const budget = pick(raw, { schemaVersion: 'int', status: 'str', fetchedAt: 'str' });
  budget.advice = ADVICE_WORDS.has(raw.advice) ? raw.advice : 'unknown';
  if (isObject(raw.fleet)) {
    budget.fleet = pick(raw.fleet, { accounts: 'int', capacityUnits: 'num', remainingUnits: 'num', usableNow: 'int', nextUsableAt: 'strOrNull' });
  }
  if (Array.isArray(raw.resets)) budget.resets = raw.resets.filter(isObject).map((r) => pick(r, { at: 'str' }));
  if (Array.isArray(raw.accounts)) {
    budget.accounts = raw.accounts.filter(isObject).map((a, i) => {
      const acct = pick(a, { id: 'str', plan: 'str' });
      if (typeof a.id === 'string' && a.id.includes('@')) {
        acct.id = `account-${i + 1}`;
        notices.push(`account ${i + 1}: the id had an @ and was replaced`);
      }
      const five = windowOf(a.fiveHour);
      const seven = windowOf(a.sevenDay);
      if (five) acct.fiveHour = five;
      if (seven) acct.sevenDay = seven;
      return acct;
    });
  }
  return { budget, notices };
}

/**
 * Read the cswap budget.
 * { state: 'off', notice? } | { state: 'error', reason } | { state: 'ok', budget, notices? }. Never throws.
 * A non-zero exit code gives 'off' with a notice (spec 5d).
 * `run(file, args, opts) -> { status, stdout }` is the test seam; it may throw.
 */
export function readUsage(config, { run = defaultRun } = {}) {
  if (config?.usage?.source !== 'cswap') return { state: 'off' };
  try {
    const res = run('cswap', ['budget', '--json'], { timeout: USAGE_TIMEOUT_MS });
    if (res?.error) return { state: 'error', reason: `cswap failed: ${res.error.message}` };
    if (res?.signal) return { state: 'error', reason: `cswap stopped by ${res.signal}` };
    if (res?.status !== 0) {
      return { state: 'off', notice: EXIT_NOTICES[res?.status] ?? `cswap budget exited with status ${res?.status}` };
    }
    let raw;
    try {
      raw = JSON.parse(String(res.stdout).trim());
    } catch {
      return { state: 'error', reason: 'bad JSON' };
    }
    if (!isObject(raw)) return { state: 'error', reason: 'cswap budget did not print a JSON object' };
    const { budget, notices } = guard(raw);
    return notices.length > 0 ? { state: 'ok', budget, notices } : { state: 'ok', budget };
  } catch (err) {
    return { state: 'error', reason: `cswap budget unreadable: ${err?.message ?? err}` };
  }
}
