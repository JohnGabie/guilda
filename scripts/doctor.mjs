#!/usr/bin/env node
// Activation check (D2): one line for each check, '<check>: PASS|FAIL|UNKNOWN — <evidence>'.
// Exit 1 when a line is FAIL, else 0. It reads only; it writes no file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, projectState, SCHEMA_VERSION } from './lib/project.mjs';
import { compareSemver, installedVersion } from './lib/version.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_PREFIX = 'guilda:';
const OLD_SCHEMA = 1;

function parseArgs(argv) {
  const out = { projectDir: null, session: null, agents: null, newProject: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session' || a === '--agents') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `missing value for ${a}` };
      out[a === '--session' ? 'session' : 'agents'] = v;
    } else if (a === '--new-project') out.newProject = true;
    else if (a.startsWith('--')) return { error: `unknown flag ${a}` };
    else if (out.projectDir === null) out.projectDir = a;
    else return { error: `unexpected argument ${a}` };
  }
  return out;
}

function readMarker(projectDir, name) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(projectDir, '.guilda', name), 'utf8'));
    if (m && typeof m === 'object' && typeof m.sessionId === 'string') return m;
  } catch { /* no marker */ }
  return null;
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function coreLine() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (m.name === 'guilda') return ['PASS', `plugin.json has the name guilda, version ${m.version}`];
    return ['FAIL', `plugin.json has the name ${JSON.stringify(m.name)}, not guilda`];
  } catch (err) {
    return ['FAIL', `.claude-plugin/plugin.json is not readable: ${err.message}`];
  }
}

function hooksLine(a, hasGuilda, marker) {
  const at = marker ? marker.at ?? 'none' : 'none';
  if (!hasGuilda) return ['UNKNOWN', 'no .guilda folder; marker time none'];
  if (!marker) {
    if (a.newProject) return ['UNKNOWN', 'no marker yet; the session start writes it in the next session'];
    return ['FAIL', 'no .guilda/.hooks-live.json in a project that has a .guilda folder; the hooks did not run'];
  }
  if (a.session === null) return ['UNKNOWN', `no --session to compare; marker time ${at}`];
  if (marker.sessionId === a.session) return ['PASS', `.guilda/.hooks-live.json has this session (${marker.sessionId}, ${at})`];
  return ['UNKNOWN', `the marker is of another session (${marker.sessionId}); marker time ${at}`];
}

function agentsLine(a) {
  if (a.agents === null) return ['UNKNOWN', 'no --agents list given'];
  const have = new Set(a.agents.split(',').map((s) => s.trim()).filter((s) => s.startsWith(AGENT_PREFIX)).map((s) => s.slice(AGENT_PREFIX.length)));
  let files = [];
  try {
    files = fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  } catch { /* none */ }
  const missing = files.filter((f) => !have.has(f));
  if (missing.length === 0) return ['PASS', `the list has each agent of agents/ (${files.join(', ')})`];
  return ['FAIL', `the list misses ${missing.map((m) => AGENT_PREFIX + m).join(', ')}`];
}

function extensionLine(a, hasGuilda, hooksMarker) {
  const ext = hasGuilda ? readMarker(a.projectDir, '.extension-live.json') : null;
  const ref = a.session ?? (hooksMarker ? hooksMarker.sessionId : null);
  if (!hasGuilda || ref === null) return ['UNKNOWN', `no session to compare; marker time ${ext ? ext.at ?? 'none' : 'none'}`];
  if (!ext && a.newProject) return ['UNKNOWN', 'no marker yet; the session start writes it in the next session'];
  if (ext && ext.sessionId === ref) return ['PASS', `.guilda/.extension-live.json has this session (${ref}, ${ext.at ?? 'none'})`];
  return ['FAIL', `no marker of this session (${ref}) in .guilda/.extension-live.json; the extension guilda-skills did not load. Check skill-creator and superpowers and their marketplaces`];
}

function filesLine(a, state) {
  if (state.state === 'none') return ['FAIL', 'no .guilda folder'];
  if (state.state === 'broken') return ['FAIL', state.reason];
  if (!isFile(path.join(a.projectDir, '.guilda', 'rules.md'))) return ['FAIL', '.guilda/rules.md is missing'];
  return ['PASS', '.guilda/config.json is valid and .guilda/rules.md exists'];
}

function versionLine(a, state) {
  if (state.state !== 'valid') return ['UNKNOWN', 'no config to compare'];
  const installed = installedVersion(PLUGIN_ROOT);
  const c = state.config;
  // projectState migrates in memory, so the schema on disk comes from the raw config.
  const raw = loadConfig(a.projectDir);
  const schema = (raw && raw.ok && raw.config.schemaVersion) || OLD_SCHEMA;
  const older = [];
  if (compareSemver(c.guildaVersion, installed) < 0) older.push(`guildaVersion ${c.guildaVersion} is lower than installed ${installed}`);
  if (schema < SCHEMA_VERSION) older.push(`schemaVersion ${schema} is lower than ${SCHEMA_VERSION}`);
  if (older.length) return ['UNKNOWN', `${older.join('; ')}. Run guilda:update`];
  return ['PASS', `installed ${installed}, guildaVersion ${c.guildaVersion}, schemaVersion ${schema}`];
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.error || a.projectDir === null) {
    process.stderr.write((a.error ? `${a.error}; ` : '') + 'usage: node scripts/doctor.mjs <projectDir> [--session <id>] [--agents <name,name,...>] [--new-project]\n');
    process.exit(2);
  }
  const hasGuilda = isDir(path.join(a.projectDir, '.guilda'));
  const hooksMarker = hasGuilda ? readMarker(a.projectDir, '.hooks-live.json') : null;
  const state = projectState(a.projectDir);
  const rows = [
    ['core plugin loaded', coreLine()],
    ['hooks live', hooksLine(a, hasGuilda, hooksMarker)],
    ['guilda:* agents present', agentsLine(a)],
    ['extension plugin loaded', extensionLine(a, hasGuilda, hooksMarker)],
    ['project files present', filesLine(a, state)],
    ['version', versionLine(a, state)],
  ];
  process.stdout.write(rows.map(([n, [s, e]]) => `${n}: ${s} — ${e}`).join('\n') + '\n');
  process.exit(rows.some(([, [s]]) => s === 'FAIL') ? 1 : 0);
}

main();
