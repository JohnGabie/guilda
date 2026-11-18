import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SKILL_DIRS = ['agents', 'skills', 'core', 'hooks', 'plugins'];

/** Sorted relative file paths under dir (empty when dir is missing). */
function listFiles(dir, rel = '') {
  const here = path.join(dir, rel);
  if (!fs.existsSync(here)) return [];
  const out = [];
  for (const e of fs.readdirSync(here, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

function hashTree(update, base, files) {
  for (const f of files) {
    update(`${f}\0`);
    update(fs.readFileSync(path.join(base, f)));
    update('\0');
  }
}

/** sha256 of the sorted relative paths and bytes of each file in dir. */
export function hashDir(dir) {
  const h = crypto.createHash('sha256');
  hashTree((x) => h.update(x), dir, listFiles(dir));
  return h.digest('hex');
}

/** sha256 of the agents, skills, core, hooks and plugins files of a project. */
export function skillHash(projectDir) {
  const h = crypto.createHash('sha256');
  for (const d of SKILL_DIRS) {
    const base = path.join(projectDir, d);
    hashTree((x) => h.update(x), base, listFiles(base));
    h.update(`\0dir:${d}\0`);
  }
  return h.digest('hex');
}

/** Cache key: sha256 of the case hash, the skill hash and the arguments. */
export function cacheKey(caseHash, skill, args) {
  return crypto.createHash('sha256').update(JSON.stringify([caseHash, skill, args])).digest('hex');
}

export function cacheDir(projectDir) {
  return path.join(projectDir, '.guilda', 'eval-cache');
}

export function readEntry(projectDir, key) {
  try {
    const e = JSON.parse(fs.readFileSync(path.join(cacheDir(projectDir), `${key}.json`), 'utf8'));
    return e && e.exitCode === 0 && typeof e.output === 'string' ? e : null;
  } catch {
    return null;
  }
}

/** Write one entry by a temp file and a rename. */
export function writeEntry(projectDir, key, entry) {
  const dir = cacheDir(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${key}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(entry));
  fs.renameSync(tmp, path.join(dir, `${key}.json`));
}
