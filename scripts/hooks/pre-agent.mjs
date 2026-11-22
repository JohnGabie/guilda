import fs from 'node:fs';
import path from 'node:path';
import { projectState, dispatchAgentTypes, SETUP_NOTICE } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { validateBrief, briefFileOf, isExecutorDispatch } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { verifyRecord } from '../lib/records.mjs';
import { SECURITY_EXECUTOR } from '../lib/redteam-guard.mjs';

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

// ARC4: the guilda agent of each job. The main session dispatches one of these, never an untyped agent.
const DISPATCH_TYPES =
  'guilda:architect-executor for an MD file, guilda:executor for code, guilda:reviewer for a review, ' +
  'guilda:lab-researcher for research';

// The built-in read-only types that the main session may dispatch (the user, 2026-11-17).
const BUILT_IN_TYPES = ['explore', 'plan'];

/**
 * The ARC4 refusal text for an Agent call of the main session, or null when the call passes. The hook input has
 * `agent_type` only inside a subagent, so a call with no `agent_type` comes from the main session. The main session
 * may dispatch guilda:*, Explore, Plan and the types of dispatch.agentTypes (`allowed`); it refuses each other type.
 * The text never echoes the type, because the model writes it.
 */
function untypedDispatch(input, toolInput, allowed) {
  if (typeof input.agent_type === 'string' && input.agent_type !== '') return null;
  const type = toolInput.subagent_type;
  // Fail closed: a blank or non-string type counts as untyped, and case or spaces do not hide a type.
  if (typeof type !== 'string' || type.trim() === '') {
    return `ARC4: the main session dispatches a guilda agent, not an untyped agent. Use ${DISPATCH_TYPES}.`;
  }
  const name = type.trim().toLowerCase();
  if (name === 'general-purpose') {
    return `ARC4: the main session dispatches a guilda agent, not general-purpose. Use ${DISPATCH_TYPES}.`;
  }
  if (name.startsWith('guilda:') || BUILT_IN_TYPES.includes(name) || allowed.includes(name)) return null;
  return (
    `ARC4: the main session dispatches a guilda agent, Explore, Plan or a type of dispatch.agentTypes in ` +
    `.guilda/config.json, not this agent type. Use ${DISPATCH_TYPES}.`
  );
}

/** The value of the last `Label:` line of a text, or null. */
function lastValue(text, label) {
  let value = null;
  const re = new RegExp(`^[ \\t]*${label}:[ \\t]*(.*?)[ \\t]*$`, 'i');
  for (const line of text.split('\n')) {
    const m = line.replace(/\r$/, '').match(re);
    if (m) value = m[1];
  }
  return value;
}

/**
 * R37: the refusal text for a dispatch of the Security Executor, or null when it passes. The brief needs a `Risk area:`
 * that is not none and an `Approval: <user record ID>` that the check of `bus.mjs verify` accepts (R35). It fails
 * closed (X9): no prompt, no brief file, no key or an error refuses. The text never holds the record text.
 */
function securityDispatch(projectDir, toolInput) {
  if (typeof toolInput.prompt !== 'string') return 'R37: the dispatch has no brief text (X9).';
  let brief = toolInput.prompt;
  const written = briefFileOf(brief);
  if (written !== null) {
    const file = readBriefFile(projectDir, written);
    if (file.refused) return 'R37: the brief file cannot be read (X9).';
    brief = file.text;
  }
  const area = lastValue(brief, 'Risk area');
  if (area === null || area === '' || /^none\b/i.test(area)) {
    return 'R37: the Security Executor needs a Risk area that is not none.';
  }
  const approval = lastValue(brief, 'Approval');
  if (approval === null || approval === '') return 'R37: the brief has no `Approval: <user record ID>` line.';
  try {
    if (verifyRecord(projectDir, approval, process.env).ok) return null;
  } catch {
    // An error counts as a record that does not verify (X9).
  }
  return 'R37: the user record of the Approval line does not verify.';
}

function deny(projectDir, rule, action, reason) {
  appendViolation(projectDir, { rule, level: 'law', source: 'pre-agent', action });
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
// (ARC6 of the Architect skill), and the main session dispatches a guilda agent (ARC4).
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const project = projectState(projectDir);
  if (project.state === 'none') {
    // R28: tell the user at each dispatch of a guilda agent. Never refuse, never record.
    const type = (input.tool_input ?? {}).subagent_type;
    if (typeof type === 'string' && type.startsWith('guilda:')) {
      process.stdout.write(JSON.stringify({ systemMessage: SETUP_NOTICE }) + '\n');
    }
    return 0;
  }

  const toolInput = input.tool_input ?? {};
  // ARC4 first: a Role: executor line does not let an untyped dispatch of the main session pass.
  const refused = untypedDispatch(input, toolInput, dispatchAgentTypes(project.config));
  if (refused !== null) {
    const action = refused.includes('not this agent type') ? 'agent type not allowed' : 'untyped dispatch';
    return deny(projectDir, 'ARC4', action, refused);
  }
  const type = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type.trim().toLowerCase() : '';
  if (type === SECURITY_EXECUTOR) {
    const text = securityDispatch(projectDir, toolInput);
    return text === null ? 0 : deny(projectDir, 'R37', 'security executor dispatch refused', text);
  }
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
    if (file.refused) return deny(projectDir, 'ARC6', 'brief file refused', file.refused);
    brief = file.text;
  }

  const missing = validateBrief(brief);
  if (missing.length === 0) return 0;
  return deny(projectDir, 'ARC6', 'incomplete brief', `ARC6: brief incomplete: ${missing.join(', ')}`);
});
