import fs from 'node:fs';
import path from 'node:path';
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { validateBrief, briefFileOf, isExecutorDispatch } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

/** True when `target` is `root` or a path below it. */
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** The real path, or null when it cannot be resolved. */
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Read the brief file of a `Brief file:` line. The path resolves from the project root.
 * Returns { text } or { refused: <reason> }. A reason names the path as written, a record never does.
 */
function readBriefFile(projectDir, written) {
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, written);
  const outside = { refused: `ARC6: brief file outside the project: ${written}` };
  if (!isInside(root, resolved)) return outside;
  const real = realPath(resolved);
  if (real !== null && !isInside(realPath(root) ?? root, real)) return outside;
  try {
    if (real === null || !fs.statSync(real).isFile()) throw new Error('not a file');
    return { text: fs.readFileSync(real, 'utf8') };
  } catch {
    return { refused: `ARC6: brief file not found: ${written}` };
  }
}

function deny(projectDir, action, reason) {
  appendViolation(projectDir, { rule: 'ARC6', level: 'law', source: 'pre-agent', action });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
  return 0;
}

// PreToolUse on the Agent tool: an Executor dispatch must carry a complete brief, inline or in a brief file
// (ARC6 of the Architect skill).
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state === 'none') return 0;

  const toolInput = input.tool_input ?? {};
  if (!isExecutorDispatch(toolInput)) return 0;

  // A live check on Claude Code 2.1.316 found the brief in tool_input.prompt. The docs do not state this field, so
  // fail open when it is absent.
  if (typeof toolInput.prompt !== 'string') {
    process.stderr.write('guilda: brief check skipped: tool_input.prompt not found\n');
    return 0;
  }

  let brief = toolInput.prompt;
  const written = briefFileOf(toolInput.prompt);
  if (written !== null) {
    const file = readBriefFile(projectDir, written);
    if (file.refused) return deny(projectDir, 'brief file refused', file.refused);
    brief = file.text;
  }

  const missing = validateBrief(brief);
  if (missing.length === 0) return 0;
  return deny(projectDir, 'incomplete brief', `ARC6: brief incomplete: ${missing.join(', ')}`);
});
