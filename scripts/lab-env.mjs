#!/usr/bin/env node
// Print the environment of a lab session as shell lines: a PATH with a gettext stub, and a process cap.
// Use: eval "$(node scripts/lab-env.mjs)"   or   node scripts/lab-env.mjs --json
// It makes one folder with mktemp -d semantics (fs.mkdtempSync in the temp folder) and writes only the stub in it.
// It deletes nothing; the folder stays for the caller to list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Room above the current process count, so the lab session can start its own processes.
export const PROCESS_HEADROOM = 256;

// gettext with no catalog prints the message ID, which is its last argument, with no newline.
const GETTEXT_STUB = '#!/bin/sh\nlast=\nfor a in "$@"; do last=$a; done\nprintf \'%s\' "$last"\n';

/** The tasks (threads) of the current user: the unit that `ulimit -u` (RLIMIT_NPROC) counts. */
function userProcessCount() {
  const uid = process.getuid();
  try {
    let n = 0;
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      try {
        if (fs.statSync(path.join('/proc', pid)).uid !== uid) continue;
        n += fs.readdirSync(path.join('/proc', pid, 'task')).length;
      } catch {
        // The process ended while the count ran.
      }
    }
    if (n > 0) return n;
  } catch {
    // No /proc: use ps below.
  }
  const ps = spawnSync('ps', ['-U', String(uid), '-o', 'pid='], { encoding: 'utf8' });
  return (ps.stdout || '').split('\n').filter((l) => l.trim() !== '').length;
}

/** Quote a value for a double-quoted shell string. */
const dq = (text) => text.replace(/[\\"$`]/g, '\\$&');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda-lab-'));
const gettext = path.join(dir, 'gettext');
fs.writeFileSync(gettext, GETTEXT_STUB, { mode: 0o755 });
const processes = userProcessCount();
const ulimitU = processes + PROCESS_HEADROOM;
const lines = [`export PATH="${dq(dir)}:$PATH"`, `ulimit -u ${ulimitU}`];

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ dir, gettext, processes, ulimitU, lines }) + '\n');
} else {
  process.stdout.write(`# guilda lab environment: ${dir}\n${lines.join('\n')}\n`);
}
