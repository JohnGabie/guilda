import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';
import { check as traceCheck, SPEC_DIR } from '../lib/trace.mjs';
import { steCheck, checkScope, readGlossaries, DEFAULT_VAGUE } from '../lib/ste.mjs';
import { MAX_TEXT_CHARS, MESSAGE_ID, MESSAGE_TYPES, MAIN, appendReceipt, pendingOf, readMailbox, knownAddress } from '../lib/bus.mjs';
import { validId, readBindings } from '../lib/queue.mjs';
import { isTypedSession, writeUserRecord, cutText } from '../lib/records.mjs';

const MAX_LISTED = 15;
const QUESTION_SEPARATOR = ' | ';
// The header line of a relayed message (4d): `guilda-message: <id> from <address> type <type>`.
const HEADER = /^guilda-message: (m-[0-9a-f]{8}) from (\S+) type (\S+)$/;

/** The context line of a new user record. */
function recordLine(id) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `guilda user record: ${id}` } }) + '\n',
  );
}

/**
 * R35 (S4-16): one `answer` record for a question tool answer of the typed main session. The question is the
 * question text of the tool input; the text is the whole tool response as JSON (L4-2 C8), cut to MAX_TEXT_CHARS.
 */
function answerRecord(projectDir, input) {
  if (!isTypedSession(process.env, input)) return 0;
  const toolInput = input.tool_input || {};
  const questions = Array.isArray(toolInput.questions) ? toolInput.questions : [];
  const texts = questions.map((q) => (q && typeof q.question === 'string' ? q.question : null)).filter((q) => q !== null);
  const response = JSON.stringify(input.tool_response ?? null);
  const record = writeUserRecord(projectDir, {
    session: input.session_id,
    kind: 'answer',
    question: texts.length > 0 ? cutText(texts.join(QUESTION_SEPARATOR), MAX_TEXT_CHARS) : null,
    text: cutText(response, MAX_TEXT_CHARS),
  });
  if (record) recordLine(record.id);
  return 0;
}

/**
 * S4-39: the `delivered` receipt of each relayed message. Each header line of the SendMessage text names a message
 * ID; a receipt goes to the bound address whose mailbox has that message pending. Any other text writes no line.
 */
function deliveredReceipts(projectDir, input) {
  const toolInput = input.tool_input || {};
  const text = typeof toolInput.message === 'string' ? toolInput.message : '';
  const ids = [];
  for (const line of text.split('\n')) {
    const m = HEADER.exec(line);
    if (m && validId('address', m[2]) && MESSAGE_TYPES.includes(m[3]) && !ids.includes(m[1])) ids.push(m[1]);
  }
  if (ids.length === 0) return 0;
  const bindings = readBindings(projectDir);
  for (const address of Object.keys(bindings)) {
    if (address === MAIN || !knownAddress(bindings, address)) continue;
    const pending = pendingOf(readMailbox(projectDir, address));
    for (const id of ids) {
      if (!MESSAGE_ID.test(id) || !pending.some((m) => m.id === id)) continue;
      try {
        appendReceipt(projectDir, address, id, 'delivered', MAIN);
      } catch {
        // The message stays pending; the relay comes again.
      }
    }
  }
  return 0;
}

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

  if (input.tool_name === 'AskUserQuestion') return answerRecord(projectDir, input);
  if (input.tool_name === 'SendMessage') return deliveredReceipts(projectDir, input);

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
