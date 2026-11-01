import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { validateBrief } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// PreToolUse on the Agent tool: an Executor dispatch must carry a complete brief (R3).
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const toolInput = input.tool_input ?? {};
  if (toolInput.subagent_type !== 'guilda:executor') return 0;

  // The docs do not state the prompt field name, so fail open when it is absent.
  if (typeof toolInput.prompt !== 'string') {
    process.stderr.write('guilda: brief check skipped: tool_input.prompt not found\n');
    return 0;
  }

  const missing = validateBrief(toolInput.prompt);
  if (missing.length === 0) return 0;

  appendViolation(projectDir, { rule: 'R3', level: 'law', source: 'pre-agent', action: 'incomplete brief' });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `R3: brief incomplete: ${missing.join(', ')}`,
      },
    }) + '\n',
  );
  return 0;
});
