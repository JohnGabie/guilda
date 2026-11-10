// Block index for traceability (spec D27). Lab prototype, no dependencies.
// Run all commands from the project root.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SPEC_DIR = 'docs/superpowers/specs';
export const CITE_DIRS = ['docs/superpowers/plans', 'docs/superpowers/briefs'];
export const INDEX_FILE = '.guilda/trace/index.json';

const HEADING = /^#{1,3} /;
const BLOCK_HEAD = /^### ([A-Z]{1,3}\d+) — (.*)$/;
const COMMENT_ID = /^<!-- id: ([A-Z]{1,3}\d+) -->\s*$/;
const STATUS_TAG = /`@\w+`/g;

// Parse the text of one spec file into blocks: { id, title, start, end, hash }.
// A block is a `### <ID> — <title>` section up to the next heading of level 1 to 3.
// A section with no ID in its title can take one from an HTML comment on the line before it.
export function parseBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = null;
  const close = (endIdx) => {
    if (!cur) return;
    let e = endIdx;
    while (e > cur.start && lines[e - 1].trim() === '') e--;
    cur.end = e; // 1-based last line
    const body = lines.slice(cur.start, e).join('\n'); // lines after the title
    cur.hash = hashOf(cur.titleText, body);
    blocks.push(cur);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!HEADING.test(l)) continue;
    close(i);
    const m = BLOCK_HEAD.exec(l);
    let id = m ? m[1] : null;
    let titleText = m ? m[2] : l.replace(/^#+ /, '');
    if (!id && i > 0) {
      const c = COMMENT_ID.exec(lines[i - 1]);
      if (c) id = c[1];
    }
    if (id && l.startsWith('### ')) cur = { id, title: l.replace(/^### /, ''), titleText, start: i + 1 };
  }
  close(lines.length);
  return blocks.map(({ id, title, start, end, hash }) => ({ id, title, start, end, hash }));
}

// SHA-256 of the title without the status tag plus the body, white space collapsed, first 8 hex characters.
export function hashOf(titleText, body) {
  const t = (titleText.replace(STATUS_TAG, '') + '\n' + body).split(/\s+/).filter(Boolean).join(' ');
  return crypto.createHash('sha256').update(t).digest('hex').slice(0, 8);
}

function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

// Citers: each plan task (a `### T<n> — ` section of a plan) and each brief file with a `Uses:` line.
export function parseCiters(file, text) {
  const lines = text.split('\n');
  const isBrief = file.includes('/briefs/');
  const citers = [];
  let task = null;
  let briefId = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = /^### (T\d+) — /.exec(l);
    if (t) task = t[1];
    const b = /^ID \/ title: (T\d+)/.exec(l);
    if (b) briefId = b[1];
    const own = /^Owns:\s*(.*)$/.exec(l);
    const uses = /^Uses:\s*(.*)$/.exec(l);
    const name = isBrief ? `brief:${briefId || path.basename(file, '.md')}` : `plan:${task || '?'}`;
    if (own) {
      for (const id of own[1].split(/[,\s]+/).filter(Boolean)) citers.push({ kind: 'owns', citer: name, file, line: i + 1, id });
    }
    if (uses) {
      for (const tok of uses[1].split(/[,\s]+/).filter(Boolean)) {
        const [id, hash] = tok.split('@');
        citers.push({ kind: 'uses', citer: name, file, line: i + 1, id, hash: hash || null });
      }
    }
  }
  return citers;
}

export function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// The commit at which a citer read a block: the oldest commit that added `<ID>@<hash>` to the citer file.
// For one file, one `git log -p` run gives all citations, so the build stays fast.
function readCommits(file) {
  const out = git(['log', '--reverse', '--format=@@C %H', '-p', '--unified=0', '--', file]);
  const first = new Map();
  let c = null;
  for (const l of out.split('\n')) {
    if (l.startsWith('@@C ')) { c = l.slice(4); continue; }
    if (!l.startsWith('+') || l.startsWith('+++')) continue;
    for (const m of l.matchAll(/([A-Z]{1,3}\d+)@([0-9a-f]{8})/g)) {
      const k = `${m[1]}@${m[2]}`;
      if (!first.has(k)) first.set(k, c);
    }
  }
  return first;
}

export function buildIndex() {
  const blocks = {};
  const specs = listMd(SPEC_DIR);
  for (const f of specs) {
    for (const b of parseBlocks(fs.readFileSync(f, 'utf8'))) {
      blocks[b.id] = { ...b, file: f, citedBy: [], owners: [] };
    }
  }
  const citations = [];
  for (const dir of CITE_DIRS) {
    for (const f of listMd(dir)) {
      const cs = parseCiters(f, fs.readFileSync(f, 'utf8'));
      if (!cs.length) continue;
      const commits = readCommits(f);
      for (const c of cs) {
        if (c.kind === 'uses') c.commit = commits.get(`${c.id}@${c.hash}`) || null;
        citations.push(c);
        const b = blocks[c.id];
        if (!b) continue;
        if (c.kind === 'owns') b.owners.push(c.citer);
        else b.citedBy.push({ citer: c.citer, file: c.file, line: c.line, hash: c.hash, commit: c.commit });
      }
    }
  }
  return { generatedBy: 'labs/trace-index/index.mjs', head: git(['rev-parse', 'HEAD']), blocks, citations };
}

export function writeIndex(idx) {
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  const tmp = INDEX_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 1) + '\n');
  fs.renameSync(tmp, INDEX_FILE);
}

export function loadIndex() {
  if (fs.existsSync(INDEX_FILE)) return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const idx = buildIndex();
  writeIndex(idx);
  return idx;
}

// The text of one block, from the work tree or from a commit.
export function blockText(id, file, at) {
  const text = at ? git(['show', `${at}:${file}`]) : fs.readFileSync(file, 'utf8');
  if (!text) return null;
  const b = parseBlocks(text).find((x) => x.id === id);
  if (!b) return null;
  const lines = text.split('\n').slice(b.start - 1, b.end);
  return { ...b, text: lines.join('\n') };
}
