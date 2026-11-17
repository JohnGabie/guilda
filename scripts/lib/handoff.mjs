// The fixed handoff file of a build (D14, section 4a, T25). Pure: no file read, no clock read.
import { renderStatus } from './status.mjs';

export const HANDOFF_FILE = 'handoff.md';
export const NOTE_MAX = 300;
export const RULES_LINE = 'Read the core rules and .guilda/rules.md; this file holds no rule text.';

/** One note: newlines folded to a space, cut at NOTE_MAX characters. */
export function cleanNote(text) {
  return String(text).replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, NOTE_MAX);
}

function taskLine(id, t, events) {
  const last = events.filter((e) => e.type === 'dispatch' && e.task === id).at(-1);
  const parts = [id, t.state, `attempt ${t.attempt}`, `address ${t.address ?? '-'}`];
  if (typeof last?.branch === 'string' && last.branch !== '') parts.push(`branch ${last.branch}`);
  return `- ${parts.join(', ')}`;
}

/** The text of .guilda/handoff.md. */
export function renderHandoff(state, events, { now, notes = [] }) {
  const entries = Object.entries(state.tasks ?? {});
  const ready = entries.filter(([, t]) => t.state === 'ready').map(([id]) => `- ${id} ready`);
  const held = entries.filter(([, t]) => t.state === 'held').map(([id, t]) => `- ${id} held, reason: ${t.cause ?? '-'}`);
  const next = [...ready, ...held];
  const cleaned = notes.map(cleanNote);
  return [
    '# Handoff',
    `written: ${now}`,
    '',
    '## State',
    renderStatus(state, events, { now }).trimEnd(),
    '',
    '## Tasks',
    ...(entries.length > 0 ? entries.map(([id, t]) => taskLine(id, t, events)) : ['none']),
    '',
    '## Next',
    ...(next.length > 0 ? next : ['none']),
    '',
    '## Notes',
    ...(cleaned.length > 0 ? cleaned.map((n) => `- ${n}`) : ['none']),
    '',
    '## Rules',
    RULES_LINE,
    '',
  ].join('\n');
}
