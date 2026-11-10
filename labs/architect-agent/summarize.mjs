#!/usr/bin/env node
// Prints Markdown tables from the log.jsonl files that run.mjs writes.
// Usage: node summarize.mjs <out-dir-of-way-a> <out-dir-of-way-b>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dirA, dirB] = process.argv.slice(2);
const load = (d) => readFileSync(join(d, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const a = load(dirA);
const b = load(dirB);

const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
const last = (rows) => rows[rows.length - 1];

console.log('| Turn | (a) context | (a) output | (b) main context | (b) main output | (b) Architect context | (b) Architect output |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const ra of a) {
  const m = b.find((r) => r.session === 'main' && r.turn === ra.turn);
  const ar = b.find((r) => r.session === 'arch' && r.turn === ra.turn);
  console.log(`| ${ra.turn} | ${ra.context} | ${ra.output} | ${m ? m.context : '-'} | ${m ? m.output : '-'} | ${ar ? ar.context : '-'} | ${ar ? ar.output : '-'} |`);
}
const bMain = b.filter((r) => r.session === 'main');
const bArch = b.filter((r) => r.session === 'arch');
const endA = last(a).context + last(a).output;
const endMain = last(bMain).context + last(bMain).output;
const endArch = last(bArch).context + last(bArch).output;
const totA = sum(a, 'tokens');
const totB = sum(b, 'tokens');
console.log('');
console.log('| Measure | (a) | (b) |');
console.log('|---|---:|---:|');
console.log(`| Calls | ${a.length} | ${b.length} (main ${bMain.length}, Architect ${bArch.length}) |`);
console.log(`| Context at the end, main session | ${endA} | ${endMain} |`);
console.log(`| Context at the end, Architect session | (same session) | ${endArch} |`);
console.log(`| Total tokens (input + cache read + cache write + output) | ${totA} | ${totB} |`);
console.log(`| Cache read | ${sum(a, 'cacheRead')} | ${sum(b, 'cacheRead')} |`);
console.log(`| Cache write | ${sum(a, 'cacheCreation')} | ${sum(b, 'cacheCreation')} |`);
console.log(`| Output | ${sum(a, 'output')} | ${sum(b, 'output')} |`);
console.log(`| Uncached input | ${sum(a, 'input')} | ${sum(b, 'input')} |`);
// total_cost_usd of a resumed call is the total of its session so far, so the last value of each session counts.
const costA = last(a).costUSD;
const costB = last(bMain).costUSD + last(bArch).costUSD;
console.log(`| List price, USD (from total_cost_usd) | ${costA.toFixed(3)} | ${costB.toFixed(3)} |`);
console.log('');
console.log(`Main (b) smaller than (a) by ${((1 - endMain / endA) * 100).toFixed(1)}% (PASS needs 40% or more).`);
console.log(`Total (b) against (a): ${((totB / totA - 1) * 100).toFixed(1)}% (PASS needs +20% or less).`);
const procs = [...a, ...b].map((r) => r.procsAfter + (r.childAlive ? 1 : 0));
console.log(`Lab processes alive after a call: max ${Math.max(...procs)} over ${procs.length} calls.`);
console.log(`Grand total tokens: ${totA + totB}.`);
