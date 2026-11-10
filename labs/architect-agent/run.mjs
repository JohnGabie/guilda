#!/usr/bin/env node
// Runs the Architect-agent scenario with headless Claude Code.
// Usage: node run.mjs <a|b> <out-dir> [token-cap]
//   a: one session that is the main session and the Architect.
//   b: a light main session plus a separate Architect session.
// Each call is `claude -p ... --output-format json`, and later calls use `--resume <session_id>`.
// The out dir gets the role files, one JSON file per call, and log.jsonl with the usage of each call.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, readdirSync, readlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [way, outArg, capArg] = process.argv.slice(2);
if (!['a', 'b'].includes(way) || !outArg) {
  console.error('usage: node run.mjs <a|b> <out-dir> [token-cap]');
  process.exit(2);
}
const out = resolve(outArg);
const cap = Number(capArg || 1500000);
const MODEL = 'sonnet';
const IGNORE_PIDS = new Set([603989, 603998]); // processes of the user that this lab must not touch

const scenario = JSON.parse(readFileSync(join(here, 'scenario.json'), 'utf8'));
const roles = readFileSync(join(here, 'roles.md'), 'utf8');
const skill = readFileSync(join(here, '..', '..', 'skills', 'architect', 'SKILL.md'), 'utf8');

function role(name) {
  const m = roles.split(/^## /m).find((s) => s.startsWith(name + '\n'));
  if (!m) throw new Error('no role ' + name);
  return m.slice(name.length + 1).trim();
}
function writeRole(name, withSkill) {
  const p = join(out, `role-${name}.md`);
  writeFileSync(p, role(name) + (withSkill ? '\n\n' + skill : '') + '\n');
  return p;
}

// Processes whose working directory is the out dir (the claude calls of this lab run there).
function labProcs() {
  const pids = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || IGNORE_PIDS.has(Number(d)) || Number(d) === process.pid) continue;
    try { if (readlinkSync(`/proc/${d}/cwd`) === out) pids.push(Number(d)); } catch { /* gone or not ours */ }
  }
  return pids;
}

const sessions = {};
let total = 0;
let n = 0;
function call(label, sessionKey, roleFile, text) {
  const args = ['-p', text, '--model', MODEL, '--output-format', 'json', '--tools', '',
    '--strict-mcp-config', '--setting-sources', 'project', '--disable-slash-commands',
    '--append-system-prompt-file', roleFile];
  if (sessions[sessionKey]) args.push('--resume', sessions[sessionKey]);
  const before = labProcs();
  const t0 = Date.now();
  const r = spawnSync('claude', args, { cwd: out, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const childAlive = existsSync(`/proc/${r.pid}`);
  const after = labProcs();
  n += 1;
  const file = `${String(n).padStart(2, '0')}-${way}-${sessionKey}-${label}.json`;
  writeFileSync(join(out, file), r.stdout || '');
  let j;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`bad output for ${label}: ${r.stderr}`); }
  if (j.is_error) throw new Error(`error for ${label}: ${j.result}`);
  sessions[sessionKey] = j.session_id;
  const u = j.usage;
  const context = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
  const tokens = context + u.output_tokens;
  total += tokens;
  const row = { n, way, session: sessionKey, turn: label, input: u.input_tokens, cacheRead: u.cache_read_input_tokens,
    cacheCreation: u.cache_creation_input_tokens, output: u.output_tokens, context, tokens, total,
    costUSD: j.total_cost_usd, ms, procsBefore: before.length, procsAfter: after.length, childAlive };
  appendFileSync(join(out, 'log.jsonl'), JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
  if (total > cap) {
    console.error(`STOP: token cap ${cap} passed (${total})`);
    process.exit(3);
  }
  return j.result;
}

// The short part of an Architect reply that the main session sees.
function shortPart(reply) {
  const i = reply.search(/^\**(QUESTION|SUMMARY):/m);
  return i < 0 ? reply.slice(-600) : reply.slice(i);
}

if (way === 'a') {
  const r = writeRole('architect-in-main', true);
  for (const t of scenario.turns) {
    const reply = call(t.id, 'one', r, t.text);
    writeFileSync(join(out, `reply-a-${t.id}.md`), reply);
  }
} else {
  const rArch = writeRole('architect-agent', true);
  const rMain = writeRole('light-main', false);
  for (const t of scenario.turns) {
    if (t.kind === 'chat') {
      writeFileSync(join(out, `reply-b-main-${t.id}.md`), call(t.id, 'main', rMain, t.text));
      continue;
    }
    const reply = call(t.id, 'arch', rArch, t.text);
    writeFileSync(join(out, `reply-b-arch-${t.id}.md`), reply);
    const handoff = `User: ${t.text}\n\n[You routed this message to the Architect. The Architect replied:]\n${shortPart(reply)}`;
    writeFileSync(join(out, `reply-b-main-${t.id}.md`), call(t.id, 'main', rMain, handoff));
  }
}
console.log(JSON.stringify({ way, sessions, total }));
