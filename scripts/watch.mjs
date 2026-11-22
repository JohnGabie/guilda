#!/usr/bin/env node
// The sleep of the supervisor with no tokens (0.5.0 supervisor, T5).
// Usage: node scripts/watch.mjs <projectDir> --session <id> [--interval <seconds>] [--until <ISO with zone>]
// It keeps the claim alive and prints one line when the next step is not `watch`, then exits.
// Exit codes: 0 a line was printed (or SIGTERM), 1 refused, 2 I/O error, 3 claim lost.
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { readClaim, touchClaim, queuePaths } from './lib/queue.mjs';
import { readFacts, nextStep } from './lib/tick.mjs';
import { USAGE_TIMEOUT_MS } from './lib/usage.mjs';

const USAGE = 'usage: node scripts/watch.mjs <projectDir> --session <id> [--interval <seconds>] [--until <ISO with zone>]';
const DEFAULT_INTERVAL_SEC = 30;
const MIN_INTERVAL_SEC = 1;
const MAX_INTERVAL_SEC = 3600;
/** The usage read runs once in this time, in ms. Between reads the last result is reused. */
export const USAGE_REUSE_MS = 300000;
const MS_PER_SECOND = 1000;
const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const ONE_LINE = new RegExp('[\\r\\n\\u2028\\u2029]+', 'g');
const line = (text) => process.stdout.write(`${String(text).replace(ONE_LINE, ' ')}\n`);
const refuse = (message) => {
  line(`refused: ${message}`);
  process.exitCode = 1;
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--session', '--interval', '--until'].includes(a)) {
      if (i + 1 >= argv.length) return null;
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  if (positional.length !== 1 || flags.session === undefined) return null;
  return { projectDir: positional[0], flags };
}

/** A `run` seam for readUsage that calls the real command at most once in USAGE_REUSE_MS. */
function cachedRun() {
  let last = null;
  let at = 0;
  return (file, args, opts) => {
    if (last !== null && Date.now() - at < USAGE_REUSE_MS) return last;
    last = spawnSync(file, args, { ...opts, timeout: USAGE_TIMEOUT_MS, shell: false, encoding: 'utf8' });
    at = Date.now();
    return last;
  };
}

const TOUCH_TRIES = 3;
const TOUCH_RETRY_MS = 100;

/** touchClaim, tried again a few times: a busy queue lock gives false for a short time. */
async function touched(projectDir, session) {
  for (let i = 0; i < TOUCH_TRIES; i++) {
    if (touchClaim(projectDir, session, { pid: process.pid })) return true;
    if (i + 1 < TOUCH_TRIES) await sleep(TOUCH_RETRY_MS);
  }
  return false;
}

/** The one line of a step that is not `watch`. */
function stepLine(s) {
  const what = s.task ?? s.why ?? (Array.isArray(s.ids) ? s.ids.join(',') : s.slots);
  return what === undefined ? s.step : `${s.step} ${what}`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) return refuse(USAGE);
  const { projectDir, flags } = parsed;
  let intervalSec = DEFAULT_INTERVAL_SEC;
  if (flags.interval !== undefined) {
    if (!/^[0-9]{1,4}$/.test(flags.interval)) return refuse(USAGE);
    intervalSec = Number(flags.interval);
    if (intervalSec < MIN_INTERVAL_SEC || intervalSec > MAX_INTERVAL_SEC) return refuse(USAGE);
  }
  let untilMs = null;
  if (flags.until !== undefined) {
    untilMs = ISO_ZONED.test(flags.until) ? Date.parse(flags.until) : NaN;
    if (Number.isNaN(untilMs)) return refuse('bad --until');
  }
  const session = flags.session;
  const run = cachedRun();

  for (;;) {
    try {
      const now = new Date().toISOString();
      const claim = readClaim(projectDir, { now });
      if (!claim || claim.session !== session || !claim.live) {
        line('claim-lost');
        process.exitCode = 3;
        return;
      }
      if (!(await touched(projectDir, session))) {
        // The claim is still live and ours, so the write failed: an I/O error, not a lost claim.
        const again = readClaim(projectDir);
        if (again && again.session === session && again.live) {
          line(`io-error ${queuePaths(projectDir).writer}`);
          process.exitCode = 2;
        } else {
          line('claim-lost');
          process.exitCode = 3;
        }
        return;
      }
      const step = nextStep(readFacts(projectDir, { now, session, run }));
      if (step.step !== 'watch') {
        line(stepLine(step));
        return;
      }
      if (untilMs !== null && Date.now() >= untilMs) {
        line('until');
        return;
      }
    } catch (err) {
      line(`io-error ${err?.message ?? err}`);
      process.exitCode = 2;
      return;
    }
    const left = untilMs === null ? Infinity : untilMs - Date.now();
    await sleep(Math.max(1, Math.min(intervalSec * MS_PER_SECOND, left)));
  }
}

process.on('SIGTERM', () => process.exit(0));
await main();
