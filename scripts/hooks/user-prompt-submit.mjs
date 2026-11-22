// UserPromptSubmit (R35, section 4g, part 2): one `prompt` user record for each typed prompt of the interactive main
// session, and the context line `guilda user record: <id>`. Print mode, a subagent and a Codex host write nothing.
// Fail closed: on any error the hook writes no context line, so the prompt has no record.
import { projectState } from '../lib/project.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { MAX_TEXT_CHARS } from '../lib/bus.mjs';
import { isTypedSession, writeUserRecord, cutText } from '../lib/records.mjs';
import { readBindings, ROLE_CODES } from '../lib/queue.mjs';
import { liveClaim } from '../lib/queue-guard.mjs';
import { clearAway } from '../lib/away.mjs';

// The @mention step (D49, section 4l). The hook only adds context: it starts no agent and calls no SendMessage.
// A mention: `@`, a target token, a space or a tab, then at least one character of text. The token holds letters
// (an address starts with an upper case task letter), digits and `-`; a `.` or `/` makes it no mention.
const MENTION = /^@([A-Za-z0-9][A-Za-z0-9-]*)[ \t]+\S/;
const MAIN_TARGET = 'architect';
const ROLE_ALIASES = Object.freeze({ 'security-lead': 'sec' });

function mentionText(projectDir, prompt, recordId) {
  const match = MENTION.exec(prompt);
  if (!match) return null;
  const token = match[1];
  if (token === MAIN_TARGET) return null;
  let bound;
  try {
    bound = Object.values(readBindings(projectDir)).filter((b) => b && b.state === 'bound');
  } catch {
    return null;
  }
  let target = bound.find((b) => b.address === token);
  if (!target) {
    const code = ROLE_ALIASES[token] ?? (ROLE_CODES.includes(token) ? token : null);
    const ofRole = code ? bound.filter((b) => b.role === code) : [];
    if (ofRole.length === 1) target = ofRole[0];
  }
  if (target && target.agentId) {
    return `guilda D49: the user addressed ${target.address} directly. Call SendMessage to it (agent ${target.agentId}) with \`Record: ${recordId}\` and the text after the mention. Write no text in this turn. When the reply arrives, show it word for word, with no text before or after it.`;
  }
  const live = bound.filter((b) => b.agentId).map((b) => b.address);
  return `guilda D49: the user addressed ${token}, which is not a live address. The live addresses are: ${live.length ? live.join(', ') : 'none'}. Ask the user which one. Start no agent.`;
}

await runHookMain(async (input) => {
  if (!isTypedSession(process.env, input)) return 0;
  if (typeof input.prompt !== 'string') return 0;
  const projectDir = resolveProjectDir(input);
  if (projectState(projectDir).state !== 'valid') return 0;
  // A prompt of the claim session (a /loop tick of the supervisor) is not a user word: no record. A read error writes it.
  const held = liveClaim(projectDir);
  if (held.claim && held.claim.session === input.session_id) return 0;
  const record = writeUserRecord(projectDir, {
    session: input.session_id,
    kind: 'prompt',
    text: cutText(input.prompt, MAX_TEXT_CHARS),
    question: null,
  });
  if (!record) return 0;
  // Return (D48, 5i): a prompt that got a user record is a user word in the main session, so the away state clears.
  // The tests of 5i hold here: no agent_id and a typed session (isTypedSession), and not the session of a live claim
  // (the return above). A clear error never stops the record.
  // A claim file that cannot be read gives no clear (fail closed): the state stays set.
  try {
    if (!held.error) clearAway(projectDir);
  } catch {}
  const lines = [`guilda user record: ${record.id}`];
  const mention = mentionText(projectDir, input.prompt, record.id);
  if (mention) lines.push(mention);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
    }),
  );
  return 0;
});
