import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/project.mjs';

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

try {
  const input = readStdin();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const pluginRoot =
    process.env.CLAUDE_PLUGIN_ROOT ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const loaded = loadConfig(projectDir);
  if (loaded && loaded.ok) {
    const rules = fs.readFileSync(path.join(pluginRoot, 'core', 'subagent.md'), 'utf8').trim();
    const root = pluginRoot.split(path.sep).join('/');
    const text = [
      rules,
      `Docs language: ${loaded.config.languages.docs}. Glossary: ${root}/core/glossary.md`,
    ].join('\n\n');
    const out = { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } };
    process.stdout.write(JSON.stringify(out));
  }
} catch (err) {
  process.stderr.write(`guilda: ${err && err.message ? err.message : 'subagent-start failed'}\n`);
}
process.exit(0);
