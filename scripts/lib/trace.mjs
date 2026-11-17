// The block index and the citations (D27, section 4d of the 0.3.0 spec).
// A block is a `### <ID> — <title>` heading outside a code fence, up to the next heading of level 1, 2 or 3.
// The index covers the Markdown files under docs/superpowers/specs/, the `<feature>.plan.md` files with them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readJournal, readState, GENERATOR } from './queue.mjs';

export const SPEC_DIR = 'docs/superpowers/specs';
export const INDEX_FILE = '.guilda/trace/index.json';
export const READ_NOTE = 'the read commit is not in the history';
export const SUSPECT_END = 'read the change; the task can still match';
/** The first guilda version whose install puts plan tasks in the R31 scope (section 3a). */
export const R31_VERSION = [0, 3, 0];
/** The finding kinds that make `check` exit 1. NO-OWNER and LEGACY are warnings. */
export const BLOCKING = Object.freeze(['SUSPECT', 'UNKNOWN', 'AMBIGUOUS', 'DUPLICATE', 'DUPLICATE-FILE', 'NO-USES']);

const GIT_TIMEOUT_MS = 10000;
const GIT_MAX_BUFFER = 1 << 28;
const HASH_LENGTH = 8;
const TMP_BYTES = 4;
const CONFIG_FILE = '.guilda/config.json';

const ID = '[A-Z][A-Z0-9-]*[0-9]+[a-z]?';
const BLOCK_HEAD = new RegExp(`^### (${ID}) — (.*)$`);
const HEADING_1_3 = /^#{1,3}(?: |$)/;
const HEADING_1_2 = /^#{1,2}(?: |$)/;
const PLAN_PART = /^## Plan: Part (\d+)\s*$/;
const TAGS = /`@(?:decided|proposed|open|replaced)`/g;
const KEY = new RegExp(`^(?:([^#\\s@]+)#)?(?:Part(\\d+)\\.)?(${ID})$`);
const CITATION = /^(.+)@([0-9a-f]{8})$/;
const COMMIT = /^[0-9a-f]{4,64}$/;
const ZERO_COMMIT = /^0+$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

const splitLines = (text) => String(text).replace(/\r\n?/g, '\n').split('\n');
const stemOf = (file) => path.posix.basename(file, '.md');

// ---- Blocks ----

/** Fence state per CommonMark: an opener of 3+ backticks or tildes, indented 0-3 spaces; a closer of the same mark, at least as long. */
function fenceTracker() {
  let open = null;
  return (line) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!open) {
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
        open = m[1];
        return true;
      }
      return false;
    }
    if (m && m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === '') open = null;
    return true;
  };
}

/**
 * The hash of a block: SHA-256 of the title and the body, first 8 hex characters. The four status tags are removed,
 * and each run of white space is one space, so `\r\n` reads as `\n`. `body` is a string or a list of lines.
 */
export function blockHash(title, body) {
  const text = `${title}\n${Array.isArray(body) ? body.join('\n') : body}`.replace(/\r\n?/g, '\n');
  const flat = text.replace(TAGS, '').split(/\s+/).filter(Boolean).join(' ');
  return crypto.createHash('sha256').update(flat).digest('hex').slice(0, HASH_LENGTH);
}

const cleanTitle = (t) => t.replace(TAGS, '').replace(/\s+/g, ' ').trim();

/**
 * The blocks of one file: [{ id, title, file, stem, start, end, hash, part, planTask, multiPart, lines }]. start and end
 * are 1-based; start is the heading line; end drops the blank lines at the end. `lines` are the heading and the body.
 */
export function parseBlocks(text, file) {
  const lines = splitLines(text);
  const planFile = String(file).endsWith('.plan.md');
  const stem = stemOf(String(file));
  const inFence = fenceTracker();
  const blocks = [];
  let cur = null;
  let part = null;
  const close = (i) => {
    if (!cur) return;
    let e = i;
    while (e > cur.start && lines[e - 1].trim() === '') e--;
    cur.end = e;
    cur.lines = lines.slice(cur.start - 1, e);
    cur.hash = blockHash(cur.rawTitle, cur.lines.slice(1));
    delete cur.rawTitle;
    blocks.push(cur);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inFence(l) || !HEADING_1_3.test(l)) continue;
    close(i);
    if (HEADING_1_2.test(l)) {
      const p = PLAN_PART.exec(l);
      part = p ? Number(p[1]) : null;
      continue;
    }
    const m = BLOCK_HEAD.exec(l);
    if (m) {
      cur = { id: m[1], title: cleanTitle(m[2]), rawTitle: m[2], file, stem, start: i + 1, part, planTask: planFile || part !== null };
    }
  }
  close(lines.length);
  const parts = new Map();
  for (const b of blocks) {
    if (!b.planTask) continue;
    if (!parts.has(b.id)) parts.set(b.id, new Set());
    parts.get(b.id).add(b.part);
  }
  for (const b of blocks) b.multiPart = b.planTask && parts.get(b.id).size > 1;
  return blocks;
}

/** The key of a block: `[<stem>#][Part<N>.]<ID>`. `index.ambiguous` lists the IDs of spec blocks in two or more files. */
export function keyOf(block, index) {
  if (block.planTask) return block.multiPart ? `${block.stem}#Part${block.part}.${block.id}` : `${block.stem}#${block.id}`;
  const ambiguous = index && Array.isArray(index.ambiguous) ? index.ambiguous : [];
  return ambiguous.includes(block.id) ? `${block.stem}#${block.id}` : block.id;
}

/** Resolve a key in an index: { key } or { finding: 'UNKNOWN' | 'AMBIGUOUS' }. */
export function resolveKey(index, key) {
  const m = KEY.exec(String(key));
  if (!m) return { finding: 'UNKNOWN' };
  if (Object.hasOwn(index.blocks, key)) return { key };
  if (!m[1] && !m[2] && index.ambiguous.includes(m[3])) return { finding: 'AMBIGUOUS' };
  return { finding: 'UNKNOWN' };
}

// ---- Fields of a plan ----

const fieldRe = (name) => new RegExp(`^\\s*(?:[-*]\\s+)?${name}:\\s*(.*)$`);
const USES = fieldRe('Uses');
const OWNS = fieldRe('Owns');
const COVERS = fieldRe('Covers');

const items = (v) =>
  v
    .replace(/`/g, '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x !== '' && x.toLowerCase() !== 'none');

/** The index of the first line of a block body that matches the field, or -1. */
function fieldLine(lines, re) {
  for (let j = 1; j < lines.length; j++) if (re.test(lines[j])) return j;
  return -1;
}

/** A citation item: { key, hash } for `<key>@<8 hex>`, else { key: <item>, hash: null }. */
function parseCitation(item) {
  const m = CITATION.exec(item);
  return m ? { key: m[1], hash: m[2] } : { key: item, hash: null };
}

/** The Covers: lines of a file: [{ plan, file, part, ids }]. */
function parseCovers(text, file) {
  const out = [];
  const stem = stemOf(file);
  const planFile = file.endsWith('.plan.md');
  const inFence = fenceTracker();
  let part = null;
  let open = planFile;
  for (const l of splitLines(text)) {
    if (inFence(l)) continue;
    if (HEADING_1_3.test(l)) {
      const p = PLAN_PART.exec(l);
      if (p) part = Number(p[1]);
      else if (HEADING_1_2.test(l)) part = null;
      open = p !== null || (planFile && /^# /.test(l));
      continue;
    }
    const c = open ? COVERS.exec(l) : null;
    if (c) out.push({ plan: part !== null ? `${stem}#Part${part}` : stem, file, part, ids: items(c[1]) });
  }
  return out;
}

// ---- git ----

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
    });
  } catch {
    return null;
  }
}

/** True when the commit is an ancestor of the other commit (HEAD by default). A git error is false. */
function isAncestor(root, commit, of = 'HEAD') {
  if (typeof commit !== 'string' || !COMMIT.test(commit)) return false;
  return git(root, ['merge-base', '--is-ancestor', commit, of]) !== null;
}

/** For one file: Map '<key>@<hash>' -> the oldest commit of the history of HEAD that added it. */
function firstAdds(root, file) {
  const out = git(root, ['log', '--reverse', '--no-color', '--no-ext-diff', '--format=@@C %H', '-p', '--unified=0', '--', file]) ?? '';
  const first = new Map();
  let commit = null;
  let inHunk = false;
  for (const l of out.split('\n')) {
    if (l.startsWith('@@C ')) {
      commit = l.slice(4).trim();
      inHunk = false;
    } else if (l.startsWith('diff --git ')) {
      inHunk = false;
    } else if (l.startsWith('@@ ')) {
      inHunk = true;
    } else if (inHunk && l.startsWith('+')) {
      for (const m of l.matchAll(/([^\s,;`]+@[0-9a-f]{8})(?![0-9a-f])/g)) if (!first.has(m[1])) first.set(m[1], commit);
    }
  }
  return first;
}

function versionAtLeast(v, min) {
  const m = SEMVER.exec(typeof v === 'string' ? v : '');
  if (!m) return false;
  for (let i = 0; i < min.length; i++) {
    const n = Number(m[i + 1]);
    if (n !== min[i]) return n > min[i];
  }
  return true;
}

/** The install commit of section 3a: the first commit whose config has a guildaVersion of 0.3.0 or higher, or null. */
function installCommit(root) {
  const log = git(root, ['log', '--reverse', '--format=%H', '--', CONFIG_FILE]);
  if (log === null) return null;
  for (const c of log.split('\n').map((x) => x.trim()).filter(Boolean)) {
    if (!COMMIT.test(c)) continue;
    const text = git(root, ['show', `${c}:${CONFIG_FILE}`]);
    if (text === null) continue;
    try {
      if (versionAtLeast(JSON.parse(text).guildaVersion, R31_VERSION)) return c;
    } catch {
      // a bad config at that commit is not an install
    }
  }
  return null;
}

/** True only when git blame shows that the line comes from a commit older than the install commit (fails closed). */
function isLegacy(root, file, line, install) {
  if (!install) return false;
  const out = git(root, ['blame', '--porcelain', '-L', `${line},${line}`, '--', file]);
  const sha = out === null ? null : out.split(' ')[0];
  if (!sha || !COMMIT.test(sha) || ZERO_COMMIT.test(sha) || sha === install) return false;
  return isAncestor(root, sha, install);
}

// ---- Files ----

function listMd(root, rel) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...listMd(root, p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

/** The indexed files now, or at a commit: [{ file, text }]. */
function readFiles(root, at = null) {
  if (!at) return listMd(root, SPEC_DIR).map((file) => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') }));
  if (!COMMIT.test(at)) return [];
  const names = (git(root, ['ls-tree', '-r', '--name-only', at, '--', SPEC_DIR]) ?? '').split('\n').filter((f) => f.endsWith('.md'));
  return names.sort().map((file) => ({ file, text: git(root, ['show', `${at}:${file}`]) ?? '' }));
}

/** The blocks, keys and errors of a set of files. No git and no disk. */
function indexFiles(files) {
  const errors = [];
  const byStem = new Map();
  for (const { file } of files) {
    const s = stemOf(file);
    if (byStem.has(s)) errors.push({ kind: 'DUPLICATE-FILE', stem: s, where: [byStem.get(s), file] });
    else byStem.set(s, file);
  }
  const all = [];
  const covers = [];
  for (const { file, text } of files) {
    const bs = parseBlocks(text, file);
    covers.push(...parseCovers(text, file));
    const seen = new Map();
    const dup = new Set();
    for (const b of bs) {
      const k = b.planTask && b.part !== null ? `${b.id}/Part${b.part}` : b.id;
      if (seen.has(k)) {
        errors.push({ kind: 'DUPLICATE', id: b.id, where: [`${file}:${seen.get(k).start}`, `${file}:${b.start}`] });
        dup.add(k);
      } else seen.set(k, b);
    }
    for (const b of bs) {
      const k = b.planTask && b.part !== null ? `${b.id}/Part${b.part}` : b.id;
      if (!dup.has(k)) all.push(b);
    }
  }
  const filesOf = new Map();
  for (const b of all) {
    if (b.planTask) continue;
    if (!filesOf.has(b.id)) filesOf.set(b.id, new Set());
    filesOf.get(b.id).add(b.file);
  }
  const ambiguous = [...filesOf].filter(([, s]) => s.size > 1).map(([id]) => id).sort();
  const index = { blocks: Object.create(null), errors, ambiguous, covers };
  for (const b of all) {
    const key = keyOf(b, index);
    if (Object.hasOwn(index.blocks, key)) continue;
    index.blocks[key] = { ...b, owners: [], citers: [] };
  }
  return index;
}

// ---- The index ----

function journalCiters(root) {
  let events;
  let tasks;
  try {
    events = readJournal(root).events;
    tasks = readState(root).tasks ?? {};
  } catch {
    return [];
  }
  const last = new Map();
  for (const e of events) {
    if (e.type === 'dispatch' && e.check !== true && typeof e.task === 'string' && typeof e.address === 'string') last.set(e.task, e);
  }
  const out = [];
  for (const [task, e] of last) {
    const state = Object.hasOwn(tasks, task) ? tasks[task].state : null;
    if (state === 'done' || state === 'dead') continue;
    const uses = Array.isArray(e.uses) ? e.uses.filter((u) => typeof u === 'string') : typeof e.uses === 'string' ? items(e.uses) : [];
    const readCommit = isAncestor(root, e.baseCommit) ? e.baseCommit : null;
    for (const u of uses) out.push({ citer: `journal#${e.address}`, kind: 'dispatch', ...parseCitation(u), readCommit });
  }
  return out;
}

/**
 * Build the index of section 4d: { generator, builtAt, head, files, blocks, errors, ambiguous, covers, citations,
 * planTasks }. Each block has { id, file, start, end, title, hash, part, planTask, owners, citers }.
 */
export function buildIndex(projectDir) {
  const root = path.resolve(projectDir);
  const files = readFiles(root);
  const idx = indexFiles(files);
  const citations = [];
  const planTasks = [];
  const adds = new Map();
  for (const [key, b] of Object.entries(idx.blocks)) {
    if (!b.planTask) continue;
    const owns = fieldLine(b.lines, OWNS);
    if (owns >= 0) {
      for (const id of items(OWNS.exec(b.lines[owns])[1])) {
        const r = resolveKey(idx, id);
        if (r.key && !idx.blocks[r.key].owners.includes(key)) idx.blocks[r.key].owners.push(key);
      }
    }
    const uses = fieldLine(b.lines, USES);
    planTasks.push({ key, file: b.file, start: b.start, part: b.part, hasUses: uses >= 0, owns: owns >= 0 ? items(OWNS.exec(b.lines[owns])[1]) : [] });
    if (uses < 0) continue;
    if (!adds.has(b.file)) adds.set(b.file, firstAdds(root, b.file));
    for (const item of items(USES.exec(b.lines[uses])[1])) {
      const c = parseCitation(item);
      const readCommit = c.hash ? adds.get(b.file).get(`${c.key}@${c.hash}`) ?? null : null;
      citations.push({ citer: key, kind: 'plan', ...c, readCommit });
    }
  }
  citations.push(...journalCiters(root));
  for (const c of citations) {
    const r = c.hash ? resolveKey(idx, c.key) : { finding: 'UNKNOWN' };
    c.resolved = r.key ?? null;
    c.finding = r.finding ?? null;
    if (r.key) idx.blocks[r.key].citers.push({ citer: c.citer, hash: c.hash, readCommit: c.readCommit });
  }
  const head = (git(root, ['rev-parse', '--verify', '-q', 'HEAD']) ?? '').trim() || null;
  return {
    generator: GENERATOR,
    builtAt: new Date().toISOString(),
    head,
    files: files.map((f) => f.file),
    blocks: idx.blocks,
    errors: idx.errors,
    ambiguous: idx.ambiguous,
    covers: idx.covers,
    citations,
    planTasks,
  };
}

/** The index as it is written: no block lines, no inner fields. */
function serialize(idx) {
  const blocks = {};
  for (const [k, b] of Object.entries(idx.blocks)) {
    const { lines, stem, multiPart, ...rest } = b;
    blocks[k] = rest;
  }
  return { ...idx, blocks };
}

/** Write .guilda/trace/index.json through a temp file (random name, flag wx) and a rename. */
export function writeIndex(projectDir, idx) {
  const root = path.resolve(projectDir);
  const dir = path.join(root, '.guilda', 'trace');
  const file = path.join(root, INDEX_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.lstatSync(dir).isDirectory()) throw new Error(`io-error: ${dir}`);
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error(`io-error: ${file}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const tmp = path.join(dir, `index.json.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(serialize(idx), null, 1)}\n`, { flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // the temp file stays; the error below names the index
    }
    throw err;
  }
}

// ---- show and check ----

const indexCache = new Map();

/** The index of the files at a commit (cached for one process). */
function indexAt(root, commit) {
  const k = `${root}\0${commit}`;
  if (!indexCache.has(k)) indexCache.set(k, indexFiles(readFiles(root, commit)));
  return indexCache.get(k);
}

/** The block of a key at a commit. An ID that moved is found by its ID in another file. */
function blockAt(root, key, commit) {
  const idx = indexAt(root, commit);
  const r = resolveKey(idx, key);
  if (r.key) return idx.blocks[r.key];
  const m = KEY.exec(key);
  if (!m || m[2]) return null;
  const same = Object.values(idx.blocks).filter((b) => b.id === m[3] && !b.planTask);
  return same.length === 1 ? same[0] : null;
}

/** The text of the block of a key, now or at a commit, or null for an unknown key. Now, it adds the owners and citers. */
export function showBlock(projectDir, key, { at = null } = {}) {
  const root = path.resolve(projectDir);
  if (at !== null) {
    if (!COMMIT.test(at)) return null;
    const full = (git(root, ['rev-parse', '--verify', '-q', `${at}^{commit}`]) ?? '').trim();
    if (!COMMIT.test(full)) return null;
    const b = blockAt(root, key, full);
    return b ? b.lines.join('\n') : null;
  }
  const idx = buildIndex(root);
  const r = resolveKey(idx, key);
  if (!r.key) return null;
  const b = idx.blocks[r.key];
  return [
    ...b.lines,
    `owners: ${b.owners.join(', ') || 'none'}`,
    `citers: ${b.citers.map((c) => `${c.citer}@${c.hash}`).join(', ') || 'none'}`,
  ].join('\n');
}

const indent = (ls) => ls.map((l) => `  | ${l}`);

function suspectLines(root, c, now, short) {
  const out = [`SUSPECT ${c.citer} ${c.key} ${c.hash} → ${now.hash}`];
  const then = c.readCommit ? blockAt(root, c.key, c.readCommit) : null;
  if (!c.readCommit) out.push(`  ${READ_NOTE}`);
  if (then && short) {
    const o = new Set(then.lines);
    const n = new Set(now.lines);
    for (const l of then.lines) if (!n.has(l)) out.push(`  - ${l}`);
    for (const l of now.lines) if (!o.has(l)) out.push(`  + ${l}`);
  } else {
    if (then) out.push(`  --- then (${then.file}:${then.start}-${then.end} at ${c.readCommit.slice(0, HASH_LENGTH)})`, ...indent(then.lines));
    out.push(`  --- now (${now.file}:${now.start}-${now.end})`, ...indent(now.lines));
  }
  out.push(SUSPECT_END);
  return out;
}

const errorLine = (e) => (e.kind === 'DUPLICATE' ? `DUPLICATE ${e.id} ${e.where.join(',')}` : `DUPLICATE-FILE ${e.stem}`);

/**
 * The findings of the trace check: [{ kind, citer?, key?, lines }]. Kinds: DUPLICATE, DUPLICATE-FILE, UNKNOWN,
 * AMBIGUOUS, SUSPECT, NO-USES, LEGACY, NO-OWNER. `short` shows only the changed lines of a SUSPECT block.
 * `index` is a built index to reuse.
 */
export function check(projectDir, { short = false, index = null } = {}) {
  const root = path.resolve(projectDir);
  const idx = index ?? buildIndex(root);
  const findings = idx.errors.map((e) => ({ kind: e.kind, lines: [errorLine(e)] }));
  for (const c of idx.citations) {
    if (c.finding) {
      const shown = c.finding === 'AMBIGUOUS' ? KEY.exec(c.key)[3] : c.key;
      findings.push({ kind: c.finding, citer: c.citer, key: c.key, lines: [`${c.finding} ${c.citer} ${shown}`] });
      continue;
    }
    const now = idx.blocks[c.resolved];
    if (c.hash === now.hash) continue;
    findings.push({ kind: 'SUSPECT', citer: c.citer, key: c.key, lines: suspectLines(root, c, now, short) });
  }
  let install;
  for (const t of idx.planTasks) {
    if (t.hasUses) continue;
    if (install === undefined) install = installCommit(root);
    const kind = isLegacy(root, t.file, t.start, install) ? 'LEGACY' : 'NO-USES';
    findings.push({ kind, citer: t.key, lines: [`${kind} ${t.key}`] });
  }
  for (const cov of idx.covers) {
    const owned = new Set();
    for (const t of idx.planTasks) {
      if (t.file !== cov.file || (cov.part !== null && t.part !== cov.part)) continue;
      for (const o of t.owns) {
        owned.add(o);
        const m = KEY.exec(o);
        if (m) owned.add(m[3]);
      }
    }
    for (const id of cov.ids) {
      if (!owned.has(id)) findings.push({ kind: 'NO-OWNER', key: id, lines: [`NO-OWNER ${cov.plan} ${id}`] });
    }
  }
  return findings;
}

// ---- ack ----

export class TraceError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 1;
  }
}

/**
 * Write the hash now of `key` into the Uses: line of the plan task `citer`, then build the index again. It refuses
 * a citer that is not a plan task (a brief or a journal event), an unknown citer and an unknown key.
 */
export function ack(projectDir, citer, key) {
  const root = path.resolve(projectDir);
  const idx = buildIndex(root);
  if (String(citer).startsWith('journal#')) throw new TraceError(`not a plan task: ${citer}`);
  if (!Object.hasOwn(idx.blocks, citer)) throw new TraceError(`unknown citer: ${citer}`);
  const task = idx.blocks[citer];
  if (!task.planTask) throw new TraceError(`not a plan task: ${citer}`);
  const r = resolveKey(idx, key);
  if (!r.key) throw new TraceError(`unknown key: ${key}`);
  const hash = idx.blocks[r.key].hash;
  const file = path.join(root, task.file);
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const j = fieldLine(task.lines, USES);
  const at = j < 0 ? -1 : task.start - 1 + j;
  const item = new RegExp(`(^|[\\s,;\`])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:@[0-9a-f]{8})?(?=$|[\\s,;\`])`);
  if (at < 0 || !USES.test(lines[at]) || !item.test(lines[at].replace(/^[^:]*:/, ' '))) {
    throw new TraceError(`unknown key: ${key} is not in the Uses: line of ${citer}`);
  }
  const colon = lines[at].indexOf(':') + 1;
  lines[at] = lines[at].slice(0, colon) + lines[at].slice(colon).replace(item, `$1${key}@${hash}`);
  fs.writeFileSync(file, lines.join(eol));
  const next = buildIndex(root);
  writeIndex(root, next);
  return { key: r.key, hash, index: next };
}
