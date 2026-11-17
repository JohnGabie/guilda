// Read a shell command for R32: the queue files that it writes or removes, and its calls of the queue script.
// This is a small reader, not a full shell parser. It fails closed: it reads each command twice, once with the shell
// quotes and once with the quotes, the comments and the heredoc marks taken out. A write that either reading finds
// counts. A path from a variable or a command substitution passes (the stated limit of R32).
import fs from 'node:fs';
import path from 'node:path';
import { splitCommands, stripPrefix, isVariable, resolveDir } from './git-command.mjs';
import { findCreatedFiles } from './shell-writes.mjs';

export const QUEUE_DIR = ['.guilda', 'queue'];
export const QUEUE_FILES = ['journal.jsonl', 'state.json', 'lock', 'writer.json'];
const QUEUE_SCRIPT = 'scripts/queue.mjs';
const NODE_WORD = /^node(?:js)?(?:\.exe)?$/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const WRITERS = new Set(['tee', 'touch', 'cp', 'mv', 'rm']);
// The flags of the queue script that take no value. Each other `--` flag takes the next word, as in the script. A new
// flag with no value that is missing here makes a later --session unread, so the call is refused (fail closed).
const QUEUE_BOOL_FLAGS = new Set(['--external', '--check']);
const END_MARK = 'guilda-queue-guard-end';
const MAX_DEPTH = 8;
const GLOB = /[*?[{]/;

/** The text with each quote, comment mark and heredoc mark taken out, so that each word in it is read as shell. */
function flatten(command) {
  return command.replace(/\\\n/g, ' ').replace(/<</g, '< <').replace(/[`'"#\\]/g, ' ');
}

/** The simple commands of the text, or null when the text ends inside an open quote. */
function readCommands(command) {
  const commands = splitCommands(`${command}\n${END_MARK}`);
  const last = commands.pop();
  if (!last || last.length !== 1 || last[0] !== END_MARK) return null;
  return commands;
}

/** The text that an `eval` or a `sh -c` simple command runs, or null. */
function innerText(rest) {
  const names = rest.map((w) => path.basename(w));
  if (names[0] === 'eval') return rest.slice(1).join(' ');
  const shellAt = names.findIndex((n) => SHELLS.has(n));
  if (shellAt < 0) return null;
  const flag = rest.findIndex((w, i) => i > shellAt && /^-[a-z]*c$/.test(w));
  return flag > 0 && rest[flag + 1] !== undefined ? rest[flag + 1] : null;
}

/** The simple commands of the text with its quotes, and of each `eval` and `sh -c` text inside it. */
function quotedCommands(command) {
  const out = [];
  const visit = (text, depth) => {
    const commands = depth > MAX_DEPTH ? null : readCommands(text);
    if (!commands) return;
    for (const words of commands) {
      out.push(words);
      const inner = innerText(stripPrefix(words).rest);
      if (inner !== null) visit(inner, depth + 1);
    }
  };
  visit(command, 0);
  return out;
}

/** The real path of a path whose end may not exist: the real path of its nearest existing folder plus the rest. */
function realish(abs) {
  let dir = abs;
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...tail.reverse());
    } catch {
      const up = path.dirname(dir);
      if (up === dir) return abs;
      tail.push(path.basename(dir));
      dir = up;
    }
  }
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The regex text of a glob word, wider than the shell: `**` and a brace list match any text. As in the shell, `*`, `?`
 * and `[...]` do not match a leading dot of a name, so `rm *` does not reach `.guilda`.
 */
function globToRegex(word) {
  let re = '';
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    const nameStart = i === 0 || word[i - 1] === '/';
    const noDot = nameStart ? '(?!\\.)' : '';
    if (ch === '*' && word[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (ch === '*') re += `${noDot}[^/]*`;
    else if (ch === '?') re += `${noDot}[^/]`;
    else if (ch === '[') {
      const end = word.indexOf(']', i + 2);
      re += `${noDot}[^/]`;
      if (end > 0) i = end;
    } else if (ch === '{') {
      const end = word.indexOf('}', i + 1);
      re += '.*';
      if (end > 0) i = end;
    } else re += escapeRegex(ch);
  }
  return re;
}

/** Each queue file, and each folder that holds one, in both the literal and the real form. */
function queueTargets(projectDir) {
  const dir = path.resolve(projectDir, ...QUEUE_DIR);
  return QUEUE_FILES.map((name) => {
    const forms = new Set();
    for (const file of [path.join(dir, name), realish(path.join(dir, name))]) {
      for (let p = file; ; p = path.dirname(p)) {
        forms.add(p);
        if (path.dirname(p) === p) break;
      }
    }
    return { name, files: [path.join(dir, name), realish(path.join(dir, name))], forms: [...forms] };
  });
}

/** A pattern for a word with a glob: the folder that it starts in, as literal text, then the glob of the word. */
function globPattern(base, word) {
  const expanded = word === '~' || word.startsWith('~/') ? resolveDir(base, word) : word;
  const parts = path.normalize(expanded).split(path.sep).filter((p, i, all) => p !== '' || i < all.length - 1);
  let start = path.isAbsolute(expanded) ? path.parse(expanded).root : base;
  if (path.isAbsolute(expanded)) parts.shift();
  while (parts.length > 0 && (parts[0] === '..' || parts[0] === '.')) start = path.resolve(start, parts.shift());
  const lead = start.endsWith(path.sep) ? start : start + path.sep;
  return new RegExp(`^${escapeRegex(lead)}${globToRegex(parts.join(path.sep))}$`, 's');
}

/** True when the word names a queue file or a folder that holds one. A glob counts when it can match one of those. */
function hits(target, base, word) {
  if (GLOB.test(word)) {
    const re = globPattern(base, word);
    return target.forms.some((p) => re.test(p));
  }
  const abs = resolveDir(base, word);
  return [abs, realish(abs)].some((c) => target.forms.includes(c));
}

function operands(args) {
  const out = [];
  let options = true;
  for (const arg of args) {
    if (options && arg === '--') options = false;
    else if (!options || !arg.startsWith('-') || arg === '-') out.push(arg);
  }
  return out;
}

/** The words of a simple command that a common write form writes, moves or removes, with the folder of that command. */
function programPaths(command, startCwd) {
  const found = [];
  let cwd = startCwd;
  for (const words of [...quotedCommands(command), ...splitCommands(flatten(command))]) {
    const { rest } = stripPrefix(words);
    const names = rest.map((w) => path.basename(w));
    if ((names[0] === 'cd' || names[0] === 'pushd') && rest.length > 1) {
      const target = rest.slice(1).find((w) => !w.startsWith('-'));
      if (target !== undefined && !isVariable(target)) cwd = resolveDir(cwd, target);
      continue;
    }
    // A wrapper can come first (sudo, env, xargs, timeout), so each word can start a write form.
    names.forEach((name, i) => {
      if (!WRITERS.has(name)) return;
      for (const word of operands(rest.slice(i + 1))) found.push({ path: word, cwd });
    });
  }
  return found;
}

/**
 * The queue files that a Bash command writes or removes: a redirection, tee, cp, mv, touch or rm. A write to a folder
 * that holds a queue file counts for that file. Returns the file names (`journal.jsonl`, `state.json`, `lock`,
 * `writer.json`). Never throws: on an error it returns each queue file, so the caller refuses.
 */
export function queueFileWrites(command, cwd, projectDir) {
  try {
    if (typeof command !== 'string' || command === '') return [];
    const targets = queueTargets(projectDir);
    const entries = [
      ...findCreatedFiles(command, cwd),
      ...findCreatedFiles(flatten(command), cwd),
      ...programPaths(command, cwd),
    ];
    const names = new Set();
    for (const entry of entries) {
      if (entry.path === '' || isVariable(entry.path)) continue;
      for (const base of new Set([entry.cwd, cwd, projectDir])) {
        for (const target of targets) if (hits(target, base, entry.path)) names.add(target.name);
      }
    }
    return QUEUE_FILES.filter((n) => names.has(n));
  } catch {
    return [...QUEUE_FILES];
  }
}

/** True when the word can be a path that ends in scripts/queue.mjs. A variable or a glob counts as any text. */
function canBeQueueScript(word) {
  const w = word.replace(/\\/g, '/');
  const parts = w.split(/\$\{[^}]*\}|\$\([^)]*\)|\$\w+|\$|`[^`]*`|`|[*?]|\[[^\]]*\]|\{[^}]*\}/);
  const last = parts[parts.length - 1];
  const tail = last === '' ? '' : path.posix.normalize(last).replace(/^\.\//, '');
  if (tail.endsWith(QUEUE_SCRIPT)) return true;
  return parts.length > 1 && QUEUE_SCRIPT.endsWith(tail);
}

/** The --session value of the queue script arguments, as the script reads them: null when there is none. */
function readSession(args) {
  let session = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--session') {
      session = args[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--') && !QUEUE_BOOL_FLAGS.has(arg)) {
      i += 1;
    }
  }
  return session;
}

/** The --session value of each queue script call in the simple commands. */
function callsIn(commands) {
  const sessions = [];
  for (const words of commands) {
    const { rest } = stripPrefix(words);
    const nodeAt = rest.findIndex((w) => NODE_WORD.test(path.basename(w)));
    if (nodeAt < 0) continue;
    const scriptAt = rest.findIndex((w, i) => i > nodeAt && canBeQueueScript(w));
    if (scriptAt < 0) continue;
    sessions.push(readSession(rest.slice(scriptAt + 1)));
  }
  return sessions;
}

/**
 * The queue script call of a Bash command: a program `node` whose script path ends in scripts/queue.mjs. Returns null
 * when the command has none, else { session, sessions }: `sessions` is the --session value of each call (null for a
 * call with none), and `session` is the first. A call that only the reading without quotes finds has the value null.
 */
export function queueScriptCall(command) {
  if (typeof command !== 'string' || command === '') return null;
  const quoted = callsIn(quotedCommands(command));
  const flat = callsIn(splitCommands(flatten(command)));
  const sessions = [...quoted];
  for (let i = quoted.length; i < flat.length; i += 1) sessions.push(null);
  if (sessions.length === 0) return null;
  return { session: sessions[0], sessions };
}

/** True when the absolute path is a queue file of the project, in its literal or its real form. */
export function isQueueFile(projectDir, absPath) {
  return queueTargets(projectDir).some((t) => {
    const c = [path.resolve(absPath), realish(path.resolve(absPath))];
    return c.some((p) => t.files.includes(p));
  });
}
