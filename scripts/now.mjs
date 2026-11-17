#!/usr/bin/env node
// Usage: node scripts/now.mjs [--date]
// Prints the UTC time as YYYY-MM-DDTHH:MM:SSZ, or the UTC date as YYYY-MM-DD with --date.
// Any other argument prints the usage line on stderr and exits 1.
const USAGE = 'usage: node scripts/now.mjs [--date]';

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stdout.write(`${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}\n`);
} else if (args.length === 1 && args[0] === '--date') {
  process.stdout.write(`${new Date().toISOString().slice(0, 10)}\n`);
} else {
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 1;
}
