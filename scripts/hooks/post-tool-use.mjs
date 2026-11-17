import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';
import { check as traceCheck, SPEC_DIR } from '../lib/trace.mjs';
import { steCheck, checkScope, readGlossaries, DEFAULT_VAGUE } from '../lib/ste.mjs';

const MAX_LISTED = 15;

/** The SUSPECT and UNKNOWN lines after an edit of a spec file. A check error gives no line. */
function specTraceLines(projectDir, rel) {
  if (!rel.startsWith(`${SPEC_DIR}/`) || !rel.endsWith('.md')) return [];
  try {
    return traceCheck(projectDir, { short: true })
      .filter((f) => f.kind === 'SUSPECT' || f.kind === 'UNKNOWN')
      .map((f) => f.lines[0]);
  } catch {
    return [];
  }
}

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
  const traceLines = specTraceLines(projectDir, rel);
  const inScope = checkScope(rel, loaded.config).check;
  if (!inScope && traceLines.length === 0) return 0;

  let findings = [];
  let text = null;
  if (inScope) {
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      text = null;
    }
  }
  if (text !== null) {
    const glossary = readGlossaries(resolvePluginRoot(), projectDir);
    findings = steCheck(text, { glossary, vague: DEFAULT_VAGUE });
  }
  if (findings.length === 0 && traceLines.length === 0) return 0;

  // The two parts share one budget of MAX_LISTED listed lines (a 'more' line is a summary); the trace lines come first.
  const shownTrace = traceLines.slice(0, MAX_LISTED);
  const room = MAX_LISTED - shownTrace.length;
  const lines = findings.slice(0, room).map((f) => `${rel}:${f.line} ${f.kind} ${f.detail}`);
  const parts = [];
  if (shownTrace.length > 0) {
    if (traceLines.length > shownTrace.length) {
      shownTrace.push(`${traceLines.length - shownTrace.length} more: run scripts/trace.mjs check`);
    }
    parts.push(shownTrace.join('\n'));
  }
  if (findings.length > 0) {
    if (findings.length > room) lines.push(`${findings.length - room} more: run scripts/ste-check.mjs on ${rel}`);
    parts.push(`R15: fix these lines:\n${lines.join('\n')}`);
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: parts.join('\n'),
      },
    }) + '\n',
  );
  if (findings.length === 0) return 0;
  appendViolation(projectDir, {
    rule: 'R15',
    level: 'gate',
    source: 'ste-check',
    action: `${findings.length} findings in ${rel}`,
  });
  return 0;
});
