const SECRET_PATTERNS = [
  /gh[pos]_[A-Za-z0-9]{36}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const ABS_PATH_PATTERNS = [
  /[A-Za-z]:\\Users\\[^\\\s]+/,
  /[A-Za-z]:\/Users\/[^/\s]+/,
  /\/home\/[^/\s]+\//,
  /\/Users\/[^/\s]+\//,
];

/**
 * Scan text for secrets and absolute machine paths.
 * Returns one entry per finding: its kind and its 1-based line number.
 * The result never holds the matched text.
 */
export function scanText(text) {
  const found = [];
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (SECRET_PATTERNS.some((re) => re.test(line))) {
        found.push({ kind: 'secret', line: i + 1 });
      }
      if (ABS_PATH_PATTERNS.some((re) => re.test(line))) {
        found.push({ kind: 'abs-path', line: i + 1 });
      }
    });
  return found;
}

/** Match a path against a glob: `*` is any characters except `/`, `**` is any characters. */
export function globMatch(pattern, path) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
      } else {
        re += '[^/]*';
      }
    } else {
      re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`).test(path);
}
