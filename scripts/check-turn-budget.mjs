#!/usr/bin/env node
// Product script of the turn-budget rule (AIG6), from lab #58 (docs/labs/2026-11-17-eval-turn-budget.md).
// Flags an eval run whose trace has more turns than the case budget.
// usage: node check-turn-budget.mjs <case>=<budget> <trace.jsonl> [<case>=<budget> <trace.jsonl> ...]
// Reads the last event with type "result" of each trace; its num_turns is the unit of max_turns.
// Prints one JSON line for each trace. Exit 0: all inside budget. Exit 1: at least one over budget.
// Exit 2: a trace has no readable result event (never a silent pass).
import { readFileSync } from 'node:fs';

export function readTurns(text) {
  let turns = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'result' && Number.isInteger(event.num_turns)) turns = event.num_turns;
  }
  return turns;
}

export function check(caseName, budget, text) {
  const turns = readTurns(text);
  if (turns === null) return { case: caseName, budget, turns: null, status: 'unreadable' };
  return { case: caseName, budget, turns, status: turns > budget ? 'over' : 'ok' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let code = 0;
  if (args.length === 0 || args.length % 2 !== 0) {
    console.error('usage: check-turn-budget.mjs <case>=<budget> <trace.jsonl> ...');
    process.exit(2);
  }
  for (let i = 0; i < args.length; i += 2) {
    const [name, b] = args[i].split('=');
    const budget = Number(b);
    if (!name || !Number.isInteger(budget) || budget < 1) { console.error(`bad budget: ${args[i]}`); process.exit(2); }
    const result = check(name, budget, readFileSync(args[i + 1], 'utf8'));
    result.trace = args[i + 1].split('/').slice(-3).join('/');
    console.log(JSON.stringify(result));
    if (result.status === 'over') code = Math.max(code, 1);
    if (result.status === 'unreadable') code = 2;
  }
  process.exit(code);
}
