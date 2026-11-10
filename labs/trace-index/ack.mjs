#!/usr/bin/env node
// Usage: node labs/trace-index/ack.mjs <brief file or citer, e.g. T3 or brief:T3 or plan:T3> <ID>
// After a person read the change, writes the current hash of <ID> into the `Uses:` line of that citer.
import fs from 'node:fs';
import { buildIndex, writeIndex } from './lib.mjs';

const [who, id] = process.argv.slice(2);
if (!who || !id) {
  console.error('usage: ack.mjs <brief file | T<n> | brief:T<n> | plan:T<n>> <ID>');
  process.exit(2);
}
const idx = buildIndex();
const b = idx.blocks[id];
if (!b) {
  console.error(`unknown ID: ${id}`);
  process.exit(1);
}
const match = (c) => c.kind === 'uses' && c.id === id &&
  (c.file === who || c.citer === who || c.citer === `brief:${who}`);
const hits = idx.citations.filter(match);
if (!hits.length) {
  console.error(`${who} does not cite ${id}`);
  process.exit(1);
}
for (const c of hits) {
  const lines = fs.readFileSync(c.file, 'utf8').split('\n');
  lines[c.line - 1] = lines[c.line - 1].replace(`${id}@${c.hash}`, `${id}@${b.hash}`);
  fs.writeFileSync(c.file, lines.join('\n'));
  console.log(`ack ${c.citer} (${c.file}:${c.line}) ${id}@${c.hash} -> ${id}@${b.hash}`);
}
writeIndex(buildIndex());
