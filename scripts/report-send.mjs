#!/usr/bin/env node
// Scan a field report for R19 hits, then send it as a GitHub issue with gh, or save it in .guilda/reports/ (D3).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scanText } from './lib/scan.mjs';
import { projectState, normalizeRepo, SETUP_NOTICE } from './lib/project.mjs';
import { ensureIgnored } from './lib/violations.mjs';

const TYPES = ['improvement', 'bug', 'feature', 'other'];
const SLUG_MAX = 40;
const EMPTY_SLUG = 'report';
const GH_TIMEOUT_MS = 60000;
const USAGE =
  'usage: node scripts/report-send.mjs <projectDir> <reportFile> --type <improvement|bug|feature|other> [--repo <owner/name>] [--date <YYYY-MM-DD>]';
const DATE_FORM = /^\d{4}-\d{2}-\d{2}$/;

const PLUGIN_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json');

function fail(line) {
  console.log(line);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type' || a === '--repo' || a === '--date') {
      if (i + 1 >= argv.length) fail(USAGE);
      flags[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      fail(USAGE);
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 2) fail(USAGE);
  return { projectDir: positional[0], reportFile: positional[1], ...flags };
}

/** The slug of a title: lower case, groups outside a-z and 0-9 become one -, at most 40 characters. */
export function slugOf(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug || EMPTY_SLUG;
}

function defaultRepo() {
  try {
    return normalizeRepo(JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).repository);
  } catch {
    return null;
  }
}

/** Write the full report to a free name in .guilda/reports/. Never writes over a file. Returns the path. */
function save(projectDir, text, date, type, title) {
  const guildaDir = path.join(projectDir, '.guilda');
  ensureIgnored(guildaDir);
  const dir = path.join(guildaDir, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const base = `${date}-${type}-${slugOf(title)}`;
  for (let n = 1; ; n++) {
    const file = path.join(dir, `${base}${n === 1 ? '' : `-${n}`}.md`);
    try {
      fs.writeFileSync(file, text, { flag: 'wx' });
      return file;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
    }
  }
}

/** Run gh. Returns the spawn result; a missing gh gives an error field. */
const gh = (args, input) =>
  spawnSync('gh', args, { encoding: 'utf8', input, timeout: GH_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'ignore'] });

/** Send with gh. Returns the issue URL, or null when gh is missing, not logged in, or fails. */
function send(repo, title, body, label) {
  const auth = gh(['auth', 'status'], '');
  if (auth.error || auth.status !== 0) return null;
  const args = ['issue', 'create', '--repo', repo, '--title', title, '--body-file', '-'];
  if (label) args.push('--label', label);
  const r = gh(args, body);
  if (r.error || r.status !== 0) return null;
  const lines = (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!TYPES.includes(opts.type)) fail(USAGE);
  if (opts.date !== undefined && !DATE_FORM.test(opts.date)) fail(USAGE);
  let flagRepo = null;
  if (opts.repo !== undefined) {
    flagRepo = normalizeRepo(opts.repo);
    if (flagRepo === null) fail('usage: --repo must be owner/name or a GitHub URL');
  }
  let text;
  try {
    text = fs.readFileSync(opts.reportFile, 'utf8');
  } catch {
    fail('usage: cannot read the report file');
  }
  const lines = text.split('\n');
  const first = lines[0].replace(/\r$/, '');
  const title = first.startsWith('# ') ? first.slice(2).trim() : '';
  if (!title) fail('usage: the first line of the report must be "# <title>"');

  const state = projectState(opts.projectDir);
  if (state.state === 'none') {
    console.log('refused: guilda is not set up');
    console.log(SETUP_NOTICE);
    process.exit(1);
  }

  const hits = scanText(text);
  if (hits.length > 0) {
    const first = [...hits].sort((a, b) => a.line - b.line)[0];
    fail(`refused: R19 ${first.kind} in line ${first.line}`);
  }

  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const fallback = defaultRepo();
  let target;
  if (flagRepo) {
    target = flagRepo;
  } else if (state.state === 'valid' && state.config.report && state.config.report.repo !== undefined) {
    target = normalizeRepo(state.config.report.repo);
  } else {
    target = fallback;
  }
  if (target === null) {
    console.log(`saved: ${save(opts.projectDir, text, date, opts.type, title)}`);
    return;
  }

  let start = 1;
  while (start < lines.length && lines[start].trim() === '') start++;
  const body = lines.slice(start).join('\n');
  const isDefault = target === fallback;
  const url = send(target, title, body, isDefault ? `report-${opts.type}` : null);
  if (url === null) {
    console.log(`saved: ${save(opts.projectDir, text, date, opts.type, title)}`);
    return;
  }
  console.log(`sent: ${url}`);
  if (!isDefault) console.log(`note: sent without a label, because ${target} is not the default repository`);
}

try {
  main();
} catch (err) {
  console.log(`error: ${err && err.message}`);
  process.exit(1);
}
