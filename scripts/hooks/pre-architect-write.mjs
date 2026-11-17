import fs from 'node:fs';
import path from 'node:path';
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// AEX: the Architect executor has no Bash, and writes only Markdown files inside the project (LLM06: the check is in
// code, not in the model). It fails closed: a missing or odd input is refused.
// The agent type with or without the plugin prefix.
const AGENTS = Object.freeze(['guilda:architect-executor', 'architect-executor']);
const REASON =
  'AEX: guilda:architect-executor writes only Markdown files inside the project, not under .git, .guilda or .claude, and not CLAUDE.md or CLAUDE.local.md.';
const CHECKED_TOOLS = Object.freeze(['Write', 'Edit']);
const CLOSED_FOLDERS = Object.freeze(['.git', '.guilda', '.claude']);
// Instructions loaded into the main session (LLM06), at any level.
const CLOSED_FILES = Object.freeze(['claude.md', 'claude.local.md']);

/** The parts of `target` below `root`, or null when `target` is not below it. */
function partsBelow(root, target) {
  const rel = path.relative(root, target);
  if (rel === '' || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts[0] === '..') return null;
  return parts;
}

/** True when no folder is .git, .guilda or .claude and the file is not CLAUDE.md or CLAUDE.local.md, in any case. */
function noClosedPart(parts) {
  if (CLOSED_FILES.includes(parts.at(-1).toLowerCase())) return false;
  return !parts.some((p) => CLOSED_FOLDERS.includes(p.toLowerCase()));
}

/** The real path of the nearest folder of `file` that exists, joined with the rest of the path. */
function realTarget(file) {
  let dir = path.dirname(file);
  const rest = [path.basename(file)];
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...rest);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    // A folder that is a dangling symbolic link: its target is unknown, so the path is refused.
    let st = null;
    try {
      st = fs.lstatSync(dir);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (st !== null && st.isSymbolicLink()) throw new Error('dangling link');
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no folder');
    rest.unshift(path.basename(dir));
    dir = up;
  }
}

/** True when the Write or Edit of `filePath` may pass for the Architect executor. Throws on an I/O error. */
function allowedPath(projectDir, filePath) {
  if (typeof filePath !== 'string' || filePath === '' || filePath.includes('\0')) return false;
  if (!filePath.endsWith('.md')) return false;
  const root = path.resolve(projectDir);
  const rootReal = fs.realpathSync(root);
  const lexical = path.resolve(root, filePath);
  // The path as written: inside the project root, as given or as its real path, with no closed folder.
  const written = partsBelow(root, lexical) ?? partsBelow(rootReal, lexical);
  if (written === null || !noClosedPart(written)) return false;
  // The real path: each folder that exists resolves inside the real root (no link out, no link to a closed folder).
  const real = realTarget(lexical);
  const parts = partsBelow(rootReal, real);
  if (parts === null || !noClosedPart(parts)) return false;
  let st;
  try {
    st = fs.lstatSync(lexical);
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    throw err;
  }
  // An existing file is a plain file with one link: no symbolic link, no hard link to a file elsewhere.
  return st.isFile() && st.nlink === 1;
}

function deny(projectDir) {
  appendViolation(projectDir, { rule: 'AEX', level: 'law', source: 'pre-architect-write', action: 'write refused' });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON },
    }) + '\n',
  );
  return 0;
}

// PreToolUse on Write, Edit, MultiEdit and NotebookEdit. The hook input has agent_type only inside a subagent.
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state === 'none') return 0;
  const type = typeof input.agent_type === 'string' ? input.agent_type.trim().toLowerCase() : '';
  if (!AGENTS.includes(type)) return 0;
  let ok = false;
  try {
    const toolInput = input.tool_input;
    ok =
      CHECKED_TOOLS.includes(input.tool_name) &&
      toolInput !== null &&
      typeof toolInput === 'object' &&
      allowedPath(projectDir, toolInput.file_path);
  } catch {
    ok = false;
  }
  return ok ? 0 : deny(projectDir);
});
