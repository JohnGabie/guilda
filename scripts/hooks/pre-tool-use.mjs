import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir } from '../lib/hook-io.mjs';
import { scanText, globMatch } from '../lib/scan.mjs';
import { findGitCommits, parseAddedLines, resolveDir, splitCommands, stripPrefix, isVariable } from '../lib/git-command.mjs';
import { findCreatedFiles } from '../lib/shell-writes.mjs';
import { queueFileWrites, queueScriptCall, queueClaimOnly, queueCallHasNow, liveClaim, isQueueFile } from '../lib/queue-guard.mjs';
import { busPaths, MAIN } from '../lib/bus.mjs';
import { readBindings, validId, queuePaths } from '../lib/queue.mjs';
import { keyFolder, TYPED_ENTRYPOINT } from '../lib/records.mjs';

const PLANS_DIR = ['docs', 'superpowers', 'plans'];
const PLAN_SUFFIX = '.plan.md';
const R4_PROBLEMS = {
  plans: {
    action: 'new file refused in docs/superpowers/plans',
    reason: 'R4: plans are a "## Plan: Part N" section of the feature MD, or <feature>.plan.md next to it',
  },
  orphan: {
    action: 'orphan plan file refused',
    reason: 'R4: <name>.plan.md needs <name>.md in the same folder',
  },
};

// R32 (X2): the refusals and their records. A record never holds the command text.
const R32 = {
  input: { action: 'hook input refused: cannot read', reason: 'R32: cannot read the hook input' },
  file: {
    action: 'queue file write refused',
    reason: 'R32: change the queue only through the queue script (node scripts/queue.mjs), never by hand',
  },
  agent: {
    action: 'queue script call refused: not the writer role',
    reason: 'R32: only the writer role calls the queue script; that is the Architect in the main session, never an agent',
  },
  error: { action: 'hook error: cannot check the call', reason: 'R32: cannot check the call' },
  now: { action: 'queue script call refused: --now', reason: 'R32: --now is for tests only' },
  claimed: {
    action: 'queue script call refused: another session holds the claim',
    reason: 'R32: the supervisor session holds the queue; send a request to supervisor',
  },
  noSession: { action: 'queue script call refused: no --session', reason: 'R32: no --session' },
  session: {
    action: 'queue script call refused: --session is not this session',
    reason: 'R32: the --session value is not the session of this call; use the ID of the line "guilda session: <id>"',
  },
};

const hasAgentId = (input) => input.agent_id !== undefined && input.agent_id !== null;

/** The R32 problem of a queue script call, or null. The writer role: the Architect in the main session, with no agent_id (X2, 0.3.0 row). */
function queueCallProblem(projectDir, input, call, command) {
  if (hasAgentId(input)) return 'agent';
  if (call.sessions.some((s) => s === null)) return 'noSession';
  const own = typeof input.session_id === 'string' && input.session_id !== '' ? input.session_id : null;
  if (!call.sessions.every((s) => own !== null && s === own)) return 'session';
  // The claim row (0.5.0): while another session holds a live claim, only the claim session writes. A read error refuses.
  if (queueCallHasNow(command)) return 'now';
  const held = liveClaim(projectDir);
  if (held.error) return 'error';
  if (queueClaimOnly(command)) return null;
  return held.claim && held.claim.session !== own ? 'claimed' : null;
}

// R34 (4g): the bus law. A record never holds the command text, a path, a record text or a key byte.
const R34 = {
  write: {
    action: 'bus file write refused',
    reason: 'R34: write .guilda/bus/ only through the bus script (node scripts/bus.mjs)',
  },
  key: { action: 'key folder access refused', reason: 'R34: the key folder of guilda is not readable by tools' },
  forge: {
    action: 'user record forge refused',
    reason: 'R34: a tool cannot run the user record code of guilda or set CLAUDE_CODE_ENTRYPOINT; only Claude Code runs that hook',
  },
  noRead: { action: 'bus send refused: cannot read the bindings', reason: 'R34: cannot read the bindings' },
  noBinding: {
    action: 'bus send refused: no address is bound to the agent',
    reason: 'R34: no address is bound to this agent yet. Report to your controller in your reply.',
  },
  printMode: { action: 'bus send refused: a print-mode session', reason: 'R34: this print-mode session has no address' },
  from: { action: 'bus send refused: the sender is not the caller' },
};
const BUS_SCRIPT = 'bus.mjs';
const SUPERVISOR = 'supervisor';
const NODE_WORD = /^node(?:js)?(?:\.exe)?$/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const MAX_DEPTH = 8;
const MAX_SHOWN = 64;
// The text that names the key folder in any form: `~/.local/state/guilda/keys`, `$XDG_STATE_HOME/guilda/keys`, ...
// It is matched after the quotes and the backslashes of the text are taken out.
const KEY_FOLDER_NAME = 'guilda/keys';
// The text that names the guilda state folder (the parent of the key folder). With the word `keys` it is refused.
const STATE_FOLDER_NAMES = ['.local/state/guilda', 'XDG_STATE_HOME/guilda', 'XDG_STATE_HOME}/guilda'];
const KEYS_WORD = /(?:^|[^A-Za-z0-9_-])keys(?:$|[^A-Za-z0-9_-])/;
const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
// The fields of a tool input that can name a path: the path fields, the Glob pattern and the Grep file filter. A file
// text (Write content, Edit strings) is not a path, so a text about the key folder can be written.
const NAME_FIELDS = { Glob: ['pattern'], Grep: ['glob'] };
// The tools that search below a folder: a Grep or a Glob in a parent of the key folder can reach it.
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
// The shell programs that always walk a folder tree, and those that walk it only with a flag.
const WALKERS = new Set(['find', 'rg', 'tar', 'tree', 'du', 'fd', 'zip', 'rsync']);
const WALK_FLAGS = {
  grep: /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive|--directories=recurse)$/,
  egrep: /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)$/,
  fgrep: /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)$/,
  ls: /^(?:-[A-Za-z]*R[A-Za-z]*|--recursive)$/,
  cp: /^(?:-[A-Za-z]*[rRa][A-Za-z]*|--recursive|--archive)$/,
  chmod: /^(?:-[A-Za-z]*R[A-Za-z]*|--recursive)$/,
};
const GLOB_CHAR = /[*?[{]/;
// The files that write a user record. A shell command that runs one can forge a record (Security, block the obvious).
// A command that only names one (git add, git diff, cat) passes, so guilda can be built with guilda.
const RECORD_CODE = /(?:^|[^A-Za-z0-9_-])(?:records|user-prompt-submit)\.mjs(?![A-Za-z0-9_.-])/;
const RECORD_FILE_WORD = /(?:^|\/)(?:records|user-prompt-submit)\.mjs$/;
// The run forms: an interpreter word, a module load, or the file as the first word of the command.
const INTERPRETER = /(?:^|[\s(`=])(?:[^\s()`]*\/)?(?:node|nodejs|bun|deno|npx|tsx|sh|bash)(?=[\s)`]|$)/;
const MODULE_LOAD = /(?:^|[^A-Za-z0-9_])import(?![A-Za-z0-9_])|require\s*\(|--import|--require/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// A shell command that sets the print-mode mark: an assignment, `env NAME=`, `export NAME` and the like.
const SETS_ENTRYPOINT = [/CLAUDE_CODE_ENTRYPOINT\s*\+?=/, /\b(?:export|declare|typeset|readonly|local|setenv)\b[^;&|\n]*CLAUDE_CODE_ENTRYPOINT/];

/** True when one part of a command runs the user record code: it names the file and has a run form. */
function runsRecordCode(part) {
  if (!RECORD_CODE.test(part)) return false;
  if (INTERPRETER.test(part) || MODULE_LOAD.test(part)) return true;
  const first = part.trim().split(/\s+/).find((w) => !ASSIGNMENT.test(w));
  return first !== undefined && RECORD_FILE_WORD.test(first);
}

/**
 * True when a shell command runs the user record code or sets CLAUDE_CODE_ENTRYPOINT, in any quoting. The text is
 * read with its quotes and backslashes taken out, one part between `;`, `&`, `|` and line ends at a time.
 */
function forgesRecord(command) {
  const t = command.replace(/['"\\]/g, '');
  return SETS_ENTRYPOINT.some((re) => re.test(t)) || t.split(/[;&|\n]+/).some(runsRecordCode);
}
// The flags of `bus.mjs send` that take a value, as in scripts/bus.mjs; each other word is one argument.
const SEND_VALUE_FLAGS = new Set(['--from', '--to', '--type', '--text', '--task', '--reply-to', '--record']);

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

/** True when `abs` is `dir` or a path inside it. */
function inside(abs, dir) {
  const rel = path.relative(dir, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when the path, in its literal or real form, is inside one of the folders (each also in its real form). */
function insideAny(abs, dirs) {
  const forms = [path.resolve(abs), realish(path.resolve(abs))];
  const targets = dirs.flatMap((d) => [d, realish(d)]);
  return forms.some((f) => targets.some((d) => inside(f, d)));
}

/** The key folders to keep from tools: the one of this environment and the default one of the home folder. */
function keyFolders() {
  const folders = new Set([keyFolder(process.env), keyFolder({ HOME: process.env.HOME })]);
  return [...folders];
}

/** The literal and the real forms of a path. */
const formsOf = (abs) => [...new Set([path.resolve(abs), realish(path.resolve(abs))])];

/** True when the path is a key folder or inside one. */
const inKeyFolder = (abs, folders) => formsOf(abs).some((f) => folders.some((d) => formsOf(d).some((k) => inside(f, k))));
/** True when the path is a key folder, inside one, or a parent of one. */
const reachesKeyFolder = (abs, folders) =>
  inKeyFolder(abs, folders) || formsOf(abs).some((f) => folders.some((d) => formsOf(d).some((k) => inside(k, f))));

/** The text with its quotes and backslashes taken out, and each `/` doubled sign made one. */
const plain = (text) => text.replace(/['"\\]/g, '').replace(/\/{2,}/g, '/');

/** True when a text names the key folder: its name, its path, or the guilda state folder with the word `keys`. */
function textNamesKeyFolder(text, folders) {
  const t = plain(text);
  if (t.includes(KEY_FOLDER_NAME)) return true;
  if (folders.some((d) => formsOf(d).some((k) => t.includes(k)))) return true;
  const states = [...STATE_FOLDER_NAMES, ...folders.flatMap((d) => formsOf(path.dirname(d)))];
  return states.some((n) => t.includes(n)) && KEYS_WORD.test(t);
}

/** A shell word with $HOME and $XDG_STATE_HOME put in, as the shell does. Each other variable stays. */
function expandWord(word) {
  const home = process.env.HOME || '';
  const xdg = process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return word
    .replace(/\$\{HOME\}|\$HOME(?![A-Za-z0-9_])/g, home)
    .replace(/\$\{XDG_STATE_HOME\}|\$XDG_STATE_HOME(?![A-Za-z0-9_])/g, xdg);
}

/**
 * True when a shell command can reach a key folder: a word that resolves into one, or a program that walks a folder
 * tree (find, rg, grep -r, ls -R, tar, cp -r, ...) on a key folder or a parent of one. A literal `cd` moves the folder
 * of the next commands. A path from another variable passes (the R34 limit).
 */
function commandReachesKeyFolder(command, startCwd, folders, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  let cwd = startCwd;
  for (const words of splitCommands(command)) {
    const { rest } = stripPrefix(words);
    const inner = innerText(rest);
    if (inner !== null && commandReachesKeyFolder(inner, cwd, folders, depth + 1)) return true;
    const resolve = (w) => {
      const e = expandWord(w);
      return isVariable(e) ? null : resolveDir(cwd, e);
    };
    for (const w of rest) {
      const abs = resolve(w.replace(/^[^=]*=/, (m) => (m.startsWith('-') ? '' : m)));
      if (abs !== null && inKeyFolder(abs, folders)) return true;
      const whole = resolve(w);
      if (whole !== null && inKeyFolder(whole, folders)) return true;
    }
    const names = rest.map((w) => path.basename(w));
    for (let i = 0; i < names.length; i += 1) {
      const flag = WALK_FLAGS[names[i]];
      const args = rest.slice(i + 1);
      if (!WALKERS.has(names[i]) && !(flag && args.some((a) => flag.test(a)))) continue;
      const operands = args.filter((a) => !a.startsWith('-'));
      const targets = operands.length > 0 ? operands : ['.'];
      if (targets.some((a) => {
        const abs = resolve(a.replace(GLOB_CHAR, '\u0000').split('\u0000')[0] || '.');
        return abs !== null && reachesKeyFolder(abs, folders);
      })) return true;
    }
    if ((names[0] === 'cd' || names[0] === 'pushd') && rest.length > 1) {
      const target = rest.slice(1).find((w) => !w.startsWith('-'));
      const abs = target === undefined ? null : resolve(target);
      if (abs !== null) cwd = abs;
    }
  }
  return false;
}

/** The folder part of a glob pattern before its first glob sign, and the rest. */
function globBase(pattern) {
  const at = pattern.search(GLOB_CHAR);
  if (at < 0) return { base: pattern, rest: '' };
  const cut = pattern.lastIndexOf('/', at);
  return { base: cut < 0 ? '' : pattern.slice(0, cut + 1), rest: cut < 0 ? pattern : pattern.slice(cut + 1) };
}

/**
 * True when a tool call can read a key folder (L4-2 C4). Each tool: a path field or a name field names it (in any
 * quoting), or a path field resolves into it. A Grep or a Glob: its search folder (the path field, else the cwd, plus
 * the folder part of the Glob pattern) is a key folder, inside one or a parent of one. A shell command: the text
 * names it, or the command can reach it (commandReachesKeyFolder).
 */
function namesKeyFolder(toolName, toolInput, cwd) {
  const folders = keyFolders();
  if (toolName === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    return command !== '' && (textNamesKeyFolder(command, folders) || commandReachesKeyFolder(command, cwd, folders));
  }
  const fields = [...PATH_FIELDS, ...(NAME_FIELDS[toolName] ?? [])];
  const texts = fields.map((k) => toolInput[k]).filter((t) => typeof t === 'string' && t !== '');
  if (texts.some((t) => textNamesKeyFolder(t, folders))) return true;
  const own = (k) => (typeof toolInput[k] === 'string' && toolInput[k] !== '' ? resolveDir(cwd, toolInput[k]) : null);
  if (PATH_FIELDS.some((k) => own(k) !== null && inKeyFolder(own(k), folders))) return true;
  if (!SEARCH_TOOLS.has(toolName)) return false;
  let base = own('path') ?? cwd;
  if (toolName === 'Glob' && typeof toolInput.pattern === 'string') {
    const g = globBase(toolInput.pattern);
    base = resolveDir(base, g.base || '.');
  }
  return reachesKeyFolder(base, folders);
}

/** True when a shell command writes into `.guilda/bus/` in a form of R4: a redirection, tee, touch, cp or mv. */
function commandWritesBus(projectDir, command, startCwd) {
  const { bus } = busPaths(projectDir);
  return findCreatedFiles(command, startCwd).some((entry) =>
    [projectDir, entry.cwd].some((base) => insideAny(resolveDir(base, entry.path), [bus])),
  );
}

/** The text that an `eval` or a `sh -c` simple command runs, or null. */
function innerText(rest) {
  const names = rest.map((w) => path.basename(w));
  if (names[0] === 'eval') return rest.slice(1).join(' ');
  const shellAt = names.findIndex((n) => SHELLS.has(n));
  if (shellAt < 0) return null;
  const flag = rest.findIndex((w, i) => i > shellAt && /^-[a-z]*c[a-z]*$/.test(w));
  if (flag < 0) return null;
  const at = rest[flag + 1] === '--' ? flag + 2 : flag + 1;
  return rest[at] !== undefined ? rest[at] : null;
}

// R38: an allow list on the text. A command passes only when no word of it is `cswap`, a path that ends in /cswap, or a
// glob that can match one of them. The one exception is the exact command `cswap budget` or `cswap budget --json`
// (with an optional path to cswap, and no $ or backtick), alone or as the first part of a pipe. A false refusal is
// accepted. Accepted limit (as R32): a binary copied under another name, and an interpreter that builds the name at
// run time (node -e, python3 -c, a script file made with Write), are not seen.
const BUDGET_COMMAND = /^(?:[A-Za-z0-9_.~+\/-]*\/)?cswap\s+budget(?:\s+--json)?$/;
const WORD_SPLIT = /[\s;&|()<>=:,`$]+/;
// The same split that keeps a comma, so a brace group like {cswap,x} stays one glob word.
const GLOB_WORD_SPLIT = /[\s;&|()<>=:`$]+/;
const GLOB_SIGN =/[*?[{]/;

/** The regex of a shell glob, anchored. A brace group with a comma is an alternation; other braces are literal. */
function globRegex(glob) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end < 0) out += '\\[';
      else {
        const body = glob.slice(i + 1, end).replace(/^[!^]/, '^').replace(/\\/g, '\\\\');
        out += `[${body}]`;
        i = end;
      }
    } else if (ch === '{' && glob.indexOf('}', i) > i && glob.slice(i, glob.indexOf('}', i)).includes(',')) {
      out += '(?:';
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      out += ')';
      depth -= 1;
    } else if (ch === ',' && depth > 0) out += '|';
    else out += ch.replace(/[.+^$()|\\\]{}]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** True when a word is cswap, a path that ends in /cswap, or a glob that can match one of them. */
function namesCswap(word) {
  if (word === 'cswap' || word.endsWith('/cswap')) return true;
  if (!GLOB_SIGN.test(word)) return false;
  const last = word.slice(word.lastIndexOf('/') + 1);
  try {
    return globRegex(word).test('cswap') || globRegex(last).test('cswap');
  } catch {
    return true; // a glob that cannot be read fails closed
  }
}

const mentionsCswap = (text) => {
  const flat = plain(text);
  return [WORD_SPLIT, GLOB_WORD_SPLIT].some((re) => flat.split(re).some((w) => w !== '' && namesCswap(w)));
};

/** True when a shell command must be refused by R38. */
function runsCswapAccountCommand(raw) {
  // A backslash-newline pair joins two lines, so \`cs\\<newline>wap\` is the word cswap.
  const command = raw.replace(/\\\r?\n/g, '');
  if (!mentionsCswap(command)) return false;
  if (/[$`]/.test(command)) return true;
  const parts = command.trim().split(/(?<!\|)\|(?!\|)/);
  if (!BUDGET_COMMAND.test(parts[0].trim())) return true;
  return mentionsCswap(parts.slice(1).join(' '));
}

const isBusScript = (word) => path.basename(word.replace(/\\/g, '/')) === BUS_SCRIPT;

/**
 * The `--from` value of each `bus.mjs send` call of a shell command, read from the command text only. A value is
 * null when the call has no `--from`, or when a variable can stand for a flag (fail closed). A call whose command
 * word is a variable counts as a send.
 */
function sendCalls(command, depth = 0, out = []) {
  if (depth > MAX_DEPTH) return out;
  for (const words of splitCommands(command)) {
    const { rest } = stripPrefix(words);
    const inner = innerText(rest);
    if (inner !== null) sendCalls(inner, depth + 1, out);
    let at = rest.length > 0 && isBusScript(rest[0]) ? 0 : -1;
    if (at < 0) {
      const nodeAt = rest.findIndex((w) => NODE_WORD.test(path.basename(w)) || isVariable(w));
      if (nodeAt >= 0) at = rest.findIndex((w, i) => i > nodeAt && isBusScript(w));
    }
    if (at < 0) continue;
    const args = rest.slice(at + 1);
    const sendAt = [0, 1].find((i) => args[i] === 'send' || (args[i] !== undefined && isVariable(args[i])));
    if (sendAt === undefined) continue;
    let from = null;
    let open = false;
    for (let i = sendAt + 1; i < args.length; i += 1) {
      if (args[i] === '--from') {
        from = args[i + 1] ?? null;
        i += 1;
      } else if (SEND_VALUE_FLAGS.has(args[i])) {
        i += 1;
      } else if (isVariable(args[i])) {
        open = true;
      }
    }
    out.push(open ? null : from);
  }
  return out;
}

/** True when the queue files that the binding table comes from can be read. A missing file is no error. */
function bindingsReadable(projectDir) {
  const P = queuePaths(projectDir);
  for (const file of [P.state, P.journal]) {
    try {
      fs.readFileSync(file);
    } catch (err) {
      if (err.code !== 'ENOENT') return false;
    }
  }
  return true;
}

/** The address of the caller of a send (4g, part 1): { address } or { problem }. It comes from the hook input. */
function callerOf(projectDir, input) {
  if (!bindingsReadable(projectDir)) return { problem: 'noRead' };
  if (hasAgentId(input)) {
    const bound = Object.values(readBindings(projectDir)).find((b) => b.state === 'bound' && b.agentId === input.agent_id);
    return bound ? { address: bound.address } : { problem: 'noBinding' };
  }
  // The session of the live claim sends as supervisor. A read error of writer.json gives the 0.4.1 result.
  const held = liveClaim(projectDir);
  if (held.claim && typeof input.session_id === 'string' && input.session_id === held.claim.session) return { address: SUPERVISOR };
  const own = process.env.GUILDA_ADDRESS;
  if (typeof own === 'string' && validId('address', own)) return { address: own };
  if (process.env.CLAUDE_CODE_ENTRYPOINT !== TYPED_ENTRYPOINT) return { problem: 'printMode' };
  return { address: MAIN };
}

/** The R34 refusal of the sends of a shell command: { key } or { reason }, or null when each send is from the caller. */
function sendProblem(projectDir, input, command) {
  const froms = sendCalls(command);
  if (froms.length === 0) return null;
  const caller = callerOf(projectDir, input);
  if (caller.problem) return { key: caller.problem };
  const wrong = froms.find((f) => f !== caller.address);
  if (wrong === undefined) return null;
  const shown = wrong === null ? '(none)' : [...wrong].slice(0, MAX_SHOWN).join('');
  return { key: 'from', reason: `R34: --from ${shown} is not your address (${caller.address})` };
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
}

// These options stop git config and attributes from changing the text or the file names of the diff.
const DIFF_ARGS = [
  '-U0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--text',
  '--inter-hunk-context=0',
  '-O/dev/null',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

function git(args, { cwd, gitArgs = [], env = {} }) {
  // spawnSync throws on a NUL byte in an argument or in cwd. Treat that as a failed call; the session directory is
  // always a target too, so the scan does not stop there.
  try {
    return spawnSync('git', [...gitArgs, ...args], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return { error, status: null, stdout: '' };
  }
}

/**
 * Added lines of everything a commit can take. The index and the working tree can differ, so read both: the index
 * (--cached) and the tracked working-tree changes (HEAD, or the index when no commit exists yet).
 * Returns null outside a repository. Returns { failed: true } when git cannot read the diff in a repository.
 */
function commitAddedLines(call) {
  const repo = git(['rev-parse', '--git-dir'], call);
  if (repo.error || repo.status !== 0) return null;
  const hasHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], call).status === 0;
  const base = ['-c', 'core.quotepath=false', '-c', 'diff.relative=false', 'diff', ...DIFF_ARGS];
  const files = [];
  let readOne = false;
  for (const extra of [['--cached'], hasHead ? ['HEAD'] : []]) {
    const r = git([...base, ...extra], call);
    if (r.error && r.error.code === 'ENOBUFS') {
      process.stderr.write('guilda: commit scan skipped: the diff is larger than 64 MB\n');
      return { files: [] };
    }
    if (r.error || r.status !== 0) continue;
    readOne = true;
    files.push(...parseAddedLines(r.stdout || ''));
  }
  return readOne ? { files } : { failed: true };
}

/** The denial for one call, or null. `record` is true when the denial is a violation of R19. */
function checkCommit(call, config, startCwd) {
  const read = commitAddedLines(call);
  if (!read) return null;
  if (read.failed) {
    return { record: false, reason: `R19: the scan cannot read the diff in ${call.cwd} — fix the git error, then commit` };
  }
  const ignore = (config.scan && config.scan.ignore) || [];
  for (const { file, lines } of read.files) {
    if (ignore.some((g) => globMatch(g, file))) continue;
    for (const { line, text } of lines) {
      const [hit] = scanText(text);
      if (hit) {
        const where = call.cwd === startCwd ? '' : ` of ${call.cwd}`;
        return { record: true, reason: `R19: ${hit.kind} in ${file}:${line}${where} — remove it before commit` };
      }
    }
  }
  return null;
}

/** The places to scan. The session directory is always one, because the reader can lose track of `cd`. */
function scanTargets(found, startCwd, projectDir) {
  const targets = [...found.commits, { cwd: startCwd }];
  if (found.uncertain || found.commits.length === 0) targets.push({ cwd: projectDir });
  const seen = new Set();
  return targets.filter((t) => {
    const key = JSON.stringify([t.cwd, t.gitArgs ?? [], t.env ?? {}]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The R4 problem of a file that a tool is about to write: 'plans' for a new file inside docs/superpowers/plans/,
 * 'orphan' for a new <name>.plan.md whose folder has no <name>.md, else null. An existing file is never a problem.
 */
function planFileProblem(projectDir, absPath) {
  if (fs.existsSync(absPath)) return null;
  const rel = path.relative(path.join(projectDir, ...PLANS_DIR), absPath);
  if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return 'plans';
  const base = path.basename(absPath);
  if (!base.endsWith(PLAN_SUFFIX)) return null;
  const spec = path.join(path.dirname(absPath), `${base.slice(0, -PLAN_SUFFIX.length)}.md`);
  return fs.existsSync(spec) ? null : 'orphan';
}

/** The first R4 problem of the files that a shell command creates, from the project folder and from the command cwd. */
function commandPlanProblem(projectDir, command, startCwd) {
  for (const entry of findCreatedFiles(command, startCwd)) {
    for (const base of [projectDir, entry.cwd]) {
      const problem = planFileProblem(projectDir, resolveDir(base, entry.path));
      if (problem) return problem;
    }
  }
  return null;
}

async function main(input) {
  // A seam for the fail-closed test only: no product path sets it.
  if (process.env.GUILDA_TEST_HOOK_THROW === '1') throw new Error('test error');
  const projectDir = resolveProjectDir(input);
  const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const startCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : projectDir;
  const record = (rule, action) =>
    appendViolation(projectDir, { rule, level: 'law', source: 'pre-tool-use', action });
  const refuse34 = (key, reason = R34[key].reason) => {
    record('R34', R34[key].action);
    deny(reason);
    return 0;
  };
  // R34: the key folder is refused in each project, also one with no .guilda folder (the record needs one).
  if (namesKeyFolder(input.tool_name, toolInput, startCwd)) return refuse34('key');
  // R34: the hook runs from Claude Code, never from a shell, so the refusal holds for a subagent and the main session.
  if (input.tool_name === 'Bash' && typeof toolInput.command === 'string' && forgesRecord(toolInput.command)) return refuse34('forge');
  // R38: the account commands are refused in each folder, also one with no .guilda folder.
  // An error inside the check denies the call.
  if (input.tool_name === 'Bash' && typeof toolInput.command === 'string') {
    let refused;
    try {
      refused = runsCswapAccountCommand(toolInput.command);
    } catch {
      refused = true;
    }
    if (refused) {
      record('R38', 'usage account command refused');
      deny('R38: read usage only (cswap budget or the cswap MCP tools); never switch or list accounts');
      return 0;
    }
  }
  if (['Read', 'Grep', 'Glob'].includes(input.tool_name)) return 0;

  // A broken project layer runs the laws with the safe defaults (D40). Only a project with no .guilda folder is skipped.
  const project = projectState(projectDir);
  if (project.state === 'none') return 0;

  const refuse32 = (key) => {
    record('R32', R32[key].action);
    deny(R32[key].reason);
    return 0;
  };

  if (input.tool_name === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (commandWritesBus(projectDir, command, startCwd)) return refuse34('write');
    const send = sendProblem(projectDir, input, command);
    if (send) return refuse34(send.key, send.reason);
    if (queueFileWrites(command, startCwd, projectDir).length > 0) return refuse32('file');
    const call = queueScriptCall(command);
    if (call) {
      const problem = queueCallProblem(projectDir, input, call, command);
      if (problem) return refuse32(problem);
    }
    // R4 runs before R19: a command with no git commit returns early below.
    const planProblem = commandPlanProblem(projectDir, command, startCwd);
    if (planProblem) {
      record('R4', R4_PROBLEMS[planProblem].action);
      deny(R4_PROBLEMS[planProblem].reason);
      return 0;
    }
    const found = findGitCommits(command, startCwd);
    if (found.commits.length === 0 && !found.mentioned) return 0;
    // The hook runs before the command, so the scan cannot see what this command will stage.
    if (found.addBeforeCommit) {
      deny(`R19: run git ${found.indexChange} in its own command, then git commit, so that the scan can read the staged lines`);
      return 0;
    }
    for (const target of scanTargets(found, startCwd, projectDir)) {
      const denial = checkCommit(target, project.config, startCwd);
      if (denial) {
        // A command that only names a commit is refused as a precaution, and it is not a violation.
        if (denial.record && found.commits.length > 0) record('R19', 'git commit refused: staged secret or absolute path');
        deny(denial.reason);
        return 0;
      }
    }
    return 0;
  }

  if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
    const absPath = path.resolve(projectDir, filePath.replace(/\\/g, '/'));
    if (filePath && insideAny(absPath, [busPaths(projectDir).bus])) return refuse34('write');
    if (filePath && isQueueFile(projectDir, absPath)) return refuse32('file');
    const problem = filePath ? planFileProblem(projectDir, absPath) : null;
    if (problem) {
      record('R4', R4_PROBLEMS[problem].action);
      deny(R4_PROBLEMS[problem].reason);
    }
  }
  return 0;
}

/** { value, text }: the parsed hook input, or null when stdin is not a JSON object, and the raw text. */
async function readInput() {
  let text = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) text += chunk;
    const value = JSON.parse(text);
    return { value: value && typeof value === 'object' && !Array.isArray(value) ? value : null, text };
  } catch {
    return { value: null, text };
  }
}

// A law fails closed (X9): an input that the hook cannot read is refused, in a project with a .guilda folder. An input
// whose text names the bus script can be a send, so it gets the R34 text (S4-14, case 7).
let input = null;
try {
  const read = await readInput();
  input = read.value;
  if (input === null) {
    const projectDir = resolveProjectDir(null);
    if (projectState(projectDir).state !== 'none') {
      const [rule, refusal] = read.text.includes(BUS_SCRIPT) ? ['R34', R34.noRead] : ['R32', R32.input];
      appendViolation(projectDir, { rule, level: 'law', source: 'pre-tool-use', action: refusal.action });
      deny(refusal.reason);
    }
  } else {
    await main(input);
  }
} catch (err) {
  process.stderr.write(`guilda: ${String((err && err.message) || 'hook failed').split('\n')[0]}\n`);
  // A law fails closed (X9): a check that throws refuses the call.
  try {
    const projectDir = resolveProjectDir(input);
    if (projectState(projectDir).state !== 'none') {
      appendViolation(projectDir, { rule: 'R32', level: 'law', source: 'pre-tool-use', action: R32.error.action });
      deny(R32.error.reason);
    }
  } catch {
    deny(R32.error.reason);
  }
}
process.exitCode = 0;
