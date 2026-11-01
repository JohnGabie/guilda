#!/usr/bin/env node
// Usage: node scripts/config-write.mjs <projectDir> <answers.json> [--replace]
// Builds <projectDir>/.guilda/config.json from the answers of guilda:init. The answers file has the config keys
// without guildaVersion; this script takes guildaVersion from the installed plugin. It writes the config only when
// the config passes the schema, and it never replaces an existing config without --replace. Exit 1 with the reason
// on any problem. It also makes .guilda/.gitignore list the hook state files.
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

const { guildaVersion: _ignored, ...rest } = answers;
const config = { guildaVersion: installedVersion(PLUGIN_ROOT), ...rest };
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
