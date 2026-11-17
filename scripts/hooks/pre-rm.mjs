// R20 law: refuse a subagent's Bash command that runs rm with a force or recursive flag.
// A PreToolUse input with a non-empty agent_id comes from a subagent; the main session has no agent_id.
// This is a small shell reader, not a full parser. Text that it cannot read is refused when it holds the word rm.
import path from 'node:path';
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

const REASON = 'R20: a subagent may not run rm with a force or recursive flag; leave temp files in mktemp -d and list them';
const MAX_DEPTH = 8;
const RM_WORD = /(^|[^\w.-])rm($|[^\w.-])/;

class Unreadable extends Error {}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'builtin', 'exec', 'nohup', 'setsid', 'doas']);
// A redirect word (2>/dev/null, >log, &>x, <in, 2>&1), and a redirect operator that stands alone and takes the next word.
const REDIRECT = /^(\d*|&)[<>]/;
const REDIRECT_ALONE = /^(\d*|&)(>>?|<<?<?|>&|<&|<>|>\|)$/;
// The commands whose output is known text: their arguments are read as the commands that a shell gets from the pipe.
const ECHO_LIKE = new Set(['echo', 'printf']);
const ANSI_C = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v' };
// Wrappers that run the command after their options. The value is the set of options that take a separate value.
const WRAPPERS = {
  command: new Set(),
  busybox: new Set(),
  time: new Set(['-f', '-o', '--format', '--output']),
  watch: new Set(['-n', '-q', '--interval', '--equexit']),
  sudo: new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-U', '-D', '-R', '-T']),
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir', '--split-string']),
  xargs: new Set(['-I', '-L', '-n', '-P', '-d', '-E', '-s', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file', '--max-lines', '--max-chars', '--eof', '--replace']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p', '-P', '-u']),
  stdbuf: new Set(['-i', '-o', '-e']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  chrt: new Set(),
  taskset: new Set(),
  flock: new Set(['-w', '-E', '--timeout', '--conflict-exit-code']),
};
// Wrappers whose first operand is a value and not the command (timeout DURATION, taskset MASK, chrt PRIO, flock FILE).
const LEADING_OPERAND = new Set(['timeout', 'taskset', 'chrt', 'flock']);

/** The index after the `)` that closes the `(` at `open`, read with quotes, or -1. */
function closeParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
    } else if (ch === '\\') {
      i += 1;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '$' && text[i + 1] === '(') {
        const end = closeParen(text, i + 1);
        if (end < 0) return -1;
        i = end - 1;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** The index of the backtick that closes the one at `open`, or -1. */
function closeBacktick(text, open) {
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '`') return i;
  }
  return -1;
}

/** Read the ANSI-C quoted text that starts after the quote at `open`. Returns [text, index of the closing quote]. */
function ansiC(text, open) {
  let out = '';
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") return [out, i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    let m;
    if (next === undefined) break;
    if (next in ANSI_C) {
      out += ANSI_C[next];
      i += 1;
    } else if ((m = /^x([0-9a-fA-F]{1,2})/.exec(text.slice(i + 1)))) {
      out += String.fromCharCode(parseInt(m[1], 16));
      i += m[0].length;
    } else if ((m = /^(?:u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8}))/.exec(text.slice(i + 1)))) {
      out += String.fromCodePoint(parseInt(m[1] ?? m[2], 16));
      i += m[0].length;
    } else if ((m = /^[0-7]{1,3}/.exec(text.slice(i + 1)))) {
      out += String.fromCharCode(parseInt(m[0], 8));
      i += m[0].length;
    } else {
      out += next;
      i += 1;
    }
  }
  throw new Unreadable();
}

/**
 * Split a command into simple commands (lists of words without quotes). The text of each $(...), backtick, <(...)
 * and heredoc body is read again as commands into `inner`. Throws Unreadable on text that it cannot read.
 */
function split(text, inner) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let heredocs = [];
  let piped = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) {
      // A command after | keeps the command before it: a shell with no -c text reads that command's output.
      if (piped && commands.length > 0) words.pipedFrom = commands[commands.length - 1];
      commands.push(words);
      piped = false;
    }
    words = [];
  };
  const substitution = (i) => {
    const end = closeParen(text, i + 1);
    if (end < 0) throw new Unreadable();
    inner.push(text.slice(i + 2, end - 1));
    word += text.slice(i, end);
    inWord = true;
    return end - 1;
  };
  const backtick = (i) => {
    const end = closeBacktick(text, i);
    if (end < 0) throw new Unreadable();
    inner.push(text.slice(i + 1, end).replace(/\\(.)/g, '$1'));
    word += text.slice(i, end + 1);
    inWord = true;
    return end;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < text.length) word += text[++i];
      else if (ch === '$' && text[i + 1] === '(') i = substitution(i);
      else if (ch === '`') i = backtick(i);
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === '\\') {
      if (text[i + 1] !== '\n' && i + 1 < text.length) {
        word += text[i + 1];
        inWord = true;
      }
      i += 1;
    } else if (ch === '$' && text[i + 1] === '(') {
      i = substitution(i);
    } else if (ch === '$' && text[i + 1] === "'") {
      const [decoded, end] = ansiC(text, i + 1);
      word += decoded;
      inWord = true;
      i = end;
    } else if (ch === '$' && text[i + 1] === '"') {
      // $"text" is a translated string: the same words as "text".
      quote = '"';
      inWord = true;
      i += 1;
    } else if ((ch === '<' || ch === '>') && text[i + 1] === '(') {
      endWord();
      i = substitution(i);
      endWord();
    } else if (ch === '`') {
      i = backtick(i);
    } else if (ch === '#' && !inWord) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
    } else if (ch === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      const m = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|([^\s;&|()<>'"]+))/.exec(text.slice(i, i + 300));
      if (!m) throw new Unreadable();
      endWord();
      heredocs.push({ strip: m[1] === '-', delimiter: (m[2] ?? m[3] ?? m[4]).replace(/\\/g, '') });
      i += m[0].length - 1;
    } else if (ch === '\n' && heredocs.length > 0) {
      endCommand();
      let next = i + 1;
      for (const { strip, delimiter } of heredocs) {
        const lines = [];
        let found = false;
        while (next < text.length) {
          let end = text.indexOf('\n', next);
          if (end < 0) end = text.length;
          const line = text.slice(next, end);
          next = end + 1;
          if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) {
            found = true;
            break;
          }
          lines.push(line);
        }
        if (!found) throw new Unreadable();
        // A heredoc body can be the input of a shell, so it is read as commands too (fail closed).
        inner.push(lines.join('\n'));
      }
      heredocs = [];
      i = next - 1;
    } else if (ch === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
      word += ch;
      inWord = true;
    } else if (ch === '|' && text[i + 1] === '|') {
      endCommand();
      i += 1;
    } else if (ch === '|') {
      // | and |& send the output of the command before them to the command after them.
      endCommand();
      piped = true;
      if (text[i + 1] === '&') i += 1;
    } else if (';&()\n'.includes(ch)) {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quote || heredocs.length > 0) throw new Unreadable();
  endCommand();
  return commands;
}

/** True when the arguments of rm hold a force or recursive flag before `--`. */
function hasForceOrRecursive(args) {
  for (const a of args) {
    if (a === '--') return false;
    if (a.startsWith('--')) {
      const name = a.slice(2).split('=')[0];
      if (name && ('force'.startsWith(name) || 'recursive'.startsWith(name))) return true;
    } else if (a.startsWith('-') && a.length > 1 && /[frR]/.test(a.slice(1))) {
      return true;
    }
  }
  return false;
}

/** Skip the options of a wrapper. Returns the index of the wrapped command word. */
function skipWrapper(name, words, i) {
  const withValue = WRAPPERS[name];
  let operandLeft = LEADING_OPERAND.has(name);
  while (i < words.length) {
    const w = words[i];
    if (w === '--') return i + 1;
    if (name === 'env' && /^[A-Za-z_]\w*=/.test(w)) {
      i += 1;
    } else if (w.startsWith('-') && w.length > 1) {
      i += withValue.has(w) ? 2 : 1;
    } else if (operandLeft) {
      operandLeft = false;
      i += 1;
    } else {
      return i;
    }
  }
  return i;
}

/** True when one simple command (or a command that it runs) is rm with a force or recursive flag. */
function refusedWords(words, depth) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const name = path.posix.basename(w);
    if (/^[A-Za-z_]\w*=/.test(w) || KEYWORDS.has(w)) {
      i += 1;
    } else if (REDIRECT.test(w)) {
      i += REDIRECT_ALONE.test(w) ? 2 : 1;
    } else if (name === 'watch') {
      // watch joins its arguments and gives them to sh -c.
      return refusedText(words.slice(skipWrapper(name, words, i + 1)).join(' '), depth + 1);
    } else if (name in WRAPPERS) {
      i = skipWrapper(name, words, i + 1);
    } else if (name === 'rm') {
      return hasForceOrRecursive(words.slice(i + 1));
    } else if (SHELLS.has(name)) {
      // bash -c 'text' (also -lc, -ec): the text is read as commands.
      const rest = words.slice(i + 1);
      const c = rest.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (c >= 0) return c + 1 < rest.length ? refusedText(rest[c + 1], depth + 1) : false;
      return words.pipedFrom ? refusedPipe(words.pipedFrom, depth) : false;
    } else if (name === 'eval') {
      return refusedText(words.slice(i + 1).join(' '), depth + 1);
    } else if (name === 'find') {
      // find ... -exec rm -rf {} ; runs rm for each file.
      for (let j = i + 1; j < words.length; j += 1) {
        if (!['-exec', '-execdir', '-ok', '-okdir'].includes(words[j])) continue;
        let end = j + 1;
        while (end < words.length && words[end] !== ';' && words[end] !== '+') end += 1;
        if (refusedWords(words.slice(j + 1, end), depth)) return true;
        j = end;
      }
      return false;
    } else {
      return false;
    }
  }
  return false;
}

/**
 * True when the output of `words`, piped into a shell, can run rm with a force or recursive flag.
 * Only the output of echo and printf is known; the output of any other command is refused (fail closed).
 */
function refusedPipe(words, depth) {
  let i = 0;
  while (i < words.length && (/^[A-Za-z_]\w*=/.test(words[i]) || REDIRECT.test(words[i]))) {
    i += REDIRECT_ALONE.test(words[i]) ? 2 : 1;
  }
  if (!ECHO_LIKE.has(path.posix.basename(words[i] ?? ''))) return true;
  const out = words
    .slice(i + 1)
    .join(' ')
    .replace(/\\n/g, '\n');
  return refusedText(out, depth + 1);
}

/** True when the text runs rm with a force or recursive flag, or when it cannot be read and holds the word rm. */
function refusedText(text, depth = 0) {
  if (depth > MAX_DEPTH) return RM_WORD.test(text);
  const inner = [];
  let commands;
  try {
    commands = split(text, inner);
  } catch (error) {
    if (error instanceof Unreadable) return RM_WORD.test(text);
    throw error;
  }
  if (commands.some((words) => refusedWords(words, depth))) return true;
  return inner.some((t) => refusedText(t, depth + 1));
}

await runHookMain(async (input) => {
  if (input.tool_name !== 'Bash') return 0;
  if (typeof input.agent_id !== 'string' || input.agent_id === '') return 0;
  const projectDir = resolveProjectDir(input);
  // As the other laws: a project with no .guilda folder is skipped (D40).
  if (projectState(projectDir).state === 'none') return 0;
  const command = input.tool_input && typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
  if (!refusedText(command)) return 0;
  appendViolation(projectDir, {
    rule: 'R20',
    level: 'law',
    source: 'pre-rm',
    action: 'rm with a force or recursive flag refused in a subagent',
  });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: REASON,
      },
    }) + '\n',
  );
  return 0;
});
