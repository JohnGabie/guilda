import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function currentBranch(projectDir) {
  try {
    const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const out = (r.stdout || '').trim();
    return r.status === 0 && out ? out : 'unknown';
  } catch {
    return 'unknown';
  }
}

const IGNORED = ['violations.jsonl', 'format-retries.json'];

/** Make .guilda/.gitignore list the hook state files. Adds missing lines, keeps the rest. Throws on I/O error. */
export function ensureIgnored(guildaDir) {
  const ignoreFile = path.join(guildaDir, '.gitignore');
  const existing = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8') : '';
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = IGNORED.filter((name) => !have.has(name));
  if (missing.length === 0) return;
  const lead = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(ignoreFile, lead + missing.join('\n') + '\n');
}

/**
 * Append one violation record to .guilda/violations.jsonl.
 * The record holds only ts, rule, level, source, action, branch. Never throws.
 */
export function appendViolation(projectDir, { rule, level, source, action }) {
  try {
    const dir = path.join(projectDir, '.guilda');
    fs.mkdirSync(dir, { recursive: true });
    ensureIgnored(dir);
    const record = {
      ts: new Date().toISOString(),
      rule,
      level,
      source,
      action,
      branch: currentBranch(projectDir),
    };
    fs.appendFileSync(path.join(dir, 'violations.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    // A hook must never crash the session.
  }
}

/** Count violations by rule ID. Malformed lines are skipped. */
export function countViolations(projectDir) {
  const counts = new Map();
  let text;
  try {
    text = fs.readFileSync(path.join(projectDir, '.guilda', 'violations.jsonl'), 'utf8');
  } catch {
    return counts;
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec && typeof rec.rule === 'string') {
        counts.set(rec.rule, (counts.get(rec.rule) || 0) + 1);
      }
    } catch {
      // skip malformed line
    }
  }
  return counts;
}
