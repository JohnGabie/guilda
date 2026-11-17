#!/usr/bin/env node
// The trace script (D27, section 4d): the block index and the citation check.
// Usage: node scripts/trace.mjs <projectDir> <index | check [--short] | show <key> [--at <commit>] | ack <citer> <key>>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectState, SETUP_NOTICE } from './lib/project.mjs';
import { buildIndex, writeIndex, check, showBlock, ack, resolveKey, BLOCKING, TraceError } from './lib/trace.mjs';

const USAGE =
  'usage: node scripts/trace.mjs <projectDir> <index | check [--short] | show <key> [--at <commit>] | ack <citer> <key>>';

const refuse = (message) => new TraceError(message);

function cmdIndex(root) {
  const idx = buildIndex(root);
  writeIndex(root, idx);
  const errors = check(root, { index: { ...idx, citations: [], planTasks: [], covers: [] } });
  const lines = errors.map((f) => f.lines[0]);
  lines.push(`trace: ${Object.keys(idx.blocks).length} blocks, ${idx.citations.length} citations`);
  return { code: errors.length > 0 ? 1 : 0, lines };
}

function cmdCheck(root, args) {
  if (args.some((a) => a !== '--short')) throw refuse(USAGE);
  const idx = buildIndex(root);
  writeIndex(root, idx);
  const findings = check(root, { short: args.includes('--short'), index: idx });
  return { code: findings.some((f) => BLOCKING.includes(f.kind)) ? 1 : 0, lines: findings.flatMap((f) => f.lines) };
}

function cmdShow(root, args) {
  let at = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--at') {
      if (i + 1 >= args.length) throw refuse(USAGE);
      at = args[++i];
    } else rest.push(args[i]);
  }
  if (rest.length !== 1) throw refuse(USAGE);
  const text = showBlock(root, rest[0], { at });
  if (text === null) {
    const ambiguous = at === null && resolveKey(buildIndex(root), rest[0]).finding === 'AMBIGUOUS';
    return { code: 1, lines: [`${ambiguous ? 'ambiguous' : 'unknown'} key: ${rest[0]}`] };
  }
  return { code: 0, lines: [text] };
}

function cmdAck(root, args) {
  if (args.length !== 2) throw refuse(USAGE);
  const r = ack(root, args[0], args[1]);
  return { code: 0, lines: [`trace: ack ${args[0]} ${args[1]}@${r.hash}`] };
}

const COMMANDS = { index: cmdIndex, check: cmdCheck, show: cmdShow, ack: cmdAck };

/** Run the script; return { code, lines }. It never calls process.exit. */
export function main(argv) {
  const [projectDir, command, ...args] = argv;
  if (!projectDir || !command) return { code: 1, lines: [USAGE] };
  const root = path.resolve(projectDir);
  if (projectState(root).state === 'none') return { code: 1, lines: ['refused: guilda is not set up', SETUP_NOTICE] };
  const run = COMMANDS[command];
  if (!run) return { code: 1, lines: [USAGE] };
  try {
    if (command === 'index' && args.length > 0) throw refuse(USAGE);
    return run(root, args);
  } catch (err) {
    if (err instanceof TraceError) return { code: err.exitCode, lines: [err.message] };
    return { code: 2, lines: [`io-error: ${String(err && err.message).split('\n')[0]}`] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, lines } = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
