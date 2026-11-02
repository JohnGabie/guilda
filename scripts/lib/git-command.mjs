// Read a shell command to find its `git commit` calls, and read the output of `git diff` as added lines.
// This is a small reader, not a full shell parser, so the caller must fail closed: `mentioned` and `uncertain` tell
// the caller to scan more directories. A commit in a script file, a shell function or a git alias stays hidden.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', 'builtin', 'command']);
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
// A command that runs before the hook can see its result. `git add` is the common case.
const INDEX_CHANGERS = new Set([
  'add',
  'stage',
  'apply',
  'update-index',
  'stash',
  'cherry-pick',
  'merge',
  'am',
  'read-tree',
  'restore',
  'pull',
  'revert',
  'rebase',
]);
// These change the index only with a path. `git checkout -b x` and `git reset --soft x` do not bring in new text.
const INDEX_CHANGERS_WITH_PATH = new Set(['checkout', 'reset']);
// These targets name the directory of the session, or its repository, which the caller always scans.
const SESSION_TARGET = /^(?:\$PWD|\$\{PWD\}|\$\(pwd\)|\$\(git rev-parse --show-toplevel\))$/;
const MAX_READ_LENGTH = 100000;
const MAX_DEPTH = 8;

/** The heredoc delimiter that starts at `<<`, and the index after it. Null for `<<<` or no delimiter. */
function readHeredoc(command, start) {
  const m = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|([^\s;&|()<>'"]+))/.exec(command.slice(start, start + 300));
  if (!m) return null;
  return { strip: m[1] === '-', delimiter: (m[2] ?? m[3] ?? m[4]).replace(/\\/g, ''), next: start + m[0].length };
}

/** The index of the line after the heredoc body that starts at `start`, or -1 when the body has no end line. */
function skipHeredocBody(command, start, { strip, delimiter }) {
  let i = start;
  while (i < command.length) {
    let end = command.indexOf('\n', i);
    if (end < 0) end = command.length;
    const line = command.slice(i, end);
    if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) return end + 1;
    i = end + 1;
  }
  return -1;
}

/** Split a command into simple commands. Each simple command is a list of words, without quotes. */
function splitCommands(command) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let heredocs = [];
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
      else if (ch === '\\' && command[i + 1] === '\n') i += 1;
      else if (ch === '\\' && i + 1 < command.length) word += command[++i];
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === '\\' && command[i + 1] === '\n') {
      i += 1;
    } else if (ch === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (ch === '#' && !inWord) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i += 1;
    } else if (ch === '<' && command[i + 1] === '<') {
      const hereString = command[i + 2] === '<';
      const heredoc = hereString ? null : readHeredoc(command, i);
      if (heredoc) {
        endWord();
        heredocs.push(heredoc);
        i = heredoc.next - 1;
      } else {
        word += hereString ? '<<<' : '<<';
        inWord = true;
        i += hereString ? 2 : 1;
      }
    } else if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) {
      word += ch;
      inWord = true;
    } else if (ch === '\n' && heredocs.length > 0) {
      endCommand();
      let next = i + 1;
      for (const heredoc of heredocs) {
        // With no end line, this was not a heredoc (for example `$((1<<2))`). Read the next lines as commands.
        const after = next < 0 ? -1 : skipHeredocBody(command, next, heredoc);
        next = after;
      }
      heredocs = [];
      if (next >= 0) i = next - 1;
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

/** Remove keywords and variable assignments from the start of a simple command. */
function stripPrefix(words) {
  const env = {};
  let i = 0;
  while (i < words.length) {
    const assignment = /^([A-Za-z_]\w*)=(.*)$/s.exec(words[i]);
    if (assignment) {
      if (assignment[1].startsWith('GIT_')) env[assignment[1]] = assignment[2];
      i += 1;
    } else if (KEYWORDS.has(words[i])) {
      i += 1;
    } else {
      break;
    }
  }
  return { rest: words.slice(i), env };
}

function isVariable(text) {
  return /[$`]/.test(text);
}

function resolveDir(cwd, dir) {
  const expanded = dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
  return path.resolve(cwd, expanded);
}

/** Read the global options of a git call. `words[0]` is the git word. */
function readGitCall(words, startCwd) {
  let cwd = startCwd;
  let uncertain = false;
  const gitArgs = [];
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    const [name, inline] = words[i].startsWith('--') && words[i].includes('=') ? words[i].split(/=(.*)/s) : [words[i]];
    const takesValue = GIT_OPTIONS_WITH_VALUE.has(name) && inline === undefined;
    const value = takesValue ? words[i + 1] : inline;
    if (value !== undefined && (name === '-C' || FORWARDED_OPTIONS.has(name))) {
      if (name === '-C' && SESSION_TARGET.test(value)) cwd = startCwd;
      else if (isVariable(value)) uncertain = true;
      else if (name === '-C') cwd = resolveDir(cwd, value);
      else gitArgs.push(`${name}=${value}`);
    }
    i += takesValue ? 2 : 1;
  }
  // A redirect can touch the word: `git commit>/dev/null`.
  const subcommand = words[i] === undefined ? undefined : words[i].replace(/[<>].*$/s, '');
  return { subcommand, args: words.slice(i + 1), cwd, gitArgs, uncertain };
}

const GIT_WORD = /(?:^|[^\w.-])git(?:\.exe)?["'`]?$/;
const COMMIT_WORD = /^["'`]?commit(?![\w.-])/;

/**
 * True when the raw text has a git word, its options, then the word `commit`, also inside quotes. It does not read
 * shell syntax, so a separator in an option value cannot hide the commit. One walk over the words: linear.
 */
function mentionsCommit(command) {
  const words = command.split(/\s+/);
  for (let i = 0; i < words.length; i += 1) {
    if (!GIT_WORD.test(words[i])) continue;
    let j = i + 1;
    while (j < words.length && words[j].startsWith('-')) {
      const name = words[j].split('=', 1)[0];
      j += GIT_OPTIONS_WITH_VALUE.has(name) && !words[j].includes('=') ? 2 : 1;
    }
    if (j < words.length && COMMIT_WORD.test(words[j])) return true;
    i = Math.max(i, j - 1);
  }
  return false;
}

/** True when this git call can change the index with text that the scan cannot see yet. */
function changesIndex(call) {
  if (INDEX_CHANGERS.has(call.subcommand)) return true;
  return INDEX_CHANGERS_WITH_PATH.has(call.subcommand) && call.args.includes('--');
}

/**
 * Find the `git commit` calls in a shell command. Returns:
 * - commits: [{ cwd, gitArgs, env }];
 * - addBeforeCommit, indexChange: a command that changes the index comes before a commit, and its name;
 * - mentioned: the raw text has a git commit call, also inside quotes or a heredoc that this reader does not open;
 * - uncertain: a directory move in the command cannot be resolved here.
 */
export function findGitCommits(command, startCwd) {
  const result = { commits: [], addBeforeCommit: false, indexChange: null, mentioned: mentionsCommit(command), uncertain: false };
  if (command.length > MAX_READ_LENGTH) {
    result.uncertain = result.mentioned;
    return result;
  }
  let cwd = startCwd;
  let seenChange = null;
  const sessionEnv = {};
  const visit = (text, depth) => {
    if (depth > MAX_DEPTH) {
      result.uncertain = true;
      return;
    }
    for (const words of splitCommands(text)) {
      const { rest, env } = stripPrefix(words);
      if (rest.length === 0) {
        Object.assign(sessionEnv, env);
        continue;
      }
      const name = path.basename(rest[0]);
      if (name === 'cd' || name === 'pushd') {
        const target = rest.slice(1).find((w) => !w.startsWith('-'));
        if (target === undefined) continue;
        if (SESSION_TARGET.test(target)) cwd = startCwd;
        else if (isVariable(target)) result.uncertain = true;
        else {
          cwd = resolveDir(cwd, target);
          if (!fs.existsSync(cwd)) result.uncertain = true;
        }
        continue;
      }
      if (name === 'popd') {
        result.uncertain = true;
        continue;
      }
      if (name === 'export') {
        for (const word of rest.slice(1)) Object.assign(sessionEnv, stripPrefix([word]).env);
        continue;
      }
      if (name === 'eval') {
        visit(rest.slice(1).join(' '), depth + 1);
        continue;
      }
      // A wrapper can come before a shell or git (timeout, xargs, sudo -u me). A wrong match only causes a scan.
      const baseNames = rest.map((w) => path.basename(w));
      const shellAt = baseNames.findIndex((base) => SHELLS.has(base));
      if (shellAt >= 0) {
        const flag = rest.findIndex((w, i) => i > shellAt && /^-[a-z]*c$/.test(w));
        if (flag > 0 && rest[flag + 1]) {
          visit(rest[flag + 1], depth + 1);
          continue;
        }
      }
      const gitAt = baseNames.findIndex((base) => base === 'git' || base === 'git.exe');
      if (gitAt < 0) continue;
      const wrapperEnv = stripPrefix(rest.slice(1, gitAt).filter((w) => w.includes('='))).env;
      const callEnv = {};
      for (const [key, value] of Object.entries({ ...sessionEnv, ...env, ...wrapperEnv })) {
        if (isVariable(value)) result.uncertain = true;
        else callEnv[key] = value;
      }
      const call = readGitCall(rest.slice(gitAt), cwd);
      if (call.uncertain) result.uncertain = true;
      if (changesIndex(call)) seenChange = seenChange ?? call.subcommand;
      if (call.subcommand === 'commit') {
        result.commits.push({ cwd: call.cwd, gitArgs: call.gitArgs, env: callEnv });
        if (seenChange) result.indexChange = seenChange;
      }
    }
  };
  visit(command, 0);
  // A commit hidden in a quoted `$(...)` still comes after this index change.
  if (seenChange && result.commits.length === 0 && result.mentioned) result.indexChange = seenChange;
  result.addBeforeCommit = result.indexChange !== null;
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
      } else if (raw.startsWith(' ') || raw === '') {
        // diff.suppressBlankEmpty writes an empty context line with no space.
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
