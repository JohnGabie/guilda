// The trace hook of a subagent (section 4c, X6). PreToolUse writes the heartbeat signal of the agent; PostToolUse
// writes one `tool` line in .guilda/audit.jsonl. It runs only inside a subagent (an input with `agent_id`). A record
// hook fails open (X9): each error gives exit 0 and writes nothing. No command text, file content, tool output or
// prompt enters the log (D13, R19).
import fs from 'node:fs';
import path from 'node:path';
import { writeSignal, validId, DEFAULT_TOOL_TIMEOUT_MS, DISPATCH_FILE } from '../lib/queue.mjs';
import { ensureIgnored } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

/** A longer string value of an audit line is cut at this length (SC-G13). */
const MAX_VALUE = 200;
/** An audit line must stay under this size, so one append is one whole line. */
const MAX_LINE_BYTES = 4096;
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const ENV_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PLAIN_WORD = /^[A-Za-z0-9._+/@:-]+$/;
const OPERATORS = new Set(['&&', '||', ';', '|', '&']);
/** The short options of `timeout` that take a separate value (coreutils: -s SIGNAL, -k DURATION). */
const TIMEOUT_ARG_OPTIONS = new Set(['-s', '-k']);

const isRealDir = (p) => {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

const cut = (v) => (typeof v === 'string' && v.length > MAX_VALUE ? v.slice(0, MAX_VALUE) : v);

/** Split a shell command into words and operators. Quotes join words; their content is never a program word. */
function shellWords(command) {
  const words = [];
  let cur = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (/\s/.test(c)) {
      if (cur !== null) words.push(cur);
      cur = null;
    } else if (c === "'" || c === '"') {
      const close = command.indexOf(c, i + 1);
      const j = close < 0 ? command.length : close;
      cur = (cur ?? '') + c + command.slice(i + 1, j) + c;
      i = j;
    } else if (c === '\\') {
      cur = (cur ?? '') + command.slice(i, i + 2);
      i++;
    } else if ('&|;'.includes(c)) {
      if (cur !== null) words.push(cur);
      cur = null;
      const two = command.slice(i, i + 2);
      const op = two === '&&' || two === '||' ? two : c;
      words.push(op);
      i += op.length - 1;
    } else {
      cur = (cur ?? '') + c;
    }
  }
  if (cur !== null) words.push(cur);
  return words;
}

/**
 * The first program word of a Bash command (section 4c). It skips each leading NAME=value word, `cd <dir> &&` and
 * `timeout <n>` (with its options). A word with a quote, an escape or a shell expansion gives null.
 */
function programWord(command) {
  if (typeof command !== 'string') return null;
  const w = shellWords(command);
  let i = 0;
  for (;;) {
    if (i < w.length && ENV_WORD.test(w[i])) {
      i++;
    } else if (w[i] === 'cd' && w[i + 2] === '&&') {
      i += 3;
    } else if (w[i] === 'timeout') {
      i++;
      while (i < w.length && w[i].startsWith('-')) i += TIMEOUT_ARG_OPTIONS.has(w[i]) ? 2 : 1;
      i++;
    } else {
      break;
    }
  }
  const word = w[i];
  return typeof word === 'string' && !OPERATORS.has(word) && PLAIN_WORD.test(word) ? word : null;
}

/** The file path relative to the project, with `/`, or 'outside'. */
function relativeTarget(projectDir, file) {
  if (typeof file !== 'string' || file === '') return null;
  const roots = [path.resolve(projectDir)];
  try {
    roots.push(fs.realpathSync(projectDir));
  } catch {
    // The real path is only a second chance.
  }
  for (const root of roots) {
    const rel = path.relative(root, path.resolve(root, file));
    if (rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  }
  return 'outside';
}

function targetOf(projectDir, tool, toolInput) {
  const ti = toolInput && typeof toolInput === 'object' ? toolInput : {};
  if (FILE_TOOLS.has(tool)) return relativeTarget(projectDir, tool === 'NotebookEdit' ? ti.notebook_path : ti.file_path);
  if (tool === 'Bash') return programWord(ti.command);
  return null;
}

/** The task of the agent from its dispatch.json, or null. */
function taskOf(projectDir, agentId) {
  try {
    const file = path.join(projectDir, '.guilda', 'queue', 'signals', 'agents', agentId, DISPATCH_FILE);
    if (!fs.lstatSync(file).isFile()) return null;
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validId('task', d && d.task) ? d.task : null;
  } catch {
    return null;
  }
}

/** Append one audit line, or nothing. The file must be a plain file with one link, or not exist yet. */
function appendAudit(guildaDir, record) {
  const clean = Object.fromEntries(Object.entries(record).map(([k, v]) => [k, cut(v)]));
  const line = `${JSON.stringify(clean)}\n`;
  if (Buffer.byteLength(line) >= MAX_LINE_BYTES) return;
  const file = path.join(guildaDir, 'audit.jsonl');
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.nlink !== 1) return;
  } catch (err) {
    if (err.code !== 'ENOENT') return;
  }
  try {
    ensureIgnored(guildaDir);
    fs.appendFileSync(file, line);
  } catch {
    // Fail open (X9): a record hook never stops the tool call.
  }
}

await runHookMain(async (input) => {
  const agentId = input.agent_id;
  if (!validId('agent', agentId)) return 0;
  const projectDir = resolveProjectDir(input);
  const guildaDir = path.join(projectDir, '.guilda');
  if (!isRealDir(guildaDir)) return 0;
  const at = new Date();
  if (input.hook_event_name === 'PreToolUse') {
    if (!isRealDir(path.join(guildaDir, 'queue'))) return 0;
    const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
    const own = input.tool_name === 'Bash' && Number.isFinite(ti.timeout) && ti.timeout > 0 ? ti.timeout : null;
    const busyUntil = new Date(at.getTime() + (own ?? DEFAULT_TOOL_TIMEOUT_MS));
    try {
      writeSignal(projectDir, { agentId }, 'heartbeat', { at: at.toISOString(), busyUntil: busyUntil.toISOString(), tokens: null });
    } catch {
      // Fail open (X9).
    }
    return 0;
  }
  if (input.hook_event_name !== 'PostToolUse') return 0;
  const tool = typeof input.tool_name === 'string' ? input.tool_name : null;
  appendAudit(guildaDir, {
    kind: 'tool',
    t: at.toISOString(),
    session: typeof input.session_id === 'string' ? input.session_id : null,
    agentId,
    agentType: typeof input.agent_type === 'string' ? input.agent_type : null,
    task: taskOf(projectDir, agentId),
    tool,
    target: targetOf(projectDir, tool, input.tool_input),
  });
  return 0;
});
