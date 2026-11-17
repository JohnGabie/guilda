const ID = /^(R|P|[A-Z]{2,4})\d+$/;

/** The text after `Label:` on the last line that starts with it, or null. */
function lastField(text, label) {
  const re = new RegExp(`^[ \t]*${label}:[ \t]*(.*)$`, 'gm');
  let value = null;
  for (const m of text.matchAll(re)) value = m[1].trim();
  return value;
}

/** The `- <text>` items under the last `Questions:` line. Empty when there is none. */
function questionsOf(text) {
  const all = text.split(/\r?\n/);
  let start = -1;
  all.forEach((l, i) => { if (/^[ \t]*Questions:/.test(l)) start = i; });
  if (start < 0) return [];
  const items = [];
  for (let i = start + 1; i < all.length; i += 1) {
    const item = /^[ \t]*-[ \t]+(\S.*)$/.exec(all[i]);
    if (item) items.push(item[1].trim());
    else if (all[i].trim()) break;
  }
  return items;
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
  return { result, violations, questions: questionsOf(source) };
}
