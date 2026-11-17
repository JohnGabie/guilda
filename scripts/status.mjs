#!/usr/bin/env node
// Print the state of the flow (D21, section 4g). It reads .guilda/ and writes no file.
// Usage: node scripts/status.mjs <projectDir> [--json] [--events <n>] [--agent <name>] [--now <ISO>]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { projectState, SETUP_NOTICE } from './lib/project.mjs';
import { readState, readJournal, queuePaths, ROLE_NAMES } from './lib/queue.mjs';
import { renderStatus, renderAgent, statusJson, DEFAULT_EVENTS } from './lib/status.mjs';
import { buildIndex, resolveKey } from './lib/trace.mjs';

const COMMIT_ID = /^[0-9a-f]{7,64}$/;
const USAGE = 'usage: node scripts/status.mjs <projectDir> [--json] [--events <n>] [--agent <name>] [--now <ISO>]';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--agent') {
      if (i + 1 >= argv.length) return null;
      let name = argv[++i];
      const next = argv[i + 1];
      if (Object.values(ROLE_NAMES).includes(name) && next !== undefined && !next.startsWith('--')) name = `${name} ${argv[++i]}`;
      flags.agent = name;
    } else if (a === '--events' || a === '--now') {
      if (i + 1 >= argv.length) return null;
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  return positional.length === 1 ? { projectDir: positional[0], flags } : null;
}

const GIT_TIMEOUT_MS = 10000;

/** The count of `git rev-list <base>..<head>` (no shell), or null with no repository or an error. */
function countCommits(projectDir, base, head) {
  if (!COMMIT_ID.test(base) || !COMMIT_ID.test(head)) return null;
  try {
    const out = execFileSync('git', ['rev-list', '--count', `${base}..${head}`], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
    const n = Number(out.trim());
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

function readAudit(projectDir) {
  try {
    return fs.readFileSync(`${projectDir}/.guilda/audit.jsonl`, 'utf8').split('\n').flatMap((l) => {
      try {
        const o = JSON.parse(l);
        return o && typeof o === 'object' ? [o] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
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
  if (flags.agent !== undefined) {
    try {
      const state = readState(projectDir, { now });
      const { events } = readJournal(projectDir);
      const index = buildIndex(projectDir);
      const blockNow = (key) => {
        const r = resolveKey(index, key);
        return r.key ? { hash: index.blocks[r.key].hash } : { finding: r.finding };
      };
      const text = renderAgent(flags.agent, state, events, readAudit(projectDir), {
        blockNow,
        countCommits: (b, h) => countCommits(projectDir, b, h),
      });
      if (text === null) return { code: 1, lines: [`status: no agent ${flags.agent}`] };
      return { code: 0, lines: [text.trimEnd()] };
    } catch (err) {
      return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
    }
  }
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
