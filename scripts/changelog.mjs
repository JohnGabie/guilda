#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareSemver } from './lib/version.mjs';

// Keep a Changelog form: `## [0.2.0] - 2026-11-15`. The old form `## 0.1.0 — 2026-11-02` is still read.
const HEADING = [
  /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}\s*$/,
  /^## (\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}\s*$/,
];
// Any other level-2 heading (for example `## [Unreleased]`) and the link references at the end close an entry.
const OTHER_HEADING = /^## /;
const LINK_REFERENCE = /^\[[^\]]+\]:\s*\S/;

function versionOf(line) {
  for (const re of HEADING) {
    const m = line.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Return the changelog entries with from < version <= to, newest first, or "". */
export function changesBetween(changelog, from, to) {
  const entries = [];
  let current = null;
  for (const line of String(changelog).split(/\r?\n/)) {
    const version = versionOf(line);
    if (version) {
      current = { version, lines: [line] };
      entries.push(current);
    } else if (OTHER_HEADING.test(line) || LINK_REFERENCE.test(line)) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return entries
    .filter((e) => compareSemver(e.version, from) > 0 && compareSemver(e.version, to) <= 0)
    .sort((a, b) => compareSemver(b.version, a.version))
    .map((e) => e.lines.join('\n').trim())
    .join('\n\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [from, to, file] = process.argv.slice(2);
  if (!from || !to) {
    console.log('usage: changelog.mjs <from> <to> [changelogPath]');
    process.exit(1);
  }
  const target = file || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    console.log('guilda: cannot read the changelog');
    process.exit(1);
  }
  const out = changesBetween(text, from, to);
  if (out) console.log(out);
}
