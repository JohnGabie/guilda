import fs from 'node:fs';
import path from 'node:path';
import { projectState } from '../lib/project.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';
import { writeSignal, validId } from '../lib/queue.mjs';

/** The `started` signal of a subagent (section 4a, S42), only with a .guilda/queue folder. Fails open (X9). */
function writeStarted(projectDir, agentId) {
  if (!validId('agent', agentId)) return;
  try {
    if (!fs.lstatSync(path.join(projectDir, '.guilda', 'queue')).isDirectory()) return;
    writeSignal(projectDir, { agentId }, 'started', { at: new Date().toISOString() });
  } catch {
    // No queue folder, or a started signal from an earlier run of this agent (a resume): nothing to write.
  }
}

const AGENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const pluginRoot = resolvePluginRoot();
  writeStarted(projectDir, input.agent_id);
  const project = projectState(projectDir);
  if (project.state === 'none') return;
  const rules = fs.readFileSync(path.join(pluginRoot, 'core', 'subagent.md'), 'utf8').trim();
  const root = pluginRoot.split(path.sep).join('/');
  const { languages, process: level } = project.config;
  const id = input && input.agent_id;
  const idLine = typeof id === 'string' && AGENT_ID.test(id) ? `\nYour agent ID: ${id}` : '';
  const text = [rules, `Docs language: ${languages.docs}. Process: ${level}. Glossary: ${root}/core/glossary.md${idLine}`].join('\n\n');
  const out = { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } };
  process.stdout.write(JSON.stringify(out));
});
