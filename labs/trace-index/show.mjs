#!/usr/bin/env node
// Usage: node labs/trace-index/show.mjs <ID> [--at <commit>]
// Prints only the block <ID> (its line range from the index), as it is now or as it was at <commit>.
import { loadIndex, blockText } from './lib.mjs';

const args = process.argv.slice(2);
const id = args[0];
const atI = args.indexOf('--at');
const at = atI >= 0 ? args[atI + 1] : null;
if (!id) {
  console.error('usage: show.mjs <ID> [--at <commit>]');
  process.exit(2);
}
const idx = loadIndex();
const b = idx.blocks[id];
if (!b) {
  console.error(`unknown ID: ${id}`);
  process.exit(1);
}
const t = blockText(id, b.file, at);
if (!t) {
  console.error(`${id} not found${at ? ` at ${at}` : ''}`);
  process.exit(1);
}
console.log(`${b.file}:${t.start}-${t.end} ${id}@${t.hash}${at ? ` (at ${at.slice(0, 8)})` : ''}`);
if (!at) {
  console.log(`owners: ${b.owners.join(', ') || 'none'}; cited by: ${b.citedBy.map((c) => `${c.citer}@${c.hash}`).join(', ') || 'none'}`);
}
console.log(t.text);
