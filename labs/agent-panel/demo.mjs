#!/usr/bin/env node
// Demo for the agent panel mod (lab check M3). No dependencies.
//
// Usage: node demo.mjs <project dir>
//
// Writes <project dir>/.guilda/bindings.json and .guilda/queue.json the way the
// lab router does, with two agents:
//   T1-exe-<rand>  codex   running for the whole Codex run (about 20 s: the
//                          prompt sleeps 20 s), then done (or failed)
//   T1-arc-<rand>  claude  review (no process: it only shows the second tool;
//                          the mod skips Claude bindings in its rows)
// Each binding carries the optional `role` (executor, architect) and `title`
// (the task's title) that the mod draws as `guilda:<role>-<tool>  <title>`.
// The Codex run is `codex exec --json --skip-git-repo-check -s read-only -C <dir>`
// with stdin from /dev/null and a 120 s timeout. Each `turn.completed` event's
// `usage` (input + output tokens) is written to the binding's optional `tokens`
// field while the agent is still running. It never deletes files: it
// keeps the other entries of both files and only adds or updates its own.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 120_000;
const PROMPT = 'Run the shell command: sleep 20. Then reply with only: DEMO-DONE';
const TITLE = 'Run the agent panel live demo';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function setAgent(dir, address, entry) {
  const file = path.join(dir, '.guilda', 'bindings.json');
  const bindings = readJson(file, {});
  const next = typeof bindings === 'object' && bindings !== null && !Array.isArray(bindings) ? bindings : {};
  next[address] = { ...next[address], ...entry, updated: new Date().toISOString() };
  writeJson(file, next);
  process.stderr.write(`[demo] ${address}: ${next[address].tool} ${next[address].state}\n`);
}

function setTask(dir, task) {
  const file = path.join(dir, '.guilda', 'queue.json');
  const queue = readJson(file, []);
  const list = Array.isArray(queue) ? queue : [];
  const at = list.findIndex((one) => one && one.id === task.id);
  if (at === -1) list.push(task); else list[at] = { ...list[at], ...task };
  writeJson(file, list);
}

// Tokens of one `usage` object of `turn.completed`: input plus output.
function usageTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = Number.isFinite(usage.input_tokens) ? usage.input_tokens : 0;
  const output = Number.isFinite(usage.output_tokens) ? usage.output_tokens : 0;
  return input + output;
}

// onTokens(total) runs on each `turn.completed`, with the sum over turns so far.
function runCodex(dir, onTokens) {
  return new Promise((resolve) => {
    const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', dir, PROMPT];
    // stdin 'ignore' is /dev/null: Codex waits for stdin otherwise.
    const child = spawn('codex', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let pending = '';
    let tokens = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, TIMEOUT_MS);
    child.stdout.on('data', (c) => {
      out += c;
      pending += c;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        const used = e.type === 'turn.completed' ? usageTokens(e.usage) : null;
        if (used !== null) { tokens += used; onTokens(tokens); }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, why: error.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let session = null;
      let text = null;
      for (const line of out.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'thread.started') session = e.thread_id;
        if (e.type === 'item.completed' && e.item && e.item.type === 'agent_message') text = e.item.text;
      }
      const ok = !timedOut && code === 0 && typeof text === 'string' && text.includes('DEMO-DONE');
      resolve({ ok, code, timedOut, session, text, tokens, pid: child.pid });
    });
  });
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write('usage: demo.mjs <project dir>\n');
    process.exit(2);
  }
  const root = path.resolve(dir);
  const rand = randomBytes(3).toString('hex');
  const exe = `T1-exe-${rand}`;
  const arc = `T1-arc-${rand}`;

  setAgent(root, arc, { tool: 'claude', role: 'architect', title: TITLE, session: null, state: 'review' });
  setAgent(root, exe, { tool: 'codex', role: 'executor', title: TITLE, session: null, state: 'running' });
  setTask(root, { id: `T1-${rand}`, title: TITLE, state: 'running', agent: exe });

  const started = Date.now();
  // The agent stays `running` until Codex exits; only `tokens` moves meanwhile.
  const r = await runCodex(root, (tokens) => setAgent(root, exe, { tool: 'codex', state: 'running', tokens }));
  const state = r.ok ? 'done' : 'failed';
  setAgent(root, exe, { tool: 'codex', session: r.session ?? null, state, tokens: r.tokens });
  setTask(root, { id: `T1-${rand}`, state, agent: exe });

  process.stdout.write(JSON.stringify({ exe, arc, state, seconds: Math.round((Date.now() - started) / 1000), ...r }, null, 2) + '\n');
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => { process.stderr.write(`[demo] ${e.message}\n`); process.exit(1); });
