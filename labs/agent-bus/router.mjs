#!/usr/bin/env node
// Lab router for the agent bus. No dependencies.
//
// Files (all under <labdir>/.guilda/):
//   bus/<address>.jsonl  append-only mailbox. One message on each line:
//                        {id, from, to, task, type, text, reply_to, time}
//   bindings.json        address -> {tool: "claude" | "codex", session}
//
// Only the router writes these files. Agents do not need write access.
//
// Commands:
//   create  <labdir> <address> <claude|codex> <prompt> [--post-to <address>] [--task <task>]
//           Start a new session, bind it to <address>. With --post-to, the
//           answer of the agent is sent as a message to that address.
//   deliver <labdir> <address>
//           Deliver the oldest pending message in the mailbox of <address>:
//           resume the bound session with the message, then append the answer
//           as a reply (reply_to = message id) to the mailbox of the sender.
//   show    <labdir>
//           Print all mailboxes and bindings.
//
// A message is pending when no message in any mailbox has reply_to = its id.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 180_000;

function busDir(labdir) { return path.join(labdir, '.guilda', 'bus'); }
function bindingsFile(labdir) { return path.join(labdir, '.guilda', 'bindings.json'); }

function readBindings(labdir) {
  try { return JSON.parse(fs.readFileSync(bindingsFile(labdir), 'utf8')); } catch { return {}; }
}

function writeBindings(labdir, b) {
  fs.mkdirSync(path.dirname(bindingsFile(labdir)), { recursive: true });
  fs.writeFileSync(bindingsFile(labdir), JSON.stringify(b, null, 2) + '\n');
}

function readMailbox(labdir, address) {
  const f = path.join(busDir(labdir), `${address}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function allMessages(labdir) {
  const d = busDir(labdir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => readMailbox(labdir, f.slice(0, -'.jsonl'.length)));
}

function append(labdir, msg) {
  fs.mkdirSync(busDir(labdir), { recursive: true });
  fs.appendFileSync(path.join(busDir(labdir), `${msg.to}.jsonl`), JSON.stringify(msg) + '\n');
  return msg;
}

function newMessage({ from, to, task, type, text, reply_to = null }) {
  return { id: randomUUID(), from, to, task, type, text, reply_to, time: new Date().toISOString() };
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Run one child process with a timeout. Records the pid and checks that it is gone after.
function run(cmd, args, { cwd, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    const pid = child.pid;
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, TIMEOUT_MS);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      const aliveAfter = isAlive(pid);
      process.stderr.write(`[router] child ${cmd} pid=${pid} exit=${code} timedOut=${timedOut} aliveAfter=${aliveAfter}\n`);
      if (timedOut) return reject(new Error(`${cmd} timed out after ${TIMEOUT_MS} ms`));
      if (code !== 0) return reject(new Error(`${cmd} exit ${code}: ${err.slice(-500)}`));
      resolve({ out, pid, aliveAfter });
    });
    if (input !== undefined) { child.stdin.end(input); }
  });
}

function parseClaude(out) {
  const j = JSON.parse(out);
  if (j.is_error) throw new Error(`claude error: ${j.result}`);
  return { session: j.session_id, text: String(j.result).trim() };
}

function parseCodex(out) {
  let session = null;
  let text = null;
  for (const line of out.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'thread.started') session = e.thread_id;
    if (e.type === 'item.completed' && e.item && e.item.type === 'agent_message') text = e.item.text;
  }
  if (!text) throw new Error('codex: no agent_message in output');
  return { session, text: text.trim() };
}

async function callAgent(labdir, tool, session, prompt) {
  if (tool === 'claude') {
    // No tools and no MCP servers: the agent only answers. The router carries the messages.
    // "--tools" takes many values, so it must come before another option.
    const args = ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--output-format', 'json'];
    if (session) args.push('--resume', session);
    const r = await run('claude', args, { cwd: labdir, input: prompt });
    return { ...parseClaude(r.out), pid: r.pid, aliveAfter: r.aliveAfter };
  }
  if (tool === 'codex') {
    const args = session
      ? ['exec', 'resume', '--json', '--skip-git-repo-check', session, prompt]
      : ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', labdir, prompt];
    const r = await run('codex', args, { cwd: labdir });
    return { ...parseCodex(r.out), pid: r.pid, aliveAfter: r.aliveAfter };
  }
  throw new Error(`unknown tool: ${tool}`);
}

async function create(labdir, address, tool, prompt, opts) {
  const r = await callAgent(labdir, tool, null, prompt);
  const b = readBindings(labdir);
  b[address] = { tool, session: r.session };
  writeBindings(labdir, b);
  const result = { address, tool, session: r.session, answer: r.text, pid: r.pid, aliveAfter: r.aliveAfter };
  if (opts.postTo) {
    result.posted = append(labdir, newMessage({
      from: address, to: opts.postTo, task: opts.task || 'none', type: 'request', text: r.text,
    }));
  }
  return result;
}

async function deliver(labdir, address) {
  const binding = readBindings(labdir)[address];
  if (!binding) throw new Error(`no binding for ${address}`);
  const answered = new Set(allMessages(labdir).map((m) => m.reply_to).filter(Boolean));
  const msg = readMailbox(labdir, address).find((m) => !answered.has(m.id));
  if (!msg) return { address, delivered: null };
  const prompt = [
    `Message for you (${address}) through the guilda bus.`,
    `From: ${msg.from}. Type: ${msg.type}. Message id: ${msg.id}.` + (msg.reply_to ? ` It answers your message ${msg.reply_to}.` : ''),
    '',
    msg.text,
    '',
    'Your reply is sent back to the sender. Write only the reply text.',
  ].join('\n');
  const r = await callAgent(labdir, binding.tool, binding.session, prompt);
  if (r.session && r.session !== binding.session) {
    process.stderr.write(`[router] warning: session changed ${binding.session} -> ${r.session}\n`);
  }
  const reply = append(labdir, newMessage({
    from: address, to: msg.from, task: msg.task, type: 'reply', text: r.text, reply_to: msg.id,
  }));
  return { address, delivered: msg.id, session: r.session, reply, pid: r.pid, aliveAfter: r.aliveAfter };
}

function show(labdir) {
  const d = busDir(labdir);
  const out = { bindings: readBindings(labdir), mailboxes: {} };
  if (fs.existsSync(d)) {
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.jsonl')).sort()) {
      out.mailboxes[f] = readMailbox(labdir, f.slice(0, -'.jsonl'.length));
    }
  }
  return out;
}

async function main() {
  const [cmd, labdir, ...rest] = process.argv.slice(2);
  if (!cmd || !labdir) {
    process.stderr.write('usage: router.mjs create|deliver|show <labdir> ...\n');
    process.exit(2);
  }
  const opts = {};
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--post-to') opts.postTo = rest[++i];
    else if (rest[i] === '--task') opts.task = rest[++i];
    else pos.push(rest[i]);
  }
  let result;
  if (cmd === 'create') result = await create(labdir, pos[0], pos[1], pos[2], opts);
  else if (cmd === 'deliver') result = await deliver(labdir, pos[0]);
  else if (cmd === 'show') result = show(labdir);
  else throw new Error(`unknown command: ${cmd}`);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((e) => { process.stderr.write(`[router] ${e.message}\n`); process.exit(1); });
