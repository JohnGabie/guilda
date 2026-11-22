#!/usr/bin/env node
// The away command (D48, 5i). Only the Architect side runs it. The script cannot see the hook input, so it cannot tell
// the Architect side from an agent: the guard is the PreToolUse hook (R39, awayGuard of scripts/lib/away.mjs), which
// the integration task wires in. Until then no hook calls awayGuard.
// This script also refuses a caller that is the session of a live claim, and a claim that it cannot read.
// Usage: node scripts/away.mjs <projectDir> set|status|clear --session <id>
import { readAway, setAway, clearAway, NEUTRAL } from './lib/away.mjs';
import { liveClaim } from './lib/queue-guard.mjs';

const USAGE = 'usage: node scripts/away.mjs <projectDir> set|status|clear --session <id>';
const COMMANDS = ['set', 'status', 'clear'];
const SESSION = /^[A-Za-z0-9._:-]{1,128}$/;

function main(argv) {
  const [projectDir, command, ...rest] = argv;
  if (!projectDir || !COMMANDS.includes(command) || rest.length !== 2 || rest[0] !== '--session' || !SESSION.test(rest[1])) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const held = liveClaim(projectDir);
  if (held.error || (held.claim && held.claim.session === rest[1])) {
    process.stderr.write(`${NEUTRAL}\n`);
    return 1;
  }
  try {
    if (command === 'set') {
      setAway(projectDir);
      process.stdout.write('away: set\n');
    } else if (command === 'clear') {
      clearAway(projectDir);
      process.stdout.write('away: clear\n');
    } else {
      const state = readAway(projectDir);
      process.stdout.write(state.away ? `away: yes since ${state.since ?? 'unknown'}\n` : 'away: no\n');
    }
    return 0;
  } catch (e) {
    process.stderr.write(`away: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
