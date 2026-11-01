import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { parseVerdict } from '../lib/verdict.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// Agents whose verdict is read. The hooks.json matcher is the first filter; this is the second.
const VERDICT_AGENTS = new Set(['guilda:reviewer', 'guilda:security']);

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const agent = input.agent_type;
  if (!VERDICT_AGENTS.has(agent)) return 0;

  const { violations } = parseVerdict(input.last_assistant_message);
  for (const rule of violations) {
    appendViolation(projectDir, { rule, level: 'gate', source: agent, action: 'verdict' });
  }
  return 0;
});
