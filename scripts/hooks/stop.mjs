// Stop (supervisor 0.5.0, spec 7b): when the supervisor session ends a turn while a step waits, block the end so the
// session does the step. It acts only for the main session of the live claim. It writes nothing and fails open:
// the hook is a pace aid, not a law.
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { readClaim } from '../lib/queue.mjs';
import { nextStep, readFacts } from '../lib/tick.mjs';

const PASSIVE_STEPS = Object.freeze(['watch', 'pause', 'finish']);
// The hook must finish fast, so it never runs cswap: a run seam that fails gives the pace of state 'off'.
const NO_USAGE = () => ({ status: 1, stdout: '' });

await runHookMain((input) => {
  try {
    if (input.agent_id || typeof input.session_id !== 'string') return 0;
    if (input.stop_hook_active === true) return 0;
    const projectDir = resolveProjectDir(input);
    const claim = readClaim(projectDir);
    if (!claim || !claim.live || claim.session !== input.session_id) return 0;
    const step = nextStep(readFacts(projectDir, { session: input.session_id, run: NO_USAGE }));
    if (PASSIVE_STEPS.includes(step.step)) return 0;
    const task = step.task ? ` ${step.task}` : '';
    const reason = `guilda supervisor: the next step is ${step.step}${task}. Run tick.mjs --json and do it.`;
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
  } catch {
    // fail open
  }
  return 0;
});
