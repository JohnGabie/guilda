import fs from 'node:fs';
import { projectState } from '../lib/project.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { validId, readState, writeSignal, queuePaths, DISPATCH_FILE } from '../lib/queue.mjs';

// The identity hook (X3, section 4b): PostToolUse with the matcher Agent. It binds a queued dispatch to the agent
// ID of the host by one signal file, .guilda/queue/signals/agents/<agentId>/dispatch.json. The writer folds that
// file into an `agent` event at `queue sync`. The hook never writes the journal or state.json. It is a record
// hook: each error gives exit 0 and no output (X9).

const ADDRESS_LINE = /^Address: (\S+)$/m;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The address of the `Address:` line of the prompt, or null when the line is missing or fails X4. */
function addressOf(prompt) {
  if (typeof prompt !== 'string') return null;
  const m = ADDRESS_LINE.exec(prompt);
  return m && validId('address', m[1]) ? m[1] : null;
}

/** { task, attempt } of the work run or check run with that address in the state, or null. */
function runOf(state, address) {
  if (!isObject(state) || !isObject(state.tasks)) return null;
  for (const [task, t] of Object.entries(state.tasks)) {
    if (!isObject(t)) continue;
    if (t.address === address) return { task, attempt: t.attempt ?? null };
    const check = Array.isArray(t.checks) ? t.checks.find((c) => isObject(c) && c.address === address) : null;
    if (check) return { task, attempt: check.attempt ?? null };
  }
  return null;
}

function isRealDir(p) {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** The run of the address, or task and attempt null when the state cannot be read or has no such run. */
function lookup(projectDir, address) {
  try {
    return runOf(readState(projectDir), address) ?? { task: null, attempt: null };
  } catch {
    return { task: null, attempt: null };
  }
}

function main(input) {
  try {
    const projectDir = resolveProjectDir(input);
    if (projectState(projectDir).state === 'none') return 0;
    if (!isRealDir(queuePaths(projectDir).dir)) return 0;
    const address = addressOf(isObject(input.tool_input) ? input.tool_input.prompt : null);
    if (address === null) return 0;
    const agentId = isObject(input.tool_response) ? input.tool_response.agentId : undefined;
    if (!validId('agent', agentId)) return 0;
    const { task, attempt } = lookup(projectDir, address);
    // writeSignal creates the file with the flag wx: an existing dispatch.json throws and is not changed.
    writeSignal(projectDir, { agentId }, DISPATCH_FILE, { address, task, attempt, at: new Date().toISOString() });
  } catch {
    // Fail open: a record hook writes nothing more and prints nothing.
  }
  return 0;
}

await runHookMain(main);
