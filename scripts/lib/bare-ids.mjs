// R13: a rule or decision ID in a question comes after its plain words, in parentheses.
const ID = /\b(?:R|D|X|S|T|U|DU|PK|ARC|AIG|SEC|EXE|RL)\d+[a-z]?\b/g;
// At least two words right before the opening parenthesis.
const TWO_WORDS = /[A-Za-z][\w'-]*\s+[A-Za-z][\w'-]*\s*$/;

/** True when the index sits inside parentheses that follow at least two words. */
function explained(text, index) {
  const open = text.lastIndexOf('(', index);
  if (open < 0 || text.slice(open, index).includes(')')) return false;
  return TWO_WORDS.test(text.slice(0, open));
}

/** True when the ID at `index` is a part of a file name: a "/" right before it, or a "." and a letter right after it. */
function inFileName(text, index, id) {
  return text[index - 1] === '/' || /^\.[A-Za-z]/.test(text.slice(index + id.length));
}

/** The IDs in `text` that are not inside parentheses after at least two words, in order, with no repeat. */
export function bareIds(text) {
  const found = [];
  if (typeof text !== 'string') return found;
  for (const m of text.matchAll(ID)) {
    if (!explained(text, m.index) && !inFileName(text, m.index, m[0]) && !found.includes(m[0])) found.push(m[0]);
  }
  return found;
}
