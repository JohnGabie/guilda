// Stop (supervisor 0.5.0, spec 7b): when the supervisor session ends a turn while a step waits, block the end so the
// session does the step. It acts only for the main session of the live claim. It writes nothing and fails open:
// the hook is a pace aid, not a law.
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { readClaim, validId } from '../lib/queue.mjs';
import { nextStep, readFacts } from '../lib/tick.mjs';

// Only these step words give a block. The reason text holds the step word and a checked task ID, never free text.
const BLOCK_STEPS = Object.freeze(['save-request', 'stop', 'needs-user', 'retry', 'dispatch-check', 'read-bus', 'set-slots', 'dispatch']);
// The hook must finish fast, so it never runs cswap: a run seam that fails gives the pace of state 'off'.
const NO_USAGE = () => ({ status: 1, stdout: '' });

await runHookMain((input) => {
  try {
    if (input.agent_id || typeof input.session_id !== 'string') return 0;
    if (input.stop_hook_active === true) return 0;
    const projectDir = resolveProjectDir(input);
    const claim = readClaim(projectDir);
    if (!claim || !claim.live || claim.session !== input.session_id) return 0;
    const step = nextStep(readFacts(projectDir, { session: input.session_id, run: NO_USAGE, git: false }));
    if (!BLOCK_STEPS.includes(step.step)) return 0;
    if (step.task !== undefined && !validId('task', step.task)) return 0;
    // The hook reads no git data, so 'worktree missing' only means that the data is absent: do not block on it.
    if (step.step === 'needs-user' && step.reason === 'worktree missing') return 0;
    const task = step.task ? ` ${step.task}` : '';
    const reason = `guilda supervisor: the next step is ${step.step}${task}. Run tick.mjs --json and do it.`;
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
  } catch {
    // fail open
  }
  return 0;
});
