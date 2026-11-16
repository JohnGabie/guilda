// The short form of core/rules.md for the session context (spec section 3h).
// A law block becomes one line. Any other block becomes its heading with the level, and its Rule: line.

const BLOCK_RE = /^(### \S+ — .*)\n(Rule:.*)\nWhy:.*\nCheck: (\w+)\b.*$/gm;

/** Return the text of core/rules.md in the short form. It never throws. */
export function contextRules(text) {
  try {
    return String(text).replace(BLOCK_RE, (_all, heading, ruleLine, level) =>
      level === 'law'
        ? `${heading} (law — enforced by a hook)`
        : `${heading} (${level})\n${ruleLine}`,
    );
  } catch {
    return typeof text === 'string' ? text : '';
  }
}
