#!/usr/bin/env node
// Usage: node labs/trace-index/index.mjs
// Builds .guilda/trace/index.json: each block ID with its hash, file, line range, owners, and each citer
// with the commit at which it read the block. Generated; never edit it by hand.
import { buildIndex, writeIndex, INDEX_FILE } from './lib.mjs';

const t0 = performance.now();
const idx = buildIndex();
writeIndex(idx);
const ms = (performance.now() - t0).toFixed(1);
const n = Object.keys(idx.blocks).length;
const uses = idx.citations.filter((c) => c.kind === 'uses').length;
console.log(`${INDEX_FILE}: ${n} blocks, ${uses} citations, ${ms} ms`);
