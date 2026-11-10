// Read a shell command to find the files that it creates in a common form: a redirection, tee, touch, cp and mv.
// This is a small reader, not a full shell parser. It reads only the command text, so it does not see a path that
// comes from a variable or a command substitution, or a write from inside a script or an interpreter.
import fs from 'node:fs';
import path from 'node:path';
import { splitCommands, stripPrefix, isVariable, resolveDir } from './git-command.mjs';

// A last line that the reader sees as its own command only when no quote is open at the end of the text.
const END_MARK = 'guilda-shell-writes-end';
const FD_TARGET = /^(?:\d+|-)$/;
// The text before `>` that is part of the redirection operator, not an argument: `2>`, `&>`, `<>`.
const OPERATOR_PREFIX = /^(?:\d+|&|<)?$/;
const EACH_ARGUMENT = new Set(['tee', 'touch']);
const LAST_ARGUMENT = new Set(['cp', 'mv']);

// Stands for a `>` that sits inside quotes, so that it is not read as a redirection. It never appears in a command.
const QUOTED_GT = '\u0001';

/** The text with each `>` inside single or double quotes replaced by QUOTED_GT. */
function maskQuotedGreaterThan(command) {
  let out = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      out += ch === '>' ? QUOTED_GT : ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      if (ch === '\\' && i + 1 < command.length) out += ch + command[++i].replace('>', QUOTED_GT);
      else out += ch === '>' ? QUOTED_GT : ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '\\' && i + 1 < command.length) {
      out += ch + command[++i];
    } else {
      out += ch;
    }
  }
  return out;
}

/** The simple commands of the text, or null when the text ends inside an open quote. */
function readCommands(command) {
  // `>|` is a redirection, but the reader splits commands at `|`.
  const text = maskQuotedGreaterThan(command).replace(/>\|/g, '> ');
  const commands = splitCommands(`${text}\n${END_MARK}`);
  const last = commands.pop();
  if (!last || last.length !== 1 || last[0] !== END_MARK) return null;
  return commands;
}

/** Split the words of one simple command into its arguments and the targets of its output redirections. */
function readRedirections(words) {
  const args = [];
  const targets = [];
  for (let i = 0; i < words.length; i += 1) {
    let word = words[i];
    let at = word.indexOf('>');
    if (at < 0) {
      args.push(word);
      continue;
    }
    const prefix = word.slice(0, at);
    if (!OPERATOR_PREFIX.test(prefix)) args.push(prefix);
    while (at >= 0) {
      let rest = word.slice(at + 1);
      if (rest.startsWith('>')) rest = rest.slice(1);
      const duplicate = rest.startsWith('&');
      if (duplicate) rest = rest.slice(1);
      const next = rest.indexOf('>');
      let target = next < 0 ? rest : rest.slice(0, next);
      if (target === '' && next < 0 && i + 1 < words.length) {
        i += 1;
        target = words[i];
      }
      if (target !== '' && !(duplicate && FD_TARGET.test(target))) targets.push(target);
      if (next < 0) break;
      word = rest;
      at = next;
    }
  }
  const unmask = (w) => w.replaceAll(QUOTED_GT, '>');
  return { args: args.map(unmask), targets: targets.map(unmask) };
}

/** The arguments that are not options. After `--`, each argument counts. */
function operands(args) {
  const out = [];
  let options = true;
  for (const arg of args) {
    if (options && arg === '--') options = false;
    else if (!options || !arg.startsWith('-') || arg === '-') out.push(arg);
  }
  return out;
}

function isFolder(cwd, target) {
  try {
    return fs.statSync(resolveDir(cwd, target)).isDirectory();
  } catch {
    return false;
  }
}

/** The files that cp or mv creates: the last argument, or the folder plus the base name of each source. */
function copyTargets(args, cwd) {
  const names = operands(args);
  if (names.length < 2) return [];
  const dest = names[names.length - 1];
  if (!isFolder(cwd, dest)) return [dest];
  return names.slice(0, -1).map((source) => path.join(dest, path.basename(source)));
}

/**
 * Find the files that a shell command creates. Returns [{ path, cwd }]: the literal path of the command text, and
 * the directory of the command at that point. A cd or pushd with a literal target moves that directory. A path with
 * a variable or a substitution is not returned. It never throws: on a text that it cannot read it returns [].
 */
export function findCreatedFiles(command, startCwd) {
  try {
    if (typeof command !== 'string') return [];
    const commands = readCommands(command);
    if (!commands) return [];
    const found = [];
    let cwd = startCwd;
    const add = (file) => {
      if (file !== '' && !isVariable(file)) found.push({ path: file, cwd });
    };
    for (const words of commands) {
      const { args, targets } = readRedirections(words);
      // The shell opens the redirection targets before the command runs, so they use the directory before a cd.
      targets.forEach(add);
      const { rest } = stripPrefix(args);
      if (rest.length === 0) continue;
      const name = path.basename(rest[0]);
      if (name === 'cd' || name === 'pushd') {
        const target = rest.slice(1).find((w) => !w.startsWith('-'));
        if (target !== undefined && !isVariable(target)) cwd = resolveDir(cwd, target);
      } else if (EACH_ARGUMENT.has(name)) {
        operands(rest.slice(1)).forEach(add);
      } else if (LAST_ARGUMENT.has(name)) {
        copyTargets(rest.slice(1), cwd).forEach(add);
      }
    }
    return found;
  } catch {
    return [];
  }
}
