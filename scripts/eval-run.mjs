#!/usr/bin/env node
// Usage: node scripts/eval-run.mjs <projectDir> <evalDir> <case> [--force] [-- <claude plugin eval arguments>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hashDir, skillHash, cacheKey, readEntry, writeEntry } from './lib/eval-cache.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash === -1 ? argv : argv.slice(0, dash);
const extra = dash === -1 ? [] : argv.slice(dash + 1);
const force = own.includes('--force');
const [projectArg, evalArg, caseName] = own.filter((a) => a !== '--force');
if (!projectArg || !evalArg || !caseName) {
  console.error('usage: eval-run.mjs <projectDir> <evalDir> <case> [--force] [-- <claude plugin eval arguments>]');
  process.exit(2);
}

const projectDir = path.resolve(projectArg);
const evalDir = path.resolve(projectDir, evalArg);
const caseDir = path.join(evalDir, caseName);
if (!fs.existsSync(caseDir) || !fs.statSync(caseDir).isDirectory()) {
  console.error(`eval-run: no case ${caseName}`);
  process.exit(1);
}

const key = cacheKey(hashDir(caseDir), skillHash(projectDir), extra);
if (!force) {
  const hit = readEntry(projectDir, key);
  if (hit) {
    process.stdout.write(`eval-run: cached ${caseName}\n${hit.output}`);
    process.exit(0);
  }
}

const r = spawnSync('claude', ['plugin', 'eval', projectDir, '--eval-dir', evalArg, '--case', caseName, ...extra], {
  encoding: 'utf8',
  cwd: projectDir,
});
const output = (r.stdout || '') + (r.stderr || '');
process.stdout.write(output);
const code = r.status === null ? 1 : r.status;
if (code === 0) writeEntry(projectDir, key, { case: caseName, exitCode: 0, output, at: new Date().toISOString() });
process.exit(code);
