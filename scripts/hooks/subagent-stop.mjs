import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { parseVerdict } from '../lib/verdict.mjs';
import { validateVerdict, validateQaReport } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// Agents whose answer is checked. The hooks.json matcher is the first filter; this is the second.
// Reviewer and Security write a verdict. QA writes a report with no Violations line.
const VERDICT_AGENTS = new Set(['guilda:reviewer', 'guilda:security']);
const QA_AGENT = 'guilda:qa';

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const agent = input.agent_type;
  const isVerdict = VERDICT_AGENTS.has(agent);
  if (!isVerdict && agent !== QA_AGENT) return 0;

  const text = input.last_assistant_message;
  if (typeof text !== 'string' || text.trim() === '') return 0;

  // Exit code 2 keeps the subagent running, and stderr goes back to it (Claude Code hooks docs).
  const errors = isVerdict
    ? validateVerdict(text, agent === 'guilda:reviewer' ? 'reviewer' : 'security')
    : validateQaReport(text);
  if (errors.length > 0) {
    process.stderr.write(`Fix the output format: ${errors.join('; ')}\n`);
    return 2;
  }

  if (isVerdict) {
    for (const rule of parseVerdict(text).violations) {
      appendViolation(projectDir, { rule, level: 'gate', source: agent, action: 'verdict' });
    }
  }
  return 0;
});
