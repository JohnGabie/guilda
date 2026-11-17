#!/usr/bin/env node
// The one writer of .guilda/.init-progress.json: the steps of guilda:init for the panel (D24, section 4h).
// Usage: node scripts/init-progress.mjs <projectDir> start <name>... | set <n> <state>
// Exit 0 when written; 1 on a usage error, an invalid step or state, or no .guilda folder (R28, section 3d);
// 2 on an I/O error. Each write goes to a temp file, then renames it over the target.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { projectState, SETUP_NOTICE } from './lib/project.mjs';

const USAGE = 'usage: node scripts/init-progress.mjs <projectDir> start <name>... | set <n> <state>';
const STATES = ['todo', 'doing', 'done', 'skipped'];
const FILE_NAME = '.init-progress.json';

/** Run the script; return { code, lines }. It never calls process.exit. */
export function main(argv) {
  if (argv.length < 2) return { code: 1, lines: [USAGE] };
  const [projectDir, cmd, ...args] = argv;
  if (projectState(projectDir).state === 'none') return { code: 1, lines: ['refused: guilda is not set up', SETUP_NOTICE] };
  const file = path.join(projectDir, '.guilda', FILE_NAME);
  try {
    if (cmd === 'start') {
      if (args.length === 0) return { code: 1, lines: [USAGE] };
      const steps = args.map((name) => ({ name, state: 'todo' }));
      writeProgress(file, steps);
      return { code: 0, lines: [] };
    }
    if (cmd === 'set') {
      if (args.length !== 2) return { code: 1, lines: [USAGE] };
      const [nText, state] = args;
      if (!STATES.includes(state)) return { code: 1, lines: ['invalid state'] };
      const progress = readProgress(file);
      if (progress === null) return { code: 1, lines: ['no progress yet: run start first'] };
      const n = /^[0-9]+$/.test(nText) ? Number(nText) : NaN;
      if (!(n >= 1 && n <= progress.steps.length)) return { code: 1, lines: ['invalid step'] };
      progress.steps[n - 1] = { ...progress.steps[n - 1], state };
      writeProgress(file, progress.steps);
      return { code: 0, lines: [] };
    }
    return { code: 1, lines: [USAGE] };
  } catch (err) {
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

/** The current file as { at, steps }, or null when there is no file. Throws on a read or parse error. */
function readProgress(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const o = JSON.parse(text);
  if (!o || !Array.isArray(o.steps)) throw new Error(`cannot read ${FILE_NAME}`);
  return o;
}

/** Write the file with a new time, by temp file and rename. */
function writeProgress(file, steps) {
  const body = `${JSON.stringify({ at: new Date().toISOString(), steps }, null, 2)}\n`;
  const tmp = path.join(path.dirname(file), `${FILE_NAME}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, body, { flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // the temp file was never made
    }
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
