import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read stdin and parse it as JSON. Returns null when it is empty or not valid JSON. */
export async function readStdin() {
  let text = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) text += chunk;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The project directory: CLAUDE_PROJECT_DIR, else the hook input cwd, else the process cwd. */
export function resolveProjectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}

/** The plugin root: CLAUDE_PLUGIN_ROOT, else two levels above this file's directory. */
export function resolvePluginRoot() {
  return (
    process.env.CLAUDE_PLUGIN_ROOT ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  );
}

/**
 * Run a hook body. `fn(input)` gets the parsed stdin ({} when it is empty or invalid).
 * A number returned by fn becomes the exit code. An error prints one line to stderr and exits 0.
 * It never calls process.exit, so pending stdout writes are not cut off.
 */
export async function runHookMain(fn) {
  try {
    const input = (await readStdin()) ?? {};
    const code = await fn(input);
    process.exitCode = Number.isInteger(code) ? code : 0;
  } catch (err) {
    const first = String((err && err.message) || 'hook failed').split('\n')[0];
    process.stderr.write(`guilda: ${first}\n`);
    process.exitCode = 0;
  }
}
