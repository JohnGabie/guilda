#!/usr/bin/env node
// node scripts/pace.mjs <projectDir> --json [--plan-slots <n>]
// Reads the cswap budget and prints the pace. Writes nothing.
import { projectState } from './lib/project.mjs';
import { readUsage } from './lib/usage.mjs';
import { paceOf } from './lib/pace.mjs';

const USAGE = 'usage: node scripts/pace.mjs <projectDir> --json [--plan-slots <n>]';
const fail = () => {
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
};

const args = process.argv.slice(2);
let projectDir = null;
let json = false;
let planSlots = 1;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') json = true;
  else if (a === '--plan-slots') {
    const v = args[++i];
    if (!/^\d+$/.test(v ?? '')) fail();
    planSlots = Number(v);
  } else if (a.startsWith('-') || projectDir !== null) fail();
  else projectDir = a;
}
if (projectDir === null || !json) fail();

const config = projectState(projectDir).config ?? {};
const usage = readUsage(config);
const pace = paceOf(usage, { planSlots, now: new Date() });
const out = { ...pace, source: usage.state, fetchedAt: usage.budget?.fetchedAt ?? null };
process.stdout.write(`${JSON.stringify(out)}\n`);
