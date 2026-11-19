// UserPromptSubmit (R35, section 4g, part 2): one `prompt` user record for each typed prompt of the interactive main
// session, and the context line `guilda user record: <id>`. Print mode, a subagent and a Codex host write nothing.
// Fail closed: on any error the hook writes no context line, so the prompt has no record.
import { projectState } from '../lib/project.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { MAX_TEXT_CHARS } from '../lib/bus.mjs';
import { isTypedSession, writeUserRecord, cutText } from '../lib/records.mjs';

await runHookMain(async (input) => {
  if (!isTypedSession(process.env, input)) return 0;
  if (typeof input.prompt !== 'string') return 0;
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state !== 'valid') return 0;
  const record = writeUserRecord(projectDir, {
    session: input.session_id,
    kind: 'prompt',
    text: cutText(input.prompt, MAX_TEXT_CHARS),
    question: null,
  });
  if (!record) return 0;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `guilda user record: ${record.id}` },
    }),
  );
  return 0;
});
