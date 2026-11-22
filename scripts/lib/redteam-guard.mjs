// R37: the limits of the Security Executor (spec 0.5.0, sections 3 and 5g). The PreToolUse hook calls
// redteamGuard() for each tool call. For agent_type guilda:security-executor it is an ALLOW LIST: a Bash command
// passes only when each simple command is on the list below and each path word is inside the project or the task
// worktree. Everything else is refused (deny by default). Each other caller gets null.
// The guard reads the text of a command with its own shell reader (quotes join, no expansion is read), so a form that
// it cannot read is refused. A reason is a fixed text that starts with `R37: ` and never holds the command (a
// violation record holds no command text). Any error refuses the call (X9).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyFolder } from './records.mjs';

export const SECURITY_EXECUTOR = 'guilda:security-executor';

/** The refusal texts. A test asserts each one (ARC9). */
export const REASONS = Object.freeze({
  tool: 'R37: this tool is not allowed for the Security Executor.',
  command: 'R37: the command is not on the allow list of the Security Executor. Stop and report (SX1).',
  syntax: 'R37: the shell text has a form that the guard does not read (expansion, substitution, heredoc, group or background).',
  option: 'R37: an option or an argument of this command is not allowed.',
  runTarget: 'R37: this command may run only a script or a test file of the project.',
  outside: 'R37: a path is outside the project and the task worktree.',
  credential: 'R37: a credential path.',
  envFile: 'R37: a .env file outside a fixtures folder.',
  glob: 'R37: a glob word needs a fixed prefix inside the project.',
  write: 'R37: a protected folder or file (.git, .guilda, .claude, .husky, .vscode, .idea, .envrc, .npmrc, .pypirc, a shell profile).',
  sandbox: 'R37: a Bash call that sets dangerouslyDisableSandbox is not allowed.',
  failed: 'R37: the guard could not check the call (X9).',
});

const ALLOWED_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash']);
const PATH_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const GIT_VERBS = new Set(['status', 'diff', 'log', 'show', 'blame', 'ls-files', 'rev-parse']);
const PROTECTED_NAMES = ['.git', '.guilda', '.claude', '.husky', '.vscode', '.idea', '.envrc', '.npmrc', '.pypirc'];
const PROTECTED_FILES = new Set(['.bashrc', '.zshrc', '.profile', '.bash_profile', '.zprofile', '.bash_login', '.envrc', '.npmrc', '.pypirc', '.git']);
const PROTECTED_FOLDERS = new Set(['.git', '.guilda', '.claude', '.husky', '.vscode', '.idea']);
const LEXICAL_CRED = /(^|[\s"'=:/~])(\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.config\/gcloud|\.config\/gh|\.claude\/\.credentials[\w.]*|guilda\/keys)(\/|\s|$|["'])/;
const GLOB_CHARS = new Set(['*', '?', '[']);
const SOURCE_FILE = /\.(m?js|cjs|ts|mts|py)$/;

class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

const inside = (p, root) => p === root || p.startsWith(root + path.sep);

function gitTop(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    return fs.realpathSync(r.stdout.trim());
  } catch {
    return null;
  }
}

/** A git folder of the worktree (the common dir or the own dir), as a real path, or null. */
function gitPath(cwd, flag) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', flag], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return safeReal(path.resolve(cwd, r.stdout.trim()));
}

function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * The physical path of `rel` from `base`: each `..` applies to the real path so far, and each existing part that is a
 * link is followed. A lexical normalize would let `link/../x` hide a path outside.
 */
function physical(base, rel) {
  let cur = path.isAbsolute(rel) ? path.parse(rel).root : base;
  for (const part of rel.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      cur = path.dirname(cur);
      continue;
    }
    const next = path.join(cur, part);
    const real = safeReal(next);
    cur = real ?? next;
  }
  return safeReal(cur) ?? cur;
}

function makeContext(projectDir, input, env) {
  const cwdRaw = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : path.resolve(projectDir);
  const home = typeof env.HOME === 'string' && path.isAbsolute(env.HOME) ? env.HOME : null;
  const roots = [];
  for (const candidate of [path.resolve(projectDir), gitTop(cwdRaw)]) {
    const real = candidate === null ? null : safeReal(candidate);
    if (real === null || roots.includes(real)) continue;
    // A root inside a protected folder of the project is only a task worktree of the supervisor:
    // .guilda/worktrees/<dir> or .claude/worktrees/<dir>. Any other folder there is not a root.
    const first = roots[0];
    if (first !== undefined && inside(real, first)) {
      const rel = path.relative(first, real).split(path.sep);
      const inProtected = rel.slice(0, -1).some((seg) => PROTECTED_FOLDERS.has(seg)) || PROTECTED_FOLDERS.has(rel[rel.length - 1]);
      const isWorktree = rel.length === 3 && ['.guilda', '.claude'].includes(rel[0]) && rel[1] === 'worktrees';
      if (inProtected && !isWorktree) continue;
    }
    roots.push(real);
  }
  if (roots.length === 0) refuse(REASONS.failed);
  const cwd = safeReal(cwdRaw);
  if (cwd === null || !roots.some((r) => inside(cwd, r))) refuse(REASONS.outside);
  const credDirs = [];
  if (home !== null) {
    for (const rel of ['.ssh', '.aws', '.gnupg', '.claude', '.codex', '.netrc', '.npmrc', '.config/gcloud', '.config/gh']) {
      credDirs.push(path.join(home, rel));
    }
  }
  credDirs.push(keyFolder(env));
  const gitDirs = ['--git-common-dir', '--git-dir'].map((flag) => gitPath(cwd, flag)).filter(Boolean);
  return { cwd, home, roots, gitDirs, credDirs: credDirs.flatMap((d) => [d, safeReal(d)]).filter(Boolean) };
}

/** The most specific root that holds the path (a task worktree inside .guilda wins over the project), or undefined. */
function rootOf(real, ctx) {
  return ctx.roots.filter((r) => inside(real, r)).sort((a, b) => b.length - a.length)[0];
}

function inFixtures(real, ctx) {
  const root = rootOf(real, ctx);
  if (!root) return false;
  return path.relative(root, real).split(path.sep).slice(0, -1).includes('fixtures');
}

/**
 * Check one path word: it must resolve inside a root, must not be a credential path and must not be a .env file
 * outside fixtures. `write` also refuses .guilda and a shell profile. A glob word needs a fixed prefix inside a root.
 */
function checkPath(text, glob, ctx, { write = false } = {}) {
  if (text === '/dev/null') return;
  let t = text;
  if (t === '~' || t.startsWith('~/')) {
    if (ctx.home === null) refuse(REASONS.outside);
    t = ctx.home + t.slice(1);
    if (glob >= 0) glob += ctx.home.length - 1;
  } else if (t.startsWith('~')) {
    refuse(REASONS.outside); // ~user
  }
  if (LEXICAL_CRED.test(` ${t} `)) refuse(REASONS.credential);
  let target = t;
  if (glob >= 0) {
    if (t.split('/').includes('..') || t.includes('/../')) refuse(REASONS.glob);
    // A literal part of the glob that names a protected folder or file (`*/.git/config`) is refused.
    if (t.split('/').some((part) => !/[*?[]/.test(part) && PROTECTED_NAMES.includes(part))) refuse(REASONS.write);
    const prefix = t.slice(0, glob);
    const slash = prefix.lastIndexOf('/');
    const dirPart = slash < 0 ? '.' : prefix.slice(0, slash + 1);
    target = dirPart;
    // A glob whose last part can match a .env file (`.e*`, `.*`, `.env*`, `**/.env`) is refused.
    const lastLiteral = prefix.slice(slash + 1);
    const lastSeg = t.split('/').pop();
    const canMatchEnv = lastLiteral.startsWith('.') && ('.env'.startsWith(lastLiteral) || lastLiteral.startsWith('.env'));
    if (canMatchEnv || lastSeg.startsWith('.env')) refuse(REASONS.envFile);
    if (lastLiteral.startsWith('.') && PROTECTED_NAMES.some((n) => n.startsWith(lastLiteral))) refuse(REASONS.write);
    // A glob part that starts with a dot or a bracket expression can match a protected name (`.gi[t]`, `.clau?e`,
    // `[.]git`, `.?uilda`). A part that starts with another sign cannot match a name that starts with a dot.
    if (t.split('/').some((part) => /[*?[]/.test(part) && (part.startsWith('.') || part.startsWith('[')))) refuse(REASONS.write);
  }
  const real = physical(ctx.cwd, target);
  for (const dir of ctx.credDirs) if (inside(real, dir)) refuse(REASONS.credential);
  if (!ctx.roots.some((r) => inside(real, r))) refuse(REASONS.outside);
  const base = path.basename(real);
  if (glob < 0 && base.startsWith('.env') && !inFixtures(real, ctx)) refuse(REASONS.envFile);
  {
    const root = rootOf(real, ctx);
    const folder = root !== undefined && path.relative(root, real).split(path.sep).some((seg) => PROTECTED_FOLDERS.has(seg));
    const gitDir = ctx.gitDirs.some((d) => inside(real, d));
    if (folder || gitDir || PROTECTED_FILES.has(base)) refuse(REASONS.write);
  }
}

// ---------------------------------------------------------------- the shell reader

/**
 * Read a command text into simple commands: { words: [{ text, glob }], redirs: [{ op, target }] }. Quotes join into
 * the word (no split at a quote). Any expansion ($, backtick), group, heredoc, process substitution, brace or
 * background form is refused: the guard does not read it.
 */
function lex(text) {
  const commands = [];
  let words = [];
  let redirs = [];
  let cur = '';
  let glob = -1;
  let has = false;
  let pending = null;
  const bad = () => refuse(REASONS.syntax);

  const endWord = () => {
    if (!has) return;
    const word = { text: cur, glob };
    if (pending !== null) {
      redirs.push({ op: pending, target: word });
      pending = null;
    } else words.push(word);
    cur = '';
    glob = -1;
    has = false;
  };
  const endCommand = () => {
    endWord();
    if (pending !== null) bad();
    if (words.length > 0) commands.push({ words, redirs });
    else if (redirs.length > 0) bad();
    words = [];
    redirs = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (c === ' ' || c === '\t' || c === '\r') endWord();
    else if (c === '\n') endCommand();
    else if (c === '\\') {
      if (next === undefined) bad();
      if (next !== '\n') {
        cur += next;
        has = true;
      }
      i += 1;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) bad();
      cur += text.slice(i + 1, end);
      has = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j += 1) {
        const d = text[j];
        if (d === '$' || d === '`') bad();
        if (d === '\\') {
          const e = text[j + 1];
          if (e === undefined) bad();
          if (e === '"' || e === '\\' || e === '$' || e === '`') cur += e;
          else if (e !== '\n') cur += `\\${e}`;
          j += 1;
        } else cur += d;
      }
      if (j >= text.length) bad();
      has = true;
      i = j;
    } else if (c === '$' || c === '`' || c === '(' || c === ')' || c === '{' || c === '}') bad();
    else if (c === '#' && !has) {
      while (i < text.length && text[i] !== '\n') i += 1;
      i -= 1;
    } else if (c === ';') endCommand();
    else if (c === '|') {
      if (next === '|' || next === '&') i += 1;
      endCommand();
    } else if (c === '&') {
      if (next === '&') {
        i += 1;
        endCommand();
      } else if (next === '>') {
        endWord();
        i += 1;
        pending = '&>';
        if (text[i + 1] === '>') i += 1;
      } else bad();
    } else if (c === '<') {
      if (next === '<' || next === '(' || next === '>') bad();
      endWord();
      pending = '<';
    } else if (c === '>') {
      if (next === '(') bad();
      // A word of digits right before > is a file descriptor.
      if (has && /^\d+$/.test(cur)) {
        cur = '';
        has = false;
      } else endWord();
      if (next === '&') {
        const dup = text.slice(i + 2).match(/^(\d+|-)/);
        if (dup) {
          i += 1 + dup[0].length;
          continue;
        }
        i += 1;
      } else if (next === '>' || next === '|') i += 1;
      pending = '>';
    } else {
      if (GLOB_CHARS.has(c) && glob < 0) glob = cur.length;
      cur += c;
      has = true;
    }
  }
  endCommand();
  return commands;
}

// ---------------------------------------------------------------- the allowed commands

const flag = (w) => w.text.startsWith('-') && w.text !== '-';
const texts = (words) => words.map((w) => w.text);
const has = (words, re) => words.some((w) => re.test(w.text));
const positional = (words) => words.filter((w) => !flag(w));

function needSource(words) {
  if (!positional(words).some((w) => SOURCE_FILE.test(w.text))) refuse(REASONS.runTarget);
}

/** True when semgrep has `--metrics=off` or `--metrics off`. */
function metricsOff(words) {
  return words.some((w, i) => w.text === '--metrics=off' || (w.text === '--metrics' && words[i + 1]?.text === 'off'));
}

const VALIDATORS = {
  ls: () => {},
  cat: () => {},
  head: () => {},
  tail: () => {},
  wc: () => {},
  diff: () => {},
  uniq: () => {},
  sort: (a) => {
    if (has(a, /^--compress-program/)) refuse(REASONS.option);
  },
  grep: () => {},
  rg: (a) => {
    if (has(a, /^--(pre|pre-glob|hostname-bin)(=|$)/)) refuse(REASONS.option);
  },
  find: (a) => {
    if (has(a, /^-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/)) refuse(REASONS.option);
  },
  git: (a) => {
    const verb = a[0]?.text;
    if (!GIT_VERBS.has(verb)) refuse(REASONS.option);
    if (has(a, /^(--output|--exec-path|--upload-pack|--open-files-in-pager|-O|--ext-diff|--textconv)/)) refuse(REASONS.option);
  },
  node: (a) => {
    if (has(a, /^(-[a-zA-Z]*[epri][a-zA-Z]*|--(eval|print|require|import|interactive|inspect.*|loader|experimental-loader|env-file.*))(=.*)?$/)) {
      refuse(REASONS.option);
    }
    if (!has(a, /^--test(-.*)?$/)) needSource(a);
  },
  python3: (a) => {
    if (has(a, /^-[A-Za-z]*c/) || has(a, /^-$/) || has(a, /^-[A-Za-z]*i/)) refuse(REASONS.option);
    const m = a.findIndex((w) => w.text === '-m');
    if (m >= 0) {
      if (!['pytest', 'unittest'].includes(a[m + 1]?.text)) refuse(REASONS.runTarget);
    } else needSource(a);
  },
  pytest: (a) => {
    if (has(a, /^(-p.*|--pyargs)$/)) refuse(REASONS.option);
  },
  npm: (a) => {
    const verb = positional(a)[0]?.text;
    if (!['test', 't', 'run', 'run-script'].includes(verb)) refuse(REASONS.option);
    if (a.length === 0 || a[0].text !== verb) refuse(REASONS.option);
  },
  npx: (a) => {
    if (!has(a, /^(--no-install|--no)$/)) refuse(REASONS.runTarget);
    if (has(a, /^(-p|--package.*|-c|--call.*|-y|--yes)$/)) refuse(REASONS.option);
    const bin = positional(a)[0]?.text;
    if (!bin || !/^[a-z0-9][a-z0-9._-]*$/i.test(bin)) refuse(REASONS.runTarget);
  },
  semgrep: (a, ctx) => {
    if (positional(a)[0] && ['login', 'logout', 'ci', 'publish', 'install-semgrep-pro', 'install-deep-semgrep'].includes(positional(a)[0].text)) refuse(REASONS.option);
    if (has(a, /^--(pro|login)/)) refuse(REASONS.option);
    const values = [];
    a.forEach((w, i) => {
      if (w.text === '--config' || w.text === '-f') values.push(a[i + 1]?.text);
      else if (w.text.startsWith('--config=')) values.push(w.text.slice(9));
    });
    if (values.length === 0 || !metricsOff(a)) refuse(REASONS.option);
    // A value is a local path only when it exists on disk. `auto` and `p/ci` name the registry.
    for (const v of values) if (!v || !fs.existsSync(path.resolve(ctx.cwd, v))) refuse(REASONS.option);
  },
  gitleaks: (a) => {
    if (a[0]?.text !== 'detect' || !has(a, /^--no-banner$/)) refuse(REASONS.option);
  },
  bandit: () => {},
  gosec: () => {},
  eslint: () => {},
  'osv-scanner': (a) => {
    if (!has(a, /^--offline$/) || has(a, /^(fix|update|--download-offline-databases.*)$/)) refuse(REASONS.option);
  },
  jq: (a) => {
    if (has(a, /(^|[^A-Za-z_])(env|input_filename)([^A-Za-z_]|$)|\$ENV|\$__prog/)) refuse(REASONS.option);
  },
  sed: (a) => {
    const scripts = positional(a).map((w) => w.text);
    if (scripts.some((s) => /(^|[;{}\n])\s*[0-9$,/]*\s*[ew]\s|\/[a-zA-Z]*[ew][a-zA-Z]*\s*($|;|\n)/.test(s))) refuse(REASONS.option);
  },
  awk: (a) => {
    if (has(a, /^-[A-Za-z]*i/)) refuse(REASONS.option);
    if (positional(a).some((w) => /system|getline|ENVIRON|\||>/.test(w.text))) refuse(REASONS.option);
  },
  mkdir: () => {},
  touch: () => {},
  cp: (a) => {
    if (has(a, /^-[A-Za-z]*t/)) refuse(REASONS.option);
  },
  mv: (a) => {
    if (has(a, /^-[A-Za-z]*t/)) refuse(REASONS.option);
  },
};
VALIDATORS.python = VALIDATORS.python3;

const WRITERS = new Set(['mkdir', 'touch', 'cp', 'mv']);

/** The text of an option that could carry a path: `--x=value`, or the tail of `-Xvalue`. */
function optionValue(text) {
  if (text.startsWith('--')) return text.includes('=') ? text.slice(text.indexOf('=') + 1) : null;
  const tail = text.replace(/^-[A-Za-z]*/, '');
  return tail === '' || tail === text ? null : tail;
}

function checkCommand(cmd, ctx) {
  const name = cmd.words[0];
  if (name.glob >= 0 || !/^[a-z][a-z0-9._-]*$/.test(name.text)) refuse(REASONS.command);
  const validate = VALIDATORS[name.text];
  if (!validate) refuse(REASONS.command);
  const args = cmd.words.slice(1);
  validate(args, ctx);
  const sedWrite = name.text === 'sed' && args.some((w) => /^-[A-Za-z]*i|^--in-place/.test(w.text));
  const write = WRITERS.has(name.text) || sedWrite;
  for (const w of args) {
    if (flag(w)) {
      const value = optionValue(w.text);
      if (value !== null && value !== '' && !/^\d+$/.test(value)) checkPath(value, w.glob >= 0 ? [...value].findIndex((ch) => GLOB_CHARS.has(ch)) : -1, ctx, { write });
    } else checkPath(w.text, w.glob, ctx, { write });
  }
  for (const r of cmd.redirs) checkPath(r.target.text, r.target.glob, ctx, { write: r.op !== '<' });
}

function checkBash(input, ctx) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') refuse(REASONS.failed);
  if (input.tool_input && 'dangerouslyDisableSandbox' in input.tool_input) refuse(REASONS.sandbox);
  for (const cmd of lex(command)) checkCommand(cmd, ctx);
}

function checkPathTool(input, ctx) {
  const ti = input.tool_input ?? {};
  const tool = input.tool_name;
  if (PATH_TOOLS.has(tool)) {
    const fp = typeof ti.file_path === 'string' ? ti.file_path : ti.notebook_path;
    if (typeof fp !== 'string' || fp === '') refuse(REASONS.failed);
    checkPath(fp, -1, ctx, { write: true });
    return;
  }
  // Read, Grep, Glob: each path field, and the glob pattern, must be inside the project.
  for (const f of [ti.file_path, ti.path, ti.glob, tool === 'Glob' ? ti.pattern : undefined]) {
    if (typeof f !== 'string' || f === '') continue;
    const g = [...f].findIndex((ch) => GLOB_CHARS.has(ch));
    checkPath(f, g, ctx);
  }
}

/**
 * The R37 check. Returns null to let the call pass, or { reason } to refuse it. agent_type is compared in lower case
 * with the spaces cut, as pre-agent reads a type. Each other caller gets null. Any error refuses (X9).
 */
export function redteamGuard(projectDir, input, env = process.env) {
  if (!input || typeof input !== 'object') return null;
  const type = typeof input.agent_type === 'string' ? input.agent_type.trim().toLowerCase() : '';
  if (type !== SECURITY_EXECUTOR) return null;
  try {
    const tool = input.tool_name;
    if (!ALLOWED_TOOLS.has(tool) && !PATH_TOOLS.has(tool)) refuse(REASONS.tool);
    const ctx = makeContext(projectDir, input, env);
    if (tool === 'Bash') checkBash(input, ctx);
    else checkPathTool(input, ctx);
    return null;
  } catch (err) {
    return { reason: err instanceof Refusal ? err.message : REASONS.failed };
  }
}
