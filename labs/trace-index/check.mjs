#!/usr/bin/env node
// Usage: node labs/trace-index/check.mjs [--brief] 
// Rebuilds the index, then lists:
//   SUSPECT   a cited ID@hash whose block changed since the citer read it, with the block then and now;
//   UNKNOWN   a cited ID that no spec block has (an error);
//   NO-OWNER  a cited ID that no plan task owns (ARC8).
// --brief prints only the changed lines of a suspect block, not both blocks.
// Exit 0 when the list is empty, 1 when it has a SUSPECT or an UNKNOWN.
import { buildIndex, writeIndex, blockText } from './lib.mjs';

const brief = process.argv.includes('--brief');
const t0 = performance.now();
const idx = buildIndex();
writeIndex(idx);
const suspects = [];
const unknown = [];
const cited = new Set();
for (const c of idx.citations) {
  if (c.kind !== 'uses') continue;
  const b = idx.blocks[c.id];
  if (!b) { unknown.push(c); continue; }
  cited.add(c.id);
  if (c.hash !== b.hash) suspects.push({ c, b });
}
const noOwner = [...cited].filter((id) => idx.blocks[id].owners.length === 0).sort();

for (const { c, b } of suspects) {
  console.log(`SUSPECT ${c.citer} (${c.file}:${c.line}) ${c.id}@${c.hash} -> now ${c.id}@${b.hash}`);
  const old = c.commit ? blockText(c.id, b.file, c.commit) : null;
  const now = blockText(c.id, b.file, null);
  if (!old) {
    console.log(`  earlier version: not found (no commit added ${c.id}@${c.hash})`);
  } else {
    console.log(`  read at commit ${c.commit.slice(0, 8)}; hash of the block at that commit: ${old.hash}${old.hash === c.hash ? ' (matches the citation)' : ' (DOES NOT match the citation)'}`);
  }
  if (brief && old) {
    const o = new Set(old.text.split('\n'));
    const n = new Set(now.text.split('\n'));
    for (const l of old.text.split('\n')) if (!n.has(l)) console.log(`  - ${l}`);
    for (const l of now.text.split('\n')) if (!o.has(l)) console.log(`  + ${l}`);
  } else {
    if (old) console.log(`  --- then (${b.file}:${old.start}-${old.end} at ${c.commit.slice(0, 8)})\n${indent(old.text)}`);
    console.log(`  --- now (${b.file}:${now.start}-${now.end})\n${indent(now.text)}`);
  }
}
for (const c of unknown) console.log(`UNKNOWN ${c.citer} (${c.file}:${c.line}) ${c.id}@${c.hash}: no block has this ID`);
for (const id of noOwner) console.log(`NO-OWNER ${id}: no plan task has "Owns: ${id}"`);
const ms = (performance.now() - t0).toFixed(1);
console.log(`summary: ${suspects.length} suspect, ${unknown.length} unknown, ${noOwner.length} no-owner, ${ms} ms`);
process.exit(suspects.length || unknown.length ? 1 : 0);

function indent(t) {
  return t.split('\n').map((l) => '  | ' + l).join('\n');
}
