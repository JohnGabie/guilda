// R37: the limits of the Security Executor (spec 0.5.0, sections 3 and 5g). The PreToolUse hook calls
// redteamGuard() for each tool call. It refuses an outside action of agent_type guilda:security-executor and
// returns null for each other caller. It reads the text of a command, so it catches the common forms and not each
// form (R4 has the same limit). SX1 asks the agent to stop first. Any error refuses the call (X9).
// A reason is a fixed text that starts with `R37: ` and never holds the command, so a record holds no command text.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyFolder } from './records.mjs';

export const SECURITY_EXECUTOR = 'guilda:security-executor';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const NET_CLIENTS = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'nmap', 'ssh', 'scp', 'sftp', 'ftp', 'telnet', 'rsync']);
const ROOT_TOOLS = new Set(['sudo', 'pkexec', 'doas', 'su', 'run0']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval']);
const INTERPRETERS = /^(node|nodejs|deno|bun|python|python3|ruby|perl|php)$/;
const WRAPPERS = new Set(['xargs', 'exec', 'command', 'time', 'nohup', 'nice', 'stdbuf', 'builtin', 'then', 'do', 'else', '{', '!']);
const PERSIST_TOOLS = new Set(['crontab', 'systemctl', 'systemd-run', 'at', 'launchctl']);
const PROFILE_FILES = new Set(['.bashrc', '.zshrc', '.profile', '.bash_profile', '.zprofile', '.bash_login']);
// Verbs that install or publish, by package manager. `*` means each use, so a bare `yarn` counts too.
const PKG_VERBS = {
  npm: ['install', 'i', 'add', 'ci', 'publish', 'update', 'link'],
  pnpm: ['install', 'i', 'add', 'publish', 'update', 'dlx'],
  yarn: ['*'],
  bun: ['install', 'i', 'add', 'x'],
  pip: ['install', 'download'],
  pip3: ['install', 'download'],
  gem: ['install'],
  cargo: ['install', 'add', 'publish', 'fetch'],
  go: ['get', 'install'],
  composer: ['install', 'require', 'update'],
  uv: ['pip', 'add', 'sync', 'tool'],
  dnf: ['install', 'upgrade', 'reinstall'],
  yum: ['install', 'upgrade', 'reinstall'],
  apt: ['install', 'upgrade'],
  'apt-get': ['install', 'upgrade'],
  brew: ['install', 'upgrade', 'reinstall'],
  flatpak: ['install'],
  snap: ['install'],
  pacman: ['-S', '-Sy', '-Syu'],
  zypper: ['install', 'in'],
  apk: ['add'],
};
const PKG_RUNNERS = new Set(['npx', 'pnpx', 'bunx']);
const SECRET_VAR = /\$\{?[A-Za-z0-9_]*(SECRET|TOKEN|KEY|PASSWORD|PASSWD|PASS|CREDENTIAL|AUTH)[A-Za-z0-9_]*\}?/;
const PROC_ENVIRON = /\/proc\/[^\s/]+\/environ/;
const LEXICAL_CRED = /(^|[\s"'=:/~])(\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.config\/gcloud|\.config\/gh|\.claude\/\.credentials[\w.]*|guilda\/keys)(\/|\s|$|["'])/;
const MAX_DEPTH = 3;

class Refusal extends Error {}
const refuse = (why) => {
  throw new Refusal(why);
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

/** The real path of p, or the real path of its nearest existing parent plus the rest. */
function realish(p) {
  let cur = p;
  const rest = [];
  while (!fs.existsSync(cur)) {
    rest.unshift(path.basename(cur));
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return path.join(fs.realpathSync(cur), ...rest);
}

/** The context of one check: the project and worktree roots, the home folder and the credential locations. */
function makeContext(projectDir, input, env) {
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : path.resolve(projectDir);
  const home = typeof env.HOME === 'string' && path.isAbsolute(env.HOME) ? env.HOME : null;
  const roots = [];
  for (const candidate of [path.resolve(projectDir), gitTop(cwd)]) {
    if (candidate === null) continue;
    try {
      const real = fs.realpathSync(candidate);
      if (!roots.includes(real)) roots.push(real);
    } catch {
      // A root that does not exist is not a root.
    }
  }
  if (roots.length === 0) refuse('no project or worktree root (X9)');
  const credDirs = [];
  if (home !== null) {
    for (const rel of ['.ssh', '.aws', '.gnupg', '.claude', '.codex', '.netrc', '.npmrc', '.config/gcloud', '.config/gh']) {
      credDirs.push(path.join(home, rel));
    }
  }
  credDirs.push(keyFolder(env));
  return { cwd, home, roots, credDirs: credDirs.flatMap((d) => [d, safeReal(d)]).filter(Boolean) };
}

function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** Make a token an absolute path: `~`, `$HOME` and `${HOME}` become the home folder, the rest resolves from cwd. */
function resolveToken(token, ctx) {
  let t = token;
  if (ctx.home !== null) t = t.replace(/^~(?=\/|$)/, ctx.home).replace(/^\$\{?HOME\}?(?=\/|$)/, ctx.home);
  return path.resolve(ctx.cwd, t);
}

/** True when the path is under a folder named `fixtures` inside a root. */
function inFixtures(real, ctx) {
  const root = ctx.roots.find((r) => inside(real, r));
  if (!root) return false;
  return path.relative(root, real).split(path.sep).slice(0, -1).includes('fixtures');
}

/** Refuse a credential path (R37): a credential folder or file, a key folder or a `.env*` file outside fixtures. */
function checkCredentialPath(token, ctx) {
  if (token === '' || token.startsWith('-') && !token.includes('=')) return;
  const bare = token.includes('=') ? token.slice(token.indexOf('=') + 1) : token;
  for (const candidate of new Set([token, bare])) {
    if (candidate === '') continue;
    const abs = resolveToken(candidate, ctx);
    let real;
    try {
      real = realish(abs);
    } catch {
      real = abs;
    }
    for (const dir of ctx.credDirs) {
      if (inside(abs, dir) || inside(real, dir)) refuse('read of a credential path');
    }
    if (path.basename(abs).startsWith('.env') || path.basename(real).startsWith('.env')) {
      if (!inFixtures(real, ctx)) refuse('read of a .env file outside fixtures');
    }
  }
  if (LEXICAL_CRED.test(` ${token} `)) refuse('read of a credential path');
}

/** Refuse a write target outside the project and the worktree, or a shell profile. */
function checkWriteTarget(token, ctx) {
  if (token === '' || token === '/dev/null' || token.startsWith('/dev/std') || token.startsWith('&')) return;
  if (/[$`]/.test(token) && !/^\$\{?HOME\}?\//.test(token)) refuse('write to a target that the guard cannot resolve');
  const abs = resolveToken(token, ctx);
  if (PROFILE_FILES.has(path.basename(abs))) refuse('write to a shell profile');
  const real = realish(abs);
  if (!ctx.roots.some((r) => inside(real, r))) refuse('write outside the project and the worktree');
}

/** True when the token is a host that the guard allows. */
function localHost(host) {
  return LOCAL_HOSTS.has(host.toLowerCase());
}

/** Hosts that a network client names, or [] when the guard reads none. */
function clientHosts(args) {
  const hosts = [];
  const bare = [];
  for (const raw of args) {
    if (raw.startsWith('-')) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      try {
        hosts.push(new URL(raw).hostname);
      } catch {
        hosts.push('unreadable.invalid');
      }
      continue;
    }
    const noUser = raw.includes('@') ? raw.slice(raw.lastIndexOf('@') + 1) : raw;
    if (raw.includes('@')) hosts.push(noUser.replace(/[:/].*$/, ''));
    const host = noUser.replace(/^\[([^\]]+)\].*$/, '[$1]').replace(/(?<!^)[:/].*$/, '');
    if (/^(\[[0-9a-f:]+\]|localhost|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})$/i.test(host)) bare.push(host);
  }
  return hosts.length > 0 ? hosts : bare;
}

function checkNetworkClient(args) {
  const hosts = clientHosts(args);
  if (hosts.length === 0) refuse('network client with no target that the guard can read');
  if (hosts.some((h) => !localHost(h))) refuse('network target outside localhost');
}

/** The first argument that is not a flag. */
const verbOf = (args) => args.find((a) => !a.startsWith('-')) ?? null;

function checkPackages(cmd, args) {
  if (PKG_RUNNERS.has(cmd)) refuse('package install or run');
  const verbs = PKG_VERBS[cmd];
  if (!verbs) return;
  const verb = cmd === 'pacman' ? args.find((a) => /^-S/.test(a)) ?? null : verbOf(args);
  if (verbs.includes('*') || (verb !== null && verbs.includes(verb))) refuse('package install or publish');
}

/** Split a command into segments at ; & | newline and the start of a substitution. */
function segments(text) {
  return text
    .replace(/\$\(|`/g, ';')
    .split(/&&|\|\||[;&|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const tokensOf = (segment) =>
  segment
    .split(/[\s"']+/)
    .map((t) => t.replace(/^[({]+(?=.)/, ''))
    .filter(Boolean);

/** The command of a segment and its arguments, after env assignments and wrappers. */
function commandOf(tokens) {
  let i = 0;
  for (;;) {
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
    if (i >= tokens.length) return null;
    const name = path.basename(tokens[i]);
    if (name === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i + 1] ?? '')) {
      i += 1;
      continue;
    }
    if (name === 'timeout') {
      i += 1;
      while (i < tokens.length && tokens[i].startsWith('-')) i += 1;
      i += 1;
      continue;
    }
    if (WRAPPERS.has(name)) {
      i += 1;
      while (i < tokens.length && tokens[i].startsWith('-')) i += 1;
      continue;
    }
    const args = tokens.slice(i + 1);
    // `python -m pip install x` is the command `pip`.
    if (/^python[\d.]*$/.test(name) && args[0] === '-m' && args[1]) return { cmd: path.basename(args[1]), args: args.slice(2) };
    return { cmd: name, args };
  }
}

function checkInlineCode(args) {
  const text = args.join(' ');
  if (/process\.env|os\.environ|ENV\[|getenv\(/.test(text)) refuse('environment secrets');
  for (const m of text.matchAll(/[a-z][a-z0-9+.-]*:\/\/[^\s)'"`]+/gi)) {
    let host;
    try {
      host = new URL(m[0]).hostname;
    } catch {
      host = 'unreadable.invalid';
    }
    if (!localHost(host)) refuse('network target outside localhost');
  }
}

function checkSegment(tokens, ctx, depth) {
  const parsed = commandOf(tokens);
  if (parsed === null) return;
  const { cmd, args } = parsed;

  if (ROOT_TOOLS.has(cmd)) refuse('sudo, pkexec, doas, su or run0');
  if (PERSIST_TOOLS.has(cmd)) refuse('crontab, systemctl, systemd-run or at');
  checkPackages(cmd, args);
  if (NET_CLIENTS.has(cmd)) checkNetworkClient(args);
  if (cmd === 'gh') refuse('network client gh');
  if (cmd === 'git' && args.some((a) => ['push', 'fetch', 'pull', 'clone', 'ls-remote'].includes(a))) refuse('git network command');
  if (cmd === 'trufflehog' && !args.includes('--no-verification')) refuse('live verification of a secret');
  if (cmd === 'osv-scanner' && args.includes('fix')) refuse('osv-scanner fix can run package scripts');

  if (cmd === 'printenv') refuse('environment secrets');
  if (cmd === 'env') refuse('environment secrets');
  if (cmd === 'set' && args.length === 0) refuse('environment secrets');
  if (['export', 'declare', 'typeset', 'readonly'].includes(cmd) && (args.length === 0 || args.includes('-p'))) {
    refuse('environment secrets');
  }
  if (cmd === 'compgen' && args.includes('-e')) refuse('environment secrets');
  if (INTERPRETERS.test(cmd) && args.some((a) => ['-e', '-c', '-p', '--eval', '-r'].includes(a))) checkInlineCode(args);

  // Writes by command.
  if (['tee', 'touch', 'mkdir', 'truncate'].includes(cmd)) {
    for (const a of args.filter((x) => !x.startsWith('-'))) checkWriteTarget(a, ctx);
  }
  if (['cp', 'mv', 'ln', 'install'].includes(cmd)) {
    const operands = args.filter((x) => !x.startsWith('-'));
    if (operands.length > 0) checkWriteTarget(operands[operands.length - 1], ctx);
    const t = args.findIndex((x) => x === '-t' || x === '--target-directory');
    if (t >= 0 && args[t + 1]) checkWriteTarget(args[t + 1], ctx);
  }
  if (['sed', 'perl', 'ruby'].includes(cmd) && args.some((a) => /^-[a-zA-Z]*i/.test(a))) {
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      if (a.includes('/') || a.startsWith('~') || a.startsWith('.')) checkWriteTarget(a, ctx);
    }
  }
  if (cmd === 'dd') {
    for (const a of args.filter((x) => x.startsWith('of='))) checkWriteTarget(a.slice(3), ctx);
  }
  if (cmd === 'tar') {
    const c = args.findIndex((x) => x === '-C' || x === '--directory');
    if (c >= 0 && args[c + 1]) checkWriteTarget(args[c + 1], ctx);
  }

  // A shell that runs a string: check the string as a command (the quotes split it into tokens).
  if (SHELLS.has(cmd) && depth < MAX_DEPTH) {
    const i = cmd === 'eval' ? 0 : args.findIndex((a) => /^-[a-z]*c$/.test(a)) + 1;
    if (cmd === 'eval' || i > 0) checkText(args.slice(i).join(' '), ctx, depth + 1);
  }
}

function checkText(text, ctx, depth) {
  if (/\/dev\/(tcp|udp)\//.test(text)) refuse('network through /dev/tcp');
  if (PROC_ENVIRON.test(text)) refuse('environment secrets');
  if (SECRET_VAR.test(text)) refuse('environment secrets');
  // Redirections.
  for (const m of text.matchAll(/(?:^|[^<>&\d])\d?&?>{1,2}\s*([^\s;&|<>]+)/g)) checkWriteTarget(m[1].replace(/^["']|["']$/g, ''), ctx);
  for (const segment of segments(text)) {
    const tokens = tokensOf(segment);
    for (const token of tokens) {
      checkCredentialPath(token, ctx);
      if (PROFILE_FILES.has(path.basename(token))) refuse('shell profile');
    }
    checkSegment(tokens, ctx, depth);
  }
}

function checkBash(input, ctx) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') refuse('Bash call with no command text (X9)');
  checkText(command, ctx, 0);
}

function checkReadTool(input, ctx) {
  const ti = input.tool_input ?? {};
  const fields = [ti.file_path, ti.path, ti.glob, input.tool_name === 'Glob' ? ti.pattern : undefined];
  for (const f of fields) if (typeof f === 'string') checkCredentialPath(f, ctx);
}

function checkWriteTool(input, ctx) {
  const ti = input.tool_input ?? {};
  const fp = typeof ti.file_path === 'string' ? ti.file_path : typeof ti.notebook_path === 'string' ? ti.notebook_path : '';
  if (fp === '') refuse('write with no path (X9)');
  checkWriteTarget(fp, ctx);
}

/**
 * The R37 check. Returns null to let the call pass, or { reason } to refuse it. Only the agent_type
 * guilda:security-executor is checked; each other caller gets null. Any error refuses (X9).
 */
export function redteamGuard(projectDir, input, env = process.env) {
  if (!input || typeof input !== 'object' || input.agent_type !== SECURITY_EXECUTOR) return null;
  try {
    const tool = input.tool_name;
    if (tool === 'WebFetch' || tool === 'WebSearch' || (typeof tool === 'string' && tool.startsWith('mcp__'))) {
      refuse('web or MCP tool');
    }
    const ctx = makeContext(projectDir, input, env);
    if (tool === 'Bash') checkBash(input, ctx);
    else if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') checkReadTool(input, ctx);
    else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) checkWriteTool(input, ctx);
    return null;
  } catch (err) {
    if (err instanceof Refusal) return { reason: `R37: ${err.message}` };
    return { reason: 'R37: the guard could not check the call (X9)' };
  }
}
