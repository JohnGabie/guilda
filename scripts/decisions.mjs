#!/usr/bin/env node
// Keep the pending decisions file .guilda/decisions-pending.md (R13 form).
// Usage: node scripts/decisions.mjs <projectDir> add --id <ID> --context <text> --option <text>... --recommended <n> --blocks <text> [--now <ISO>]
//        node scripts/decisions.mjs <projectDir> list
//        node scripts/decisions.mjs <projectDir> resolve <ID> --answer <text>
import { addDecision, listDecisions, resolveDecision } from './lib/decisions.mjs';

const USAGE =
  'usage: node scripts/decisions.mjs <projectDir> add --id <ID> --context <text> --option <text>... --recommended <n> --blocks <text> [--now <ISO>] | list | resolve <ID> --answer <text>';

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = { option: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const name = a.slice(2);
    if (!['id', 'context', 'option', 'recommended', 'blocks', 'now', 'answer'].includes(name) || i + 1 >= argv.length) {
      fail(USAGE);
    }
    const value = argv[++i];
    if (name === 'option') flags.option.push(value);
    else flags[name] = value;
  }
  return { flags, positional };
}

const [projectDir, command, ...rest] = process.argv.slice(2);
if (!projectDir || !command) fail(USAGE);
const { flags, positional } = parseFlags(rest);
try {
  if (command === 'add') {
    addDecision(projectDir, {
      id: flags.id,
      context: flags.context,
      options: flags.option,
      recommended: /^\d+$/.test(flags.recommended ?? '') ? Number(flags.recommended) : NaN,
      blocks: flags.blocks,
      now: flags.now,
    });
  } else if (command === 'list') {
    const all = listDecisions(projectDir);
    process.stdout.write(all.map((b) => `${b.text}\n`).join('\n'));
  } else if (command === 'resolve') {
    if (positional.length !== 1) fail(USAGE);
    process.stdout.write(`${resolveDecision(projectDir, positional[0], flags.answer)}\n`);
  } else fail(USAGE);
} catch (e) {
  fail(e.message);
}
