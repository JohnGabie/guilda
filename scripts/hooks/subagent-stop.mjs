import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation, ensureIgnored } from '../lib/violations.mjs';
import { parseVerdict } from '../lib/verdict.mjs';
import { validateVerdict, validateQaReport } from '../lib/formats.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

// Agents whose answer is checked. The hooks.json matcher is the first filter; this is the second.
// Reviewer and Security write a verdict. QA writes a report with no Violations line.
const VERDICT_AGENTS = new Set(['guilda:reviewer', 'guilda:security']);
const QA_AGENT = 'guilda:qa';

const MAX_RETRIES = 2;

/**
 * Count one send-back for this agent in .guilda/format-retries.json.
 * True when the agent may be sent back (fewer than MAX_RETRIES so far). False when the limit is
 * reached or the file cannot be read or written: the caller then allows the stop. Never deletes the file.
 */
function takeRetry(projectDir, input) {
  try {
    const key = input.agent_id || `${input.agent_type}:${input.session_id ?? ''}`;
    const dir = path.join(projectDir, '.guilda');
    const file = path.join(dir, 'format-retries.json');
    let counts = {};
    if (fs.existsSync(file)) {
      counts = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return false;
    }
    if ((counts[key] ?? 0) >= MAX_RETRIES) return false;
    fs.mkdirSync(dir, { recursive: true });
    ensureIgnored(dir);
    counts[key] = (counts[key] ?? 0) + 1;
    fs.writeFileSync(file, JSON.stringify(counts));
    return true;
  } catch {
    return false;
  }
}

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const agent = input.agent_type;
  const isVerdict = VERDICT_AGENTS.has(agent);
  if (!isVerdict && agent !== QA_AGENT) return 0;

  const text = input.last_assistant_message;
  if (typeof text !== 'string' || text.trim() === '') return 0;

  // A Security consultation answers a spec question. It has no diff, so it has no verdict and no violations.
  const consultation = /^\s*Mode: consultation\s*$/.test(text.split('\n', 1)[0]);
  if (agent === 'guilda:security' && consultation && !/^[ \t]*(Result|Violations):/m.test(text)) return 0;

  // Exit code 2 keeps the subagent running, and stderr goes back to it (Claude Code hooks docs).
  const errors = isVerdict
    ? validateVerdict(text, agent === 'guilda:reviewer' ? 'reviewer' : 'security')
    : validateQaReport(text);
  if (errors.length > 0) {
    if (input.stop_hook_active === true || !takeRetry(projectDir, input)) {
      process.stderr.write('guilda: format check skipped: retry limit reached\n');
      return 0;
    }
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
