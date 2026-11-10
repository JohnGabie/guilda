#!/usr/bin/env node
// Usage: node labs/links/open-at-line.mjs <file> <line> [--dry-run]
// Opens <file> at <line> (also "L633" or "#L633") with one opener. The opener comes from links.open in the
// .guilda/config.json of the nearest project above the file, else from the environment.
// links.open: auto | kitty-overlay | kitty-window | zed | openidea | vscode | system
// --dry-run prints the choice and the command, and opens nothing. A sketch for the links lab, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const OPENERS = ['auto', 'kitty-overlay', 'kitty-window', 'zed', 'openidea', 'vscode', 'system'];

export function parseLine(raw) {
  const m = /^#?[lL]?(\d+)$/.exec(String(raw ?? ''));
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

// The value of links.open in the nearest .guilda/config.json above dir, or null.
export function preference(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    const file = path.join(d, '.guilda', 'config.json');
    if (fs.existsSync(file)) {
      try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'))?.links?.open;
        return OPENERS.includes(value) ? value : null;
      } catch {
        return null;
      }
    }
    if (path.dirname(d) === d) return null;
  }
}

const onPath = (cmd) => spawnSync('sh', ['-c', 'command -v "$1"', 'sh', cmd]).status === 0;

// The opener for the place where this process runs. Claude Code passes the variables of its terminal on,
// so inside Claude Code in kitty the kitty variables are still there.
export function detect(env = process.env, isTty = Boolean(process.stdout.isTTY)) {
  if (env.ZED_TERM === 'true' || env.TERM_PROGRAM === 'zed') return { opener: 'zed', why: 'the Zed terminal' };
  if (env.TERM_PROGRAM === 'vscode') return { opener: 'vscode', why: 'the VS Code terminal' };
  if (/^JetBrains/.test(env.TERMINAL_EMULATOR || '')) {
    return { opener: onPath('openidea') ? 'openidea' : 'system', why: 'a JetBrains-style terminal' };
  }
  if (env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty') {
    return isTty
      ? { opener: 'kitty-overlay', why: 'kitty, with a terminal on stdout' }
      : { opener: 'kitty-window', why: 'kitty, without a terminal on stdout' };
  }
  return { opener: 'system', why: 'no known terminal or editor' };
}

export function command(opener, file, line) {
  const pager = ['less', '-N', `+${line}g`, '--', file];
  switch (opener) {
    case 'kitty-overlay': return pager; // run in this window: kitty already opened an overlay for the click
    case 'kitty-window': return ['kitty', '--detach', '--title', 'guilda-link', ...pager];
    case 'zed': return ['zed', `${file}:${line}`];
    case 'openidea': return ['openidea', '--line', String(line), file];
    case 'vscode': return ['code', '--goto', `${file}:${line}`];
    default: return ['xdg-open', file]; // no line: the system opener has no place for it
  }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const [file, rawLine] = argv.filter((a) => a !== '--dry-run');
  const line = parseLine(rawLine);
  if (!file || !line) {
    process.stderr.write('usage: open-at-line.mjs <file> <line> [--dry-run]\n');
    return 2;
  }
  const abs = path.resolve(file);
  const pref = preference(path.dirname(abs));
  const found = pref && pref !== 'auto' ? { opener: pref, why: 'links.open in .guilda/config.json' } : detect();
  const argvOut = command(found.opener, abs, line);
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ opener: found.opener, why: found.why, command: argvOut })}\n`);
    return 0;
  }
  const inline = found.opener === 'kitty-overlay';
  const child = spawn(argvOut[0], argvOut.slice(1), inline ? { stdio: 'inherit' } : { detached: true, stdio: 'ignore' });
  child.on('error', (e) => {
    process.stderr.write(`cannot run ${argvOut[0]}: ${e.message}\n`);
    process.exitCode = 1;
  });
  if (inline) child.on('exit', (code) => { process.exitCode = code ?? 0; });
  else child.unref();
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const code = main(process.argv.slice(2));
  if (code !== undefined) process.exitCode = code;
}
