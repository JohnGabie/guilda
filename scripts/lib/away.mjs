// The away state (D48, 5i): the away file, the R39 read guard and the R40 wait guard.
// The file is `${XDG_STATE_HOME:-~/.local/state}/guilda/s/<project hash>.json`, outside the project. The folder name is
// neutral on purpose: the name `away` told agents what the file holds (lab L5-4).
// Stated limit (5i, as for R32): a path that a variable builds from the parent folder is not seen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { splitCommands, stripPrefix, isVariable } from './git-command.mjs';
import { projectHash } from './project.mjs';
import { liveClaim } from './queue-guard.mjs';

export const NEUTRAL = 'This waits. Go on with the rest.';
export const SCHEMA_VERSION = 1;
const FOLDER_PARTS = ['guilda', 's'];
const FOLDER_TEXT = FOLDER_PARTS.join('/');
const NAME_END = '[A-Za-z0-9_.-]';
const AWAY_SCRIPT = /(?:^|[^A-Za-z0-9_-])away\.mjs(?![A-Za-z0-9_.-])/;
const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const NAME_FIELDS = { Glob: ['pattern'], Grep: ['glob'] };
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const WALKERS = new Set(['find', 'rg', 'tar', 'tree', 'du', 'fd', 'zip', 'rsync', 'ls']);
const GLOB_CHAR = /[*?[{]/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const MAIN_BRANCHES = new Set(['main', 'master']);
const BRANCH_MOVERS = new Set(['merge', 'rebase', 'cherry-pick']);
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);
const MAX_DEPTH = 8;
const GIT_TIMEOUT_MS = 5000;

const stateRoot = () => process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');

/** The folder of the away files. */
export const awayFolder = () => path.join(stateRoot(), ...FOLDER_PARTS);

/** The away file of a project, or null when the project hash cannot be found. */
export function awayPath(projectDir) {
  const hash = projectHash(projectDir);
  if (typeof hash !== 'string' || !/^[0-9a-f]{16}$/.test(hash)) return null;
  return path.join(awayFolder(), `${hash}.json`);
}

/**
 * Read the away state. For the Architect side only: the hook refuses each other caller (R39).
 * Returns { away: false } when the file does not exist. Fails closed (X9): a file that cannot be read or parsed, or
 * a project with no hash, gives { away: true, since: null, until: null, error: true }.
 */
export function readAway(projectDir) {
  const failed = { away: true, since: null, until: null, error: true };
  const file = awayPath(projectDir);
  if (file === null) return failed;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return e && e.code === 'ENOENT' ? { away: false } : failed;
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || data.schemaVersion !== SCHEMA_VERSION || typeof data.since !== 'string') return failed;
    return { away: true, since: data.since, until: typeof data.until === 'string' ? data.until : null };
  } catch {
    return failed;
  }
}

/** Write the away file by a temp file and a rename. Returns the state written. */
export function setAway(projectDir, now = new Date()) {
  const file = awayPath(projectDir);
  if (file === null) throw new Error('away: no project hash');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const state = { schemaVersion: SCHEMA_VERSION, since: now.toISOString(), until: null };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return state;
}

/** Clear the state: fs.unlinkSync on the one away file of the project. A missing file is a clear state. */
export function clearAway(projectDir) {
  const file = awayPath(projectDir);
  if (file === null) return false;
  try {
    fs.unlinkSync(file);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
  }
  return true;
}

// ---- paths ----

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
const formsOf = (abs) => [...new Set([path.resolve(abs), realish(path.resolve(abs))])];
const inside = (abs, dir) => {
  const rel = path.relative(dir, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const inAway = (abs, f) => formsOf(abs).some((a) => formsOf(f).some((d) => inside(a, d)));
const reachesAway = (abs, f) => inAway(abs, f) || formsOf(abs).some((a) => formsOf(f).some((d) => inside(d, a)));

/** A word with ~, $HOME, ${HOME}, $XDG_STATE_HOME put in, as the shell does. */
function expand(word) {
  const home = os.homedir();
  const xdg = stateRoot();
  let w = word
    .replace(/\$\{HOME\}|\$HOME(?![A-Za-z0-9_])/g, home)
    .replace(/\$\{XDG_STATE_HOME\}|\$XDG_STATE_HOME(?![A-Za-z0-9_])/g, xdg);
  if (w === '~' || w.startsWith('~/')) w = path.join(home, w.slice(1));
  return w;
}
/** The part of a word before its first glob character, cut at the last / before it ('' when there is no /). */
function globBase(word) {
  const at = word.search(GLOB_CHAR);
  if (at < 0) return null;
  const cut = word.lastIndexOf('/', at);
  return cut < 0 ? '' : word.slice(0, cut + 1);
}

/** A regular expression for the base name of a word with glob characters (*, ?, [..], {a,b}). */
function globRegex(name) {
  let out = '';
  for (let i = 0; i < name.length; i += 1) {
    const ch = name[i];
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else if (ch === '[') {
      const end = name.indexOf(']', i + 1);
      if (end < 0) out += '\\[';
      else {
        out += `[${name.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else if (ch === '{') {
      const end = name.indexOf('}', i + 1);
      if (end < 0) out += '\\{';
      else {
        out += `(?:${name.slice(i + 1, end).split(',').map((a) => globRegex(a)).join('|')})`;
        i = end;
      }
    } else out += ch.replace(/[.+^$()|\\\]}]/g, '\\$&');
  }
  return out;
}

/** True when a word with glob characters in its base name could match the away script (a .mjs path under scripts/). */
function globMayBeAwayScript(word) {
  const name = path.basename(word);
  if (!GLOB_CHAR.test(name)) return false;
  try {
    return new RegExp(`^(?:${globRegex(name)})$`).test('away.mjs');
  } catch {
    return true;
  }
}

const resolveWord = (cwd, w) => {
  const e = expand(w);
  return isVariable(e) ? null : path.resolve(cwd, e);
};

/** True when `text` holds `needle` and the next character does not continue a name. */
function holdsName(text, needle) {
  const re = new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${NAME_END})`);
  return re.test(text);
}

/** True when a text names the away folder: its name or one of its path forms, in any quoting. */
function textNamesAway(text, f) {
  const t = text.replace(/['"\\]/g, '').replace(/\/{2,}/g, '/');
  if (holdsName(t, FOLDER_TEXT)) return true;
  const ex = t.split(/(\s+|[;&|()<>=`])/).map(expand).join('');
  return formsOf(f).some((d) => holdsName(t, d) || holdsName(ex, d));
}

function commandReachesAway(command, cwd0, f, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  let cwd = cwd0;
  for (const words of splitCommands(command)) {
    const names = words.map((w) => path.basename(w));
    const sh = names.findIndex((n) => SHELLS.has(n));
    if (names[0] === 'eval' && commandReachesAway(words.slice(1).join(' '), cwd, f, depth + 1)) return true;
    if (sh >= 0) {
      const c = words.findIndex((w, i) => i > sh && /^-[a-z]*c$/.test(w));
      if (c > 0 && words[c + 1] !== undefined && commandReachesAway(words[c + 1], cwd, f, depth + 1)) return true;
    }
    for (const w of words) {
      for (const cand of [w, w.replace(/^[A-Za-z_][A-Za-z0-9_]*=/, ''), w.replace(/^-[^=]*=/, '')]) {
        const abs = resolveWord(cwd, cand);
        if (abs !== null && inAway(abs, f)) return true;
        // a word with a glob: the folder before the first glob character, and the script name
        const e = expand(cand);
        const gb = globBase(e);
        if (gb !== null) {
          const gabs = path.resolve(cwd, gb === '' ? '.' : gb);
          if (!isVariable(gb) && reachesAway(gabs, f)) return true;
          if (globMayBeAwayScript(e)) return true;
        }
      }
    }
    for (let i = 0; i < names.length; i += 1) {
      if (!WALKERS.has(names[i])) continue;
      // A plain ls reaches only the folder it names (the word checks above); only ls -R walks down.
      if (names[i] === 'ls' && !words.slice(i + 1).some((a) => a === '--recursive' || /^-[A-Za-z]*R/.test(a))) continue;
      const ops = words.slice(i + 1).filter((a) => !a.startsWith('-'));
      if ((ops.length ? ops : ['.']).some((a) => {
        const abs = resolveWord(cwd, a.replace(GLOB_CHAR, '\u0000').split('\u0000')[0] || '.');
        return abs !== null && reachesAway(abs, f);
      })) return true;
    }
    if ((names[0] === 'cd' || names[0] === 'pushd') && words.length > 1) {
      const abs = resolveWord(cwd, words[1]);
      if (abs !== null) cwd = abs;
    }
  }
  return false;
}

/** True when a tool call can read the away folder, or runs the away script. */
export function readsAway(toolName, toolInput, cwd) {
  const f = awayFolder();
  if (toolName === 'Bash') {
    const c = toolInput.command;
    if (typeof c !== 'string') return true;
    return c !== '' && (AWAY_SCRIPT.test(c.replace(/['"\\]/g, '')) || textNamesAway(c, f) || commandReachesAway(c, cwd, f));
  }
  if (!['Read', 'Grep', 'Glob'].includes(toolName)) return false;
  const fields = [...PATH_FIELDS, ...(NAME_FIELDS[toolName] ?? [])];
  const texts = fields.map((k) => toolInput[k]).filter((t) => typeof t === 'string' && t !== '');
  if (texts.some((t) => textNamesAway(t, f))) return true;
  const own = (k) => (typeof toolInput[k] === 'string' && toolInput[k] !== '' ? resolveWord(cwd, toolInput[k]) : null);
  if (PATH_FIELDS.some((k) => own(k) !== null && inAway(own(k), f))) return true;
  if (!SEARCH_TOOLS.has(toolName)) return false;
  let base = own('path') ?? cwd;
  if (toolName === 'Glob' && typeof toolInput.pattern === 'string') {
    const p = expand(toolInput.pattern);
    const at = p.search(GLOB_CHAR);
    const cut = at < 0 ? p.length : p.lastIndexOf('/', at);
    base = path.resolve(base, cut <= 0 ? (p.startsWith('/') ? '/' : '.') : p.slice(0, cut));
  }
  return reachesAway(base, f);
}

// ---- R40: actions that need the user ----

function currentBranch(cwd) {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The first publish or user action in a command, as a short name, or null. */
export function needsUserAction(command, cwd0, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  let cwd = cwd0;
  for (const raw of splitCommands(command)) {
    const names = raw.map((w) => path.basename(w));
    if (names[0] === 'eval') {
      const hit = needsUserAction(raw.slice(1).join(' '), cwd, depth + 1);
      if (hit) return hit;
    }
    const sh = names.findIndex((n) => SHELLS.has(n));
    if (sh >= 0) {
      const c = raw.findIndex((w, i) => i > sh && /^-[a-z]*c$/.test(w));
      if (c > 0 && raw[c + 1] !== undefined) {
        const hit = needsUserAction(raw[c + 1], cwd, depth + 1);
        if (hit) return hit;
      }
    }
    for (let i = 0; i < raw.length; i += 1) {
      if (names[i] === 'report-send.mjs') return 'report-send';
      if (names[i] === 'council.mjs' && raw.slice(i + 1).includes('open')) return 'council open';
    }
    const { rest } = stripPrefix(raw);
    const prog = rest[0] === undefined ? '' : path.basename(rest[0]).replace(/\.exe$/, '');
    if (prog === 'git') {
      let i = 1;
      let gitCwd = cwd;
      while (i < rest.length && rest[i].startsWith('-')) {
        const takes = GIT_VALUE_OPTIONS.has(rest[i]);
        if (rest[i] === '-C' && rest[i + 1] !== undefined && !isVariable(rest[i + 1])) gitCwd = path.resolve(gitCwd, expand(rest[i + 1]));
        i += takes ? 2 : 1;
      }
      const sub = rest[i];
      if (sub === 'push') return 'git push';
      if (BRANCH_MOVERS.has(sub)) {
        const branch = currentBranch(gitCwd);
        if (branch === null || MAIN_BRANCHES.has(branch)) return `git ${sub}`;
      }
    } else if (prog === 'gh') {
      const args = [];
      for (let i = 1; i < rest.length; i += 1) {
        if (rest[i] === '-R' || rest[i] === '--repo') i += 1;
        else if (!rest[i].startsWith('-')) args.push(rest[i]);
      }
      const pair = `${args[0]} ${args[1]}`;
      if (['pr create', 'release create', 'pr merge'].includes(pair)) return `gh ${pair}`;
    }
    if ((names[0] === 'cd' || names[0] === 'pushd') && raw.length > 1) {
      const abs = resolveWord(cwd, raw[1]);
      if (abs !== null) cwd = abs;
    }
  }
  return null;
}

// ---- who calls ----

/** The Architect side (5i, L4-1 NO-GO): no agent_id, and not the session of a live claim. */
export function architectSide(projectDir, input) {
  if (!input || typeof input !== 'object') return false;
  if (input.agent_id !== undefined && input.agent_id !== null) return false;
  const held = liveClaim(projectDir);
  if (held.error) return false;
  return !(held.claim && held.claim.session === input.session_id);
}

/**
 * The guard of the hook. Returns null to let the call go on, or { refusal, rule, ... }.
 * - R39: a read of the away folder, or a run of the away script, from a caller that is not the Architect side.
 *   Fails closed: an input that cannot be read is refused.
 * - R40: a publish, a council open or a merge to the main branch. A caller that is not the Architect side is refused
 *   in each state. The Architect side is refused while the user is away (or the state cannot be read).
 *   `reason` (for additionalContext) is set only on the Architect side;
 *   `action` names the refused action for the notice to the Architect.
 * The refusal text is neutral and has no rule ID (U5-13); `rule` is for the violation record.
 */
export function awayGuard(projectDir, input) {
  const refuse = (rule, extra = {}) => ({ refusal: NEUTRAL, rule, ...extra });
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.tool_name !== 'string') return refuse('R39');
  const tool = input.tool_name;
  if (!['Bash', 'Read', 'Grep', 'Glob'].includes(tool)) return null;
  const ti = input.tool_input;
  if (!ti || typeof ti !== 'object' || Array.isArray(ti)) return refuse('R39');
  if (tool === 'Bash' && typeof ti.command !== 'string') return refuse('R39');
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : projectDir;
  const architect = architectSide(projectDir, input);
  if (!architect && readsAway(tool, ti, cwd)) return refuse('R39');
  if (tool !== 'Bash') return null;
  const action = needsUserAction(ti.command, cwd);
  if (action === null) return null;
  // A caller that is not the Architect side is refused in each state, so the refusal is no sign of the absence.
  if (!architect) return refuse('R40', { action });
  if (!readAway(projectDir).away) return null;
  return refuse('R40', { action, reason: `R40: the user is away, and ${action} needs the user. Put the decision in held and go on.` });
}
