import fs from 'node:fs';
import path from 'node:path';

export const PENDING_FILE = 'decisions-pending.md';
export const ID_RE = /^[A-Za-z0-9-]{1,32}$/;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
const RECOMMENDED_MARK = ' (recommended)';
const HEADER = '# Pending decisions\n';

export function pendingPath(projectDir) {
  return path.join(projectDir, '.guilda', PENDING_FILE);
}

/** Split the file text into blocks: { id, text }. Text has no trailing newline. */
function parse(text) {
  const blocks = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      cur = { id: m[1].trim(), lines: [line] };
      blocks.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return blocks.map((b) => ({ id: b.id, text: b.lines.join('\n').trimEnd() }));
}

function readText(projectDir) {
  try {
    return fs.readFileSync(pendingPath(projectDir), 'utf8');
  } catch {
    return '';
  }
}

function write(projectDir, blocks) {
  const file = pendingPath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${HEADER}\n${blocks.map((b) => b.text).join('\n\n')}${blocks.length ? '\n' : ''}`);
  fs.renameSync(tmp, file);
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

export function listDecisions(projectDir) {
  return parse(readText(projectDir));
}

export function countPending(projectDir) {
  return listDecisions(projectDir).length;
}

/** Add one block. Throws an Error with a message on a bad input or a repeated ID. */
export function addDecision(projectDir, { id, context, options, recommended, blocks, now }) {
  if (!ID_RE.test(id ?? '')) throw new Error(`bad ID: ${id}`);
  if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw new Error(`a decision needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options`);
  }
  if (!Number.isInteger(recommended) || recommended < 1 || recommended > options.length) {
    throw new Error('--recommended must be the number of one option');
  }
  if (!oneLine(context ?? '') || !oneLine(blocks ?? '')) throw new Error('--context and --blocks are required');
  const asked = now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(asked))) throw new Error(`bad --now: ${asked}`);
  const all = listDecisions(projectDir);
  if (all.some((b) => b.id === id)) throw new Error(`decision ${id} is already open`);
  const opts = options.map(oneLine);
  const ordered = [opts[recommended - 1], ...opts.filter((_, i) => i !== recommended - 1)];
  const lines = [
    `## ${id}`,
    `asked: ${asked}`,
    `context: ${oneLine(context)}`,
    ...ordered.map((o, i) => `${i + 1}. ${o}${i === 0 ? RECOMMENDED_MARK : ''}`),
    `blocks: ${oneLine(blocks)}`,
  ];
  all.push({ id, text: lines.join('\n') });
  write(projectDir, all);
}

/** Remove one block and return its text with the answer line. Throws when the ID is not open. */
export function resolveDecision(projectDir, id, answer) {
  const all = listDecisions(projectDir);
  const hit = all.find((b) => b.id === id);
  if (!hit) throw new Error(`decision ${id} is not open`);
  if (!oneLine(answer ?? '')) throw new Error('--answer is required');
  write(projectDir, all.filter((b) => b !== hit));
  return `${hit.text}\nanswer: ${oneLine(answer)}`;
}
