// Adapted from scripts/bump-version.sh of superpowers 7.0.0, MIT, Copyright (c) 2025 Jesse Vincent,
// see THIRD-PARTY-NOTICES.md.
//
// Usage:
//   node scripts/bump-version.mjs <version>   write <version> in each listed file
//   node scripts/bump-version.mjs --check     print the version of each listed file, exit 1 if they differ
//   node scripts/bump-version.mjs --audit     run the check, then list the other text files that have the version
//
// The list is .version-bump.json at the repository root (the parent folder of this script's folder).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST_FILE = '.version-bump.json';
const VERSION_FORM = /^\d+\.\d+\.\d+$/;

function fail(message) {
  console.log(message);
  process.exit(1);
}

function readList() {
  const file = path.join(ROOT, LIST_FILE);
  if (!fs.existsSync(file)) fail(`missing: ${LIST_FILE}`);
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(list.files)) throw new Error('"files" is not a list');
    return list;
  } catch (error) {
    return fail(`invalid ${LIST_FILE}: ${error.message}`);
  }
}

/** Read each listed file. Exit 1 with 'missing: <path>' for each one that does not exist. */
function readFiles(list) {
  const entries = list.files.map((entry) => {
    const abs = path.join(ROOT, entry.path);
    if (!fs.existsSync(abs)) return { ...entry, missing: true };
    const text = fs.readFileSync(abs, 'utf8');
    return { ...entry, abs, text, json: JSON.parse(text) };
  });
  const missing = entries.filter((entry) => entry.missing);
  if (missing.length > 0) fail(missing.map((entry) => `missing: ${entry.path}`).join('\n'));
  return entries;
}

function getField(object, dotPath) {
  return dotPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setField(object, dotPath, value) {
  const keys = dotPath.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => node[key], object);
  parent[last] = value;
}

function bump(list, version) {
  if (!VERSION_FORM.test(version)) fail(`invalid version: ${version}`);
  const entries = readFiles(list);
  const lines = [];
  for (const entry of entries) {
    const old = getField(entry.json, entry.field);
    setField(entry.json, entry.field, version);
    const trailing = entry.text.endsWith('\n') ? '\n' : '';
    entry.next = JSON.stringify(entry.json, null, 2) + trailing;
    lines.push(`${entry.path}: ${old} -> ${version}`);
  }
  for (const entry of entries) fs.writeFileSync(entry.abs, entry.next);
  console.log(lines.join('\n'));
}

/** Print the version of each file. Return the common version, or null when one has none or they differ. */
function check(list) {
  const entries = readFiles(list);
  const versions = entries.map((entry) => getField(entry.json, entry.field));
  entries.forEach((entry, i) => console.log(`${entry.path}: ${versions[i]}`));
  const none = entries.filter((entry, i) => typeof versions[i] !== 'string' || versions[i] === '');
  if (none.length > 0) {
    console.log(none.map((entry) => `no version: ${entry.path}`).join('\n'));
    return null;
  }
  const equal = versions.every((v) => v === versions[0]);
  if (!equal) console.log('versions differ');
  return equal ? { version: versions[0], entries } : null;
}

function isExcluded(rel, exclude) {
  const segments = rel.split('/');
  return exclude.some((item) => rel === item || segments.includes(item));
}

function* walk(dir, exclude) {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, dirent.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (isExcluded(rel, exclude)) continue;
    if (dirent.isDirectory()) yield* walk(abs, exclude);
    else if (dirent.isFile()) yield { abs, rel };
  }
}

function audit(list) {
  const result = check(list);
  if (!result) process.exit(1);
  const exclude = list.audit?.exclude ?? [];
  const listed = new Set(list.files.map((entry) => path.normalize(entry.path)));
  const found = [];
  for (const { abs, rel } of walk(ROOT, exclude)) {
    if (listed.has(path.normalize(rel))) continue;
    const buffer = fs.readFileSync(abs);
    if (buffer.includes(0)) continue; // binary
    if (buffer.toString('utf8').includes(result.version)) found.push(rel);
  }
  found.sort();
  for (const rel of found) console.log(rel);
  process.exit(found.length > 0 ? 1 : 0);
}

const arg = process.argv[2];
if (process.argv.length !== 3 || !arg) {
  fail('usage: node scripts/bump-version.mjs <version> | --check | --audit');
}
const list = readList();
if (arg === '--check') process.exit(check(list) ? 0 : 1);
else if (arg === '--audit') audit(list);
else bump(list, arg);
