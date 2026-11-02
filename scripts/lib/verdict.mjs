const ID = /^(R|P|[A-Z]{2,4})\d+$/;

/** The text after `Label:` on the last line that starts with it, or null. */
function lastField(text, label) {
  const re = new RegExp(`^[ \t]*${label}:[ \t]*(.*)$`, 'gm');
  let value = null;
  for (const m of text.matchAll(re)) value = m[1].trim();
  return value;
}

/**
 * Read a Reviewer or Security verdict.
 * Uses the last `Result:` line and the last `Violations:` line. Prose elsewhere is ignored.
 * `none` and unknown tokens give no IDs.
 */
export function parseVerdict(text) {
  const source = typeof text === 'string' ? text : '';
  const result = (lastField(source, 'Result') ?? '').split(/\s+/)[0] || null;
  const raw = lastField(source, 'Violations') ?? '';
  const violations = raw.split(/[\s,;]+/).filter((token) => ID.test(token));
  return { result, violations };
}
