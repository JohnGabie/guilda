#!/usr/bin/env node
// Print the state of the flow (D21, section 4g). It reads .guilda/ and writes no file.
// Usage: node scripts/status.mjs <projectDir> [--json] [--events <n>] [--now <ISO>]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { projectState, SETUP_NOTICE } from './lib/project.mjs';
import { readState, readJournal, queuePaths } from './lib/queue.mjs';
import { renderStatus, statusJson, DEFAULT_EVENTS } from './lib/status.mjs';

const USAGE = 'usage: node scripts/status.mjs <projectDir> [--json] [--events <n>] [--now <ISO>]';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--events' || a === '--now') {
      if (i + 1 >= argv.length) return null;
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  return positional.length === 1 ? { projectDir: positional[0], flags } : null;
}

/** Run the script; return { code, lines }. It never calls process.exit. */
export function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed) return { code: 1, lines: [USAGE] };
  const { projectDir, flags } = parsed;
  if (projectState(projectDir).state === 'none') return { code: 1, lines: ['refused: guilda is not set up', SETUP_NOTICE] };
  let count = DEFAULT_EVENTS;
  if (flags.events !== undefined) {
    if (!/^[0-9]{1,6}$/.test(flags.events)) return { code: 1, lines: [USAGE] };
    count = Number(flags.events);
  }
  let now = new Date().toISOString();
  if (flags.now !== undefined) {
    const ms = Date.parse(flags.now);
    if (Number.isNaN(ms)) return { code: 1, lines: [USAGE] };
    now = new Date(ms).toISOString();
  }
  const P = queuePaths(projectDir);
  if (!fs.existsSync(P.journal) && !fs.existsSync(P.state)) return { code: 0, lines: ['guilda status: no queue yet'] };
  try {
    const state = readState(projectDir, { now });
    const { events } = readJournal(projectDir);
    if (flags.json) return { code: 0, lines: [JSON.stringify(statusJson(state, events, { now, count }), null, 2)] };
    return { code: 0, lines: [renderStatus(state, events, { now, count }).trimEnd()] };
  } catch (err) {
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
