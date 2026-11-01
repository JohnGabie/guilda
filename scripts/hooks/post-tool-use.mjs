import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';
import { steCheck, checkScope, readGlossaries, DEFAULT_VAGUE } from '../lib/ste.mjs';

const MAX_LISTED = 15;

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const toolInput = input.tool_input || {};
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
  if (!filePath) return 0;
  const abs = path.resolve(projectDir, filePath);
  const rel = path.relative(projectDir, abs).split(path.sep).join('/');
  // A file outside the project is not project text.
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return 0;
  if (!checkScope(rel, loaded.config).check) return 0;

  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return 0;
  }
  const glossary = readGlossaries(resolvePluginRoot(), projectDir);
  const findings = steCheck(text, { glossary, vague: DEFAULT_VAGUE });
  if (findings.length === 0) return 0;

  const lines = findings.slice(0, MAX_LISTED).map((f) => `${rel}:${f.line} ${f.kind} ${f.detail}`);
  if (findings.length > MAX_LISTED) {
    lines.push(`${findings.length - MAX_LISTED} more: run scripts/ste-check.mjs on ${rel}`);
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `R15: fix these lines:\n${lines.join('\n')}`,
      },
    }) + '\n',
  );
  appendViolation(projectDir, {
    rule: 'R15',
    level: 'gate',
    source: 'ste-check',
    action: `${findings.length} findings in ${rel}`,
  });
  return 0;
});
