import fs from 'node:fs';
import path from 'node:path';
import { globMatch } from './scan.mjs';

/** Vague words and phrases (ASD-STE100 writing rule: use exact verbs). */
export const DEFAULT_VAGUE = [
  'handle', 'deal with', 'adjust', 'appropriate', 'maybe', 'probably', 'usually', 'if possible',
  'talvez', 'geralmente', 'se possível', 'lidar com', 'ajustar',
];

const INSTRUCTION_LIMIT = 20;
const DESCRIPTION_LIMIT = 25;
const DETAIL_MAX = 60;

const GLOSSARY_LINE = /^\s*- \*\*([^*]+)\*\*: .*?\bForbidden: (.+?)\.?\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^#{1,6}(\s|$)/;
const RULE_LINE = /^([-*_])(\s*\1){2,}$/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+(.*)$/;
const WORD_CHAR = '[\\p{L}\\p{N}_]';
// A sentence ends at . ! or ? (with closing quotes, brackets or emphasis marks) before a space or the end.
const END = `[.!?]+[)"'\\u201d\\u2019\\]*_]*(?=\\s|$)`;
const SENTENCE = new RegExp(`(?:(?!${END})[\\s\\S])+(?:${END}|$)`, 'g');

/** Read the glossary line format: `- **<term>**: <definition>. Forbidden: <w1>, <w2>.` */
export function parseGlossary(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    const m = GLOSSARY_LINE.exec(line);
    if (!m) continue;
    const forbidden = m[2].split(',').map((w) => w.trim()).filter(Boolean);
    if (forbidden.length) out.push({ term: m[1].trim(), forbidden });
  }
  return out;
}

/** The core glossary of the plugin plus the project glossary when it exists. */
export function readGlossaries(pluginRoot, projectDir) {
  const files = [
    path.join(pluginRoot, 'core', 'glossary.md'),
    path.join(projectDir, 'docs', 'superpowers', 'specs', 'GLOSSARY.md'),
  ];
  const out = [];
  for (const file of files) {
    try {
      out.push(...parseGlossary(fs.readFileSync(file, 'utf8')));
    } catch {
      // A missing glossary has no terms.
    }
  }
  return out;
}

/**
 * Decide if the writing rules apply to a file. `relPath` is relative to the project directory.
 * Returns { check: true } or { check: false, reason }.
 */
export function checkScope(relPath, config) {
  const rel = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
  const writing = (config && config.writing) || {};
  if (!/\.md$/i.test(rel)) return { check: false, reason: 'not a Markdown file' };
  if (rel.split('/').includes('.journal')) return { check: false, reason: 'diary file under .journal/' };
  const base = rel.split('/').pop();
  for (const glob of writing.free || []) {
    if (globMatch(glob, rel)) return { check: false, reason: `writing.free: ${glob}` };
  }
  for (const e of writing.exceptions || []) {
    if (e.level === 'full') continue;
    if (globMatch(e.docType, rel) || globMatch(e.docType, base)) return { check: false, reason: e.reason };
  }
  return { check: true };
}

const clip = (s) => (s.length <= DETAIL_MAX ? s : s.slice(0, DETAIL_MAX - 3) + '...');

/** Replace the skipped parts of one line (inline code, links, URLs) with one placeholder word. */
function cleanLine(text, glossaryLine) {
  let t = text
    .replace(/(`+)[\s\S]*?\1/g, ' CODE ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' LINK ')
    .replace(/<https?:\/\/[^>]*>/g, ' LINK ')
    .replace(/https?:\/\/\S+/g, ' LINK ');
  // A glossary line holds its forbidden words on purpose.
  if (glossaryLine) t = t.replace(/\bForbidden:.*$/, '');
  return t;
}

/** Group the checked lines into blocks: list steps and prose paragraphs. */
function toBlocks(lines) {
  const blocks = [];
  let current = null;
  let fence = null;
  let start = 0;
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) start = end + 1;
  }
  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    if (fence) {
      if (raw.trim().startsWith(fence)) fence = null;
      continue;
    }
    const f = FENCE.exec(raw);
    if (f) {
      close();
      fence = f[1];
      continue;
    }
    const t = raw.trim().replace(/^(>\s?)+/, '').trim();
    if (t === '' || HEADING.test(t) || t.startsWith('|') || RULE_LINE.test(t)) {
      close();
      continue;
    }
    const item = LIST_ITEM.exec(t);
    if (item) {
      close();
      const glossary = GLOSSARY_LINE.test(t);
      current = { step: !glossary, glossary, parts: [{ line: i + 1, text: cleanLine(item[1], glossary) }] };
    } else if (current) {
      current.parts.push({ line: i + 1, text: cleanLine(t, current.glossary) });
    } else {
      current = { step: false, glossary: false, parts: [{ line: i + 1, text: cleanLine(t, false) }] };
    }
  }
  close();
  return blocks;
}

function phraseRegex(phrase) {
  const body = phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'giu');
}

const countWords = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * Check Markdown against the automatic part of the writing rules (R15, R16).
 * Returns { line, kind: 'long-sentence' | 'vague-word' | 'forbidden-word', detail }[].
 */
export function steCheck(markdown, { glossary = [], vague = DEFAULT_VAGUE } = {}) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const vagueRes = vague.map((w) => ({ word: w, re: phraseRegex(w) }));
  const forbiddenRes = glossary.flatMap(({ term, forbidden }) =>
    forbidden.map((w) => ({ word: w, term, re: phraseRegex(w) })),
  );
  const findings = [];

  for (const block of toBlocks(lines)) {
    // Join the block into one text and keep the line of each start offset.
    let text = '';
    const starts = [];
    for (const part of block.parts) {
      if (text) text += ' ';
      starts.push({ offset: text.length, line: part.line });
      text += part.text;
    }
    const lineAt = (offset) => {
      let line = starts[0].line;
      for (const s of starts) if (s.offset <= offset) line = s.line;
      return line;
    };
    const add = (offset, kind, detail) => findings.push({ line: lineAt(offset), kind, detail: clip(detail), offset });

    const limit = block.step ? INSTRUCTION_LIMIT : DESCRIPTION_LIMIT;
    for (const m of text.matchAll(SENTENCE)) {
      if (!m[0].trim()) continue;
      const lead = m[0].length - m[0].trimStart().length;
      const n = countWords(m[0]);
      if (n > limit) add(m.index + lead, 'long-sentence', `${n} words, limit ${limit}`);
    }
    for (const { word, re } of vagueRes) {
      for (const m of text.matchAll(re)) add(m.index, 'vague-word', `"${word}"`);
    }
    if (!block.glossary) {
      for (const { word, term, re } of forbiddenRes) {
        for (const m of text.matchAll(re)) add(m.index, 'forbidden-word', `"${word}", use "${term}"`);
      }
    }
  }

  findings.sort((a, b) => a.line - b.line || a.offset - b.offset);
  return findings.map(({ line, kind, detail }) => ({ line, kind, detail }));
}
