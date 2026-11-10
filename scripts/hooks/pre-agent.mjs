import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { validateBrief } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// PreToolUse on the Agent tool: an Executor dispatch must carry a complete brief (ARC6 of the Architect skill).
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state === 'none') return 0;

  const toolInput = input.tool_input ?? {};
  if (toolInput.subagent_type !== 'guilda:executor') return 0;

  // A live check on Claude Code 2.1.316 found the brief in tool_input.prompt. The docs do not state this field, so
  // fail open when it is absent.
  if (typeof toolInput.prompt !== 'string') {
    process.stderr.write('guilda: brief check skipped: tool_input.prompt not found\n');
    return 0;
  }

  const missing = validateBrief(toolInput.prompt);
  if (missing.length === 0) return 0;

  appendViolation(projectDir, { rule: 'ARC6', level: 'law', source: 'pre-agent', action: 'incomplete brief' });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `ARC6: brief incomplete: ${missing.join(', ')}`,
      },
    }) + '\n',
  );
  return 0;
});
