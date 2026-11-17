// R13 guidance: refuse a question to the user that holds a rule or decision ID with no plain words before it.
// A guidance check fails open (X9): any input that it cannot read is allowed.
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { bareIds } from '../lib/bare-ids.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

/** Every text of the questions: question, header, and the label and description of each option. */
function texts(toolInput) {
  const out = [];
  const questions = toolInput && Array.isArray(toolInput.questions) ? toolInput.questions : [];
  for (const q of questions) {
    if (!q || typeof q !== 'object') continue;
    out.push(q.question, q.header);
    for (const o of Array.isArray(q.options) ? q.options : []) {
      if (o && typeof o === 'object') out.push(o.label, o.description);
    }
  }
  return out.filter((t) => typeof t === 'string');
}

await runHookMain(async (input) => {
  if (!input || input.tool_name !== 'AskUserQuestion') return 0;
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state === 'none') return 0;
  const ids = [];
  for (const t of texts(input.tool_input)) {
    for (const id of bareIds(t)) if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return 0;
  appendViolation(projectDir, { rule: 'R13', level: 'guidance', source: 'pre-question', action: 'deny' });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `R13: say <ID> in plain words first, then the ID in parentheses: ${ids.join(', ')}`,
      },
    }) + '\n',
  );
  return 0;
});
