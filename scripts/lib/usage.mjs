import { spawnSync } from 'node:child_process';

/** The time limit of one `cswap budget --json` call, in ms. */
export const USAGE_TIMEOUT_MS = 10000;

const defaultRun = (file, args, opts) => spawnSync(file, args, { ...opts, shell: false, encoding: 'utf8' });

/**
 * Read the cswap budget.
 * { state: 'off' } | { state: 'error', reason } | { state: 'ok', budget }. Never throws.
 * `run(file, args, opts) -> { status, stdout }` is the test seam; it may throw.
 */
export function readUsage(config, { run = defaultRun } = {}) {
  if (config?.usage?.source !== 'cswap') return { state: 'off' };
  try {
    const res = run('cswap', ['budget', '--json'], { timeout: USAGE_TIMEOUT_MS });
    if (res?.error) return { state: 'error', reason: `cswap failed: ${res.error.message}` };
    if (res?.signal) return { state: 'error', reason: `cswap stopped by ${res.signal}` };
    if (res?.status !== 0) return { state: 'error', reason: `cswap budget exited with status ${res?.status}` };
    const budget = JSON.parse(String(res.stdout).trim());
    if (budget === null || typeof budget !== 'object' || Array.isArray(budget)) {
      return { state: 'error', reason: 'cswap budget did not print a JSON object' };
    }
    return { state: 'ok', budget };
  } catch (err) {
    return { state: 'error', reason: `cswap budget unreadable: ${err?.message ?? err}` };
  }
}
