#!/usr/bin/env node
// Rule lint: the rule block format (design 6.13) and the model-name rule (R17).
// CLI: `node scripts/lint-rules.mjs` lints the repository. Exit 1 on errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = ['law', 'gate', 'judgment'];
const MAX_RULE_WORDS = 20;

const stripCode = (s) => s.replace(/`[^`]*`/g, 'CODE');
const wordCount = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/** True when the text is exactly one sentence: one terminal mark, at the end. */
function isOneSentence(s) {
  const text = stripCode(s).trim();
  const marks = text.match(/[.!?](?=\s|$)/g) ?? [];
  return marks.length === 1 && /[.!?]$/.test(text);
}

/**
 * Lint rule blocks in a Markdown text. Each `### ` heading must open a block:
 *   ### <prefix><n> — <title>
 *   Rule:  <one sentence, 20 words or fewer>
 *   Why:   <one sentence>
 *   Check: <law|gate|judgment> — <mechanism>
 * Returns a list of error strings; an empty list means the text passes.
 */
export function lintRules(markdown, { prefix = 'R' } = {}) {
  const errors = [];
  const lines = markdown.split(/\r?\n/);
  const seen = new Set();
  const inBlock = new Set();
  const heading = new RegExp(`^### (${prefix}\\d+) — \\S.*$`);

  lines.forEach((line, i) => {
    if (!line.startsWith('### ')) return;
    [i + 1, i + 2, i + 3].forEach((n) => inBlock.add(n));
    const m = line.match(heading);
    if (!m) {
      errors.push(`line ${i + 1}: heading is not "### ${prefix}<n> — <title>": ${line.slice(0, 60)}`);
      return;
    }
    const id = m[1];
    if (seen.has(id)) errors.push(`line ${i + 1}: duplicate ID ${id}`);
    seen.add(id);

    const [ruleLine = '', whyLine = '', checkLine = ''] = lines.slice(i + 1, i + 4);
    const rule = ruleLine.match(/^Rule:\s+(\S.*)$/);
    const why = whyLine.match(/^Why:\s+(\S.*)$/);
    const check = checkLine.match(/^Check:\s+(\S+)(?: — (\S.*))?$/);
    if (!rule || !why || !check) {
      errors.push(`${id}: block needs the lines "Rule:", "Why:" and "Check:" in this order`);
      return;
    }
    if (!isOneSentence(rule[1])) errors.push(`${id}: Rule must be one sentence`);
    const n = wordCount(rule[1]);
    if (n > MAX_RULE_WORDS) errors.push(`${id}: Rule has ${n} words; the limit is ${MAX_RULE_WORDS}`);
    if (!isOneSentence(why[1])) errors.push(`${id}: Why must be one sentence`);
    if (!LEVELS.includes(check[1])) {
      errors.push(`${id}: Check level "${check[1]}" is not one of ${LEVELS.join(', ')}`);
    } else if (!check[2]) {
      errors.push(`${id}: Check needs " — <mechanism>" after the level`);
    }
  });

  lines.forEach((line, i) => {
    if (/^(Rule|Why|Check):/.test(line) && !inBlock.has(i)) {
      errors.push(`line ${i + 1}: "${line.split(':')[0]}:" line outside a rule block`);
    }
  });
  return errors;
}

// `claude-` counts only when it does not follow a word character, a dot, a slash or a hyphen,
// so the `.claude-plugin` folder name is not a model name.
const MODEL_NAME = /\b(opus|sonnet|haiku|fable)\b|(?<![\w./-])claude-/i;

/**
 * Return an error for each model name outside `core/tiers.json` and outside a `model:` line in the
 * frontmatter of a file.
 */
export function lintModelNames(files) {
  const errors = [];
  for (const file of files) {
    if (file.replace(/\\/g, '/').endsWith('core/tiers.json')) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let frontmatterEnd = -1;
    if (lines[0] === '---') {
      const close = lines.indexOf('---', 1);
      if (close > 0) frontmatterEnd = close;
    }
    lines.forEach((line, i) => {
      if (i < frontmatterEnd && /^model:\s/.test(line)) return;
      const m = line.match(MODEL_NAME);
      if (m) errors.push(`${file}:${i + 1}: model name "${m[0]}" outside core/tiers.json (R17)`);
    });
  }
  return errors;
}

// The CLI lints the files the plugin ships. `docs/` (design history) and `tests/` (fixtures) are not
// shipped. This script holds the model-name pattern, so it skips itself.
const SHIPPED_DIRS = ['core', 'agents', 'skills', 'hooks', 'scripts'];
const RULE_FILES = ['core/rules.md', 'core/subagent.md'];

function listFiles(root, rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : listFiles(root, child);
    return [child];
  });
}

export function lintRepository(root) {
  const errors = [];
  for (const rel of RULE_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    errors.push(...lintRules(fs.readFileSync(file, 'utf8'), { prefix: 'R' }).map((e) => `${rel}: ${e}`));
  }
  const self = path.normalize('scripts/lint-rules.mjs');
  const rootFiles = fs.readdirSync(root).filter((f) => f.endsWith('.md'));
  const files = [...rootFiles, ...SHIPPED_DIRS.flatMap((d) => listFiles(root, d))]
    .filter((rel) => path.normalize(rel) !== self)
    .map((rel) => path.join(root, rel));
  errors.push(...lintModelNames(files).map((e) => (e.startsWith(root) ? e.slice(root.length + 1) : e)));
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const errors = lintRepository(root);
  for (const e of errors) console.log(e);
  process.exit(errors.length > 0 ? 1 : 0);
}
