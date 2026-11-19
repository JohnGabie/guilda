// Read a shell command for R32: the queue files that it writes or removes, and its calls of the queue script.
// This is a small reader, not a full shell parser. It fails closed: it reads each command twice, once with the shell
// quotes and once with the quotes, the comments and the heredoc marks taken out. A write that either reading finds
// counts. A path from a variable or a command substitution passes (the stated limit of R32).
// For a write, the body of a quoted heredoc is taken out first only when each line outside the bodies holds only
// simple commands with a safe first word and plain words (an allowlist, see isSafeLine). Any other text keeps every body.
// A queue script call is any word whose base name is queue.mjs after a program `node` (or a program from a variable),
// or a command word with that base name, in any folder; so no cd needs to be followed for a call.
// Stated limits, which this reader does not see: a write through sed -i, dd, truncate, ln, find -delete, xargs, or
// an interpreter (python, node -e); a queue script run by `node -e` with an import, by bun, deno or tsx, or under
// another file name or a link; a path from a variable; a case-insensitive file system that spells a name otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { splitCommands, stripPrefix, isVariable, resolveDir } from './git-command.mjs';
import { findCreatedFiles } from './shell-writes.mjs';

export const QUEUE_DIR = ['.guilda', 'queue'];
export const QUEUE_FILES = ['journal.jsonl', 'state.json', 'lock', 'writer.json'];
const QUEUE_SCRIPT = 'queue.mjs';
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

// The programs whose quoted heredoc body is text: they copy it and run nothing. Only as the first word, with no path
// other than these, after only the wrappers in BODY_WRAPPERS.
const BODY_COPIERS = new Set(['cat', 'tee', '/bin/cat', '/usr/bin/cat', '/bin/tee', '/usr/bin/tee']);
// A heredoc operator with a quoted delimiter word: <<'MARK', <<"MARK" or <<\MARK.
const QUOTED_MARK = /<<-?[ \t]*(?:'[^']*'|"[^"]*"|\\[A-Za-z0-9_]+)/g;
// The first words that a part of a text may have when its quoted heredoc bodies are taken out: they copy or run
// nothing from the body. `command` is allowed only before `cat` or `tee`.
const SAFE_FIRST = new Set([...BODY_COPIERS, 'mkdir', 'touch', 'echo', 'cd', 'ls', 'true']);
// A plain word, or a plain word in one pair of quotes, or a redirection.
const PLAIN = '[A-Za-z0-9._/:,@+%-]+';
const PLAIN_WORD = new RegExp(`^(?:${PLAIN}|"${PLAIN}"|'${PLAIN}'|>>?)$`);

/**
 * The quoted heredoc marks of a line that starts outside quotes, in order, each with the simple command that gets it.
 * `clean` is false when the line can go on to the next line or has a form that this reader does not follow: a quote
 * left open, `(`, `)`, `{`, `}`, a backtick, a pipe, arithmetic, `[[`, an end `\`, or a delimiter word that it does
 * not read. Then no body of the line is dropped (fail closed).
 */
function scanHeredocLine(line) {
  const marks = [];
  const segments = [];
  let segStart = 0;
  let quote = null;
  let clean = !/\$\[|\[\[/.test(line) && !/\\\s*$/.test(line);
  let end = line.length;
  for (let i = 0; i < line.length && clean; i += 1) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
    } else if (quote === '"') {
      if (ch === '\\') i += 1;
      else if (ch === '"') quote = null;
      else if (ch === '`' || ch === '$') clean = false;
    } else if (ch === '\\') {
      i += 1;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /[\s;&]/.test(line[i - 1]))) {
      end = i;
      break;
    } else if ('(){}|`'.includes(ch)) {
      clean = false;
    } else if ((ch === ';' || ch === '&') && line[i - 1] !== '>' && line[i - 1] !== '<' && line[i + 1] !== '>') {
      segments.push(line.slice(segStart, i));
      segStart = i + 1;
    } else if (ch === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      const mark = readMark(line, i + 2);
      if (mark === null) clean = false;
      else if (mark.quoted !== null) {
        marks.push({ ...mark, segment: segments.length });
        i = mark.next - 1;
      } else i += 1;
    }
  }
  if (quote !== null) clean = false;
  segments.push(line.slice(segStart, end));
  return { clean, marks: marks.map((m) => ({ ...m, receiver: segments[m.segment] })) };
}

/**
 * The heredoc delimiter word after `<<` at `start`: { strip, delimiter, quoted, next }, `quoted` true when any part of
 * the word is quoted. { quoted: null } when there is no word. Null when this reader is not sure of the word: an open
 * quote, a `$` or a backtick in it, or a backslash in double quotes.
 */
function readMark(line, start) {
  let i = start;
  const strip = line[i] === '-';
  if (strip) i += 1;
  while (line[i] === ' ' || line[i] === '\t') i += 1;
  let delimiter = '';
  let quoted = false;
  while (i < line.length && !/[\s;&|()<>]/.test(line[i])) {
    const ch = line[i];
    if (ch === '$' || ch === '`') return null;
    if (ch === "'" || ch === '"') {
      const close = line.indexOf(ch, i + 1);
      if (close < 0) return null;
      const inner = line.slice(i + 1, close);
      if (ch === '"' && /[\\$`]/.test(inner)) return null;
      delimiter += inner;
      quoted = true;
      i = close + 1;
    } else if (ch === '\\') {
      if (i + 1 >= line.length) return null;
      delimiter += line[i + 1];
      quoted = true;
      i += 2;
    } else {
      delimiter += ch;
      i += 1;
    }
  }
  if (delimiter === '' && !quoted) return { quoted: null };
  return { strip, delimiter, quoted, next: i };
}

/**
 * True when the line holds only simple commands joined by `&&`, `;` or the line end, each with a safe first word
 * (SAFE_FIRST) and only plain words, quoted plain words and the redirections `>`, `>>`, `2>&1` and quoted heredoc
 * marks. An allowlist, so each other form is refused and the bodies stay (fail closed).
 */
function isSafeLine(line, markCount) {
  let count = 0;
  const rest = line.replace(QUOTED_MARK, () => { count += 1; return ' '; }).replace(/\b2>&1(?![\w])/g, ' ');
  if (count !== markCount || /[$`(){}=|!\\#<\n]/.test(rest)) return false;
  return rest.split(/&&|;/).every((part) => {
    if (part.includes('&')) return false;
    const words = part.split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const first = words[0] === 'command' ? words[1] : words[0];
    const copier = words[0] === 'command' ? BODY_COPIERS.has(first) : SAFE_FIRST.has(first);
    return copier && words.every((w) => PLAIN_WORD.test(w));
  });
}

/**
 * The text with the body lines of each quoted heredoc taken out, only when each line outside the bodies passes
 * isSafeLine and each heredoc is quoted. Bash reads such a body as text, and the safe commands only copy it. The
 * heredoc lines and the end lines stay. Any other text keeps every body (fail closed). A quoted heredoc with no end
 * line takes the rest of the text, as in bash.
 */
function dropQuotedBodies(command) {
  const lines = command.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const scan = scanHeredocLine(line);
    if (!scan.clean || !scan.marks.every((m) => m.quoted) || !isSafeLine(line, scan.marks.length)) return command;
    out.push(line);
    i += 1;
    for (const mark of scan.marks) {
      while (i < lines.length) {
        const body = lines[i];
        i += 1;
        if ((mark.strip ? body.replace(/^\t+/, '') : body) === mark.delimiter) {
          out.push(body);
          break;
        }
      }
    }
  }
  return out.join('\n');
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
    command = dropQuotedBodies(command);
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

/** True when the word can be a path whose base name is queue.mjs. A variable or a glob counts as any text. */
function canBeQueueScript(word, { direct = false } = {}) {
  const w = word.replace(/\\/g, '/');
  const parts = w.split(/\$\{[^}]*\}|\$\([^)]*\)|\$\w+|\$|`[^`]*`|`|[*?]|\[[^\]]*\]|\{[^}]*\}/);
  const last = parts[parts.length - 1];
  const tail = last === '' ? '' : path.posix.normalize(last).replace(/^\.\//, '');
  if (tail === QUEUE_SCRIPT || tail.endsWith(`/${QUEUE_SCRIPT}`)) return true;
  if (parts.length === 1) return false;
  // A command word that is only a variable is not taken as the queue script; one with a literal end can be.
  if (direct && tail === '') return false;
  return QUEUE_SCRIPT.endsWith(tail) || tail.endsWith(QUEUE_SCRIPT);
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
    if (rest.length > 0 && canBeQueueScript(rest[0], { direct: true })) {
      sessions.push(readSession(rest.slice(1)));
      continue;
    }
    const nodeAt = rest.findIndex((w) => NODE_WORD.test(path.basename(w)) || isVariable(w));
    if (nodeAt < 0) continue;
    const scriptAt = rest.findIndex((w, i) => i > nodeAt && canBeQueueScript(w));
    if (scriptAt < 0) continue;
    sessions.push(readSession(rest.slice(scriptAt + 1)));
  }
  return sessions;
}

/**
 * The queue script call of a Bash command: a program `node` whose script has the base name queue.mjs, or that script
 * run directly. Returns null
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
