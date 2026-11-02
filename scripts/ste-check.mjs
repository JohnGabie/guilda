#!/usr/bin/env node
// Usage: node scripts/ste-check.mjs <file...>
// Prints one line per finding: <file>:<line> <kind> <detail>. Exit 1 when any finding, 2 on a read error.
// A file out of the writing scope is skipped with its reason on stderr.
import fs from 'node:fs';
import path from 'node:path';
import { steCheck, checkScope, readGlossaries, DEFAULT_VAGUE } from './lib/ste.mjs';
import { loadConfig } from './lib/project.mjs';
import { resolvePluginRoot } from './lib/hook-io.mjs';

const cwd = process.cwd();
const loaded = loadConfig(cwd);
const config = loaded && loaded.ok ? loaded.config : { writing: { free: [], exceptions: [] } };
const glossary = readGlossaries(resolvePluginRoot(), cwd);

let findings = 0;
let errors = 0;
for (const file of process.argv.slice(2)) {
  const rel = path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/');
  const scope = checkScope(rel, config);
  if (!scope.check) {
    process.stderr.write(`${file} skipped: ${scope.reason}\n`);
    continue;
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    process.stderr.write(`${file}: cannot read: ${err.code || err.message}\n`);
    errors++;
    continue;
  }
  for (const f of steCheck(text, { glossary, vague: DEFAULT_VAGUE })) {
    process.stdout.write(`${file}:${f.line} ${f.kind} ${f.detail}\n`);
    findings++;
  }
}
process.exitCode = errors ? 2 : findings ? 1 : 0;
