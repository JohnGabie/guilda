#!/usr/bin/env node
// Usage: node scripts/config-write.mjs <projectDir> <answers.json> [--replace]
// Builds <projectDir>/.guilda/config.json from the answers of guilda:init. The answers file has the config keys
// without guildaVersion; this script takes guildaVersion from the installed plugin. It writes the config only when
// the config passes the schema, and it never replaces an existing config without --replace. Exit 1 with the reason
// on any problem. It also makes .guilda/.gitignore list the hook state files.
// A tier that is missing, empty or a placeholder ("<...>") gets its default from core/tiers.json. Any other string
// value that is still a placeholder stops the write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema } from './lib/project.mjs';
import { installedVersion } from './lib/version.mjs';
import { ensureIgnored } from './lib/violations.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(reason) {
  console.log(reason);
  process.exit(1);
}

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const [projectDir, answersPath] = args.filter((a) => a !== '--replace');
if (!projectDir || !answersPath) fail('usage: config-write.mjs <projectDir> <answers.json> [--replace]');

let answers;
try {
  answers = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
} catch (err) {
  fail(`cannot read the answers as JSON: ${err.message}`);
}
if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
  fail('the answers must be a JSON object');
}

const PLACEHOLDER = /^<.*>$/;
const TIERS = ['master', 'journeyman', 'apprentice'];

/** Return the tiers of the answers, with the default from core/tiers.json for each missing or placeholder tier. */
function fillTiers(tiers) {
  let defaults;
  try {
    defaults = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'core', 'tiers.json'), 'utf8'));
  } catch (err) {
    fail(`config not written: cannot read core/tiers.json: ${err.message}`);
  }
  const given = tiers !== null && typeof tiers === 'object' && !Array.isArray(tiers) ? tiers : {};
  const filled = { ...given };
  for (const key of TIERS) {
    const v = given[key];
    if (typeof v !== 'string' || v.trim() === '' || PLACEHOLDER.test(v.trim())) filled[key] = defaults[key];
  }
  return filled;
}

/** Return the key path of the first string value that is still a placeholder, or null. */
function findPlaceholder(value, at) {
  if (typeof value === 'string') return PLACEHOLDER.test(value.trim()) ? at : null;
  if (value === null || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    const found = findPlaceholder(v, Array.isArray(value) ? `${at}[${k}]` : at ? `${at}.${k}` : k);
    if (found) return found;
  }
  return null;
}

const { guildaVersion: _ignored, ...rest } = answers;
const config = { guildaVersion: installedVersion(PLUGIN_ROOT), ...rest, tiers: fillTiers(rest.tiers) };
const placeholder = findPlaceholder(config, '');
if (placeholder) fail(`config not written: ${placeholder} is still a placeholder; put the real value`);
const problem = checkSchema(config);
if (problem) fail(`config not written: ${problem}`);

const guildaDir = path.join(projectDir, '.guilda');
const file = path.join(guildaDir, 'config.json');
if (fs.existsSync(file) && !replace) {
  fail('config not written: .guilda/config.json exists; run again with --replace after the user approves');
}
try {
  fs.mkdirSync(guildaDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  ensureIgnored(guildaDir);
} catch (err) {
  fail(`config not written: ${err.message}`);
}
console.log(`wrote .guilda/config.json (guildaVersion ${config.guildaVersion})`);
