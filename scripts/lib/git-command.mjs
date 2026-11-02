// Read a shell command to find its `git commit` calls, and read the output of `git diff` as added lines.
// This is a small reader, not a full shell parser. It reads quotes, command separators, `cd`, common command
// wrappers and `sh -c`. It cannot see a commit inside a script file, a shell function or a git alias.
import os from 'node:os';
import path from 'node:path';

const WRAPPERS = new Set(['command', 'exec', 'time', 'nohup', 'env', 'sudo', 'nice']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const GIT_OPTIONS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--super-prefix',
  '--config-env',
  '--attr-source',
  '--list-cmds',
]);
const FORWARDED_OPTIONS = new Set(['--git-dir', '--work-tree']);

/** Split a command into simple commands. Each simple command is a list of words, without quotes. */
function splitCommands(command) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < command.length) word += command[++i];
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (ch === '#' && !inWord) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i += 1;
    } else if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) {
      word += ch;
      inWord = true;
    } else if (';&|()\n`'.includes(ch)) {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

/** Remove keywords, variable assignments and wrappers from the start of a simple command. */
function stripPrefix(words) {
  const env = {};
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const assignment = /^([A-Za-z_]\w*)=(.*)$/s.exec(w);
    if (assignment) {
      if (assignment[1].startsWith('GIT_')) env[assignment[1]] = assignment[2];
      i += 1;
    } else if (KEYWORDS.has(w)) {
      i += 1;
    } else if (WRAPPERS.has(w)) {
      i += 1;
      while (i < words.length && words[i].startsWith('-')) i += 1;
    } else {
      break;
    }
  }
  return { rest: words.slice(i), env };
}

function resolveDir(cwd, dir) {
  const expanded = dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
  return path.resolve(cwd, expanded);
}

/** Read the global options of a git call. Returns the subcommand, the directory and the options for the scan. */
function readGitCall(words, startCwd) {
  let cwd = startCwd;
  const gitArgs = [];
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    const [name, inline] = words[i].startsWith('--') && words[i].includes('=') ? words[i].split(/=(.*)/s) : [words[i]];
    const takesValue = GIT_OPTIONS_WITH_VALUE.has(name) && inline === undefined;
    const value = takesValue ? words[i + 1] : inline;
    if (name === '-C' && value !== undefined) cwd = resolveDir(cwd, value);
    if (FORWARDED_OPTIONS.has(name) && value !== undefined) gitArgs.push(`${name}=${value}`);
    i += takesValue ? 2 : 1;
  }
  return { subcommand: words[i], cwd, gitArgs };
}

/**
 * Find the `git commit` calls in a shell command.
 * Returns { commits: [{ cwd, gitArgs, env }], addBeforeCommit }. `addBeforeCommit` is true when `git add` or
 * `git stage` comes before a commit in the command: the files are not staged when the hook runs.
 */
export function findGitCommits(command, startCwd) {
  const result = { commits: [], addBeforeCommit: false };
  let cwd = startCwd;
  let sawAdd = false;
  const visit = (text) => {
    for (const words of splitCommands(text)) {
      const { rest, env } = stripPrefix(words);
      if (rest.length === 0) continue;
      const name = path.basename(rest[0]);
      if (name === 'cd' || name === 'pushd') {
        const target = rest.slice(1).find((w) => !w.startsWith('-'));
        if (target) cwd = resolveDir(cwd, target);
      } else if (name === 'eval') {
        visit(rest.slice(1).join(' '));
      } else if (SHELLS.has(name) && rest[1] && /^-[a-z]*c$/.test(rest[1]) && rest[2]) {
        visit(rest[2]);
      } else if (name === 'git' || name === 'git.exe') {
        const call = readGitCall(rest, cwd);
        if (call.subcommand === 'add' || call.subcommand === 'stage') sawAdd = true;
        if (call.subcommand === 'commit') {
          result.commits.push({ cwd: call.cwd, gitArgs: call.gitArgs, env });
          if (sawAdd) result.addBeforeCommit = true;
        }
      }
    }
  };
  visit(command);
  return result;
}

function headerName(raw) {
  let name = raw.slice(4).replace(/\t.*$/, '');
  if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
  return name;
}

/**
 * Read the output of `git diff` as a list of { file, lines: [{ line, text }] }, with the added lines only.
 * A `+++ ` line is a file header only outside a hunk. The hunk counts tell where each hunk ends, so an added line
 * with the text `++ /dev/null` stays content.
 */
export function parseAddedLines(diffText) {
  const files = [];
  let current = null;
  let lineNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const raw of diffText.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      if (raw.startsWith('+')) {
        if (current) current.lines.push({ line: lineNo, text: raw.slice(1) });
        lineNo += 1;
        newLeft -= 1;
      } else if (raw.startsWith('-')) {
        oldLeft -= 1;
      } else if (raw.startsWith(' ')) {
        lineNo += 1;
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const name = headerName(raw);
      current = name === '/dev/null' ? null : { file: name.replace(/^b\//, ''), lines: [] };
      if (current) files.push(current);
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (hunk) {
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      lineNo = Number(hunk[2]);
      newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
    }
  }
  return files;
}
