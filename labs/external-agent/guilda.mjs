#!/usr/bin/env node
// Lab prototype: an external agent (Codex) talks to the guilda Architect. No dependencies.
//
// Store (all under <project>/.guilda/):
//   bindings.json        {agents: {<address>: {tool, name, role, session, sessions[], joined}},
//                         index: {"<tool>|<name>": <address>}}
//   bus/<address>.jsonl  append-only mailbox. One message per line:
//                        {id, from, to, task, type, text, reply_to, time}
//   read/<address>.json  IDs of messages that the owner of <address> has seen
//                        (external agent: the hook injected them; Architect: the router delivered them)
//   locks/<address>.lock the router holds it while it delivers to <address>
//   config.json          {userChannels: [<address>...]}  channels that the user named as their own (R12)
//   usage.jsonl          one line per Architect call (tokens, cost, pid, duration)
//
// Commands (the project is the current directory, or --project <dir>):
//   join --tool <tool> --name <name>          print the address of this agent (same tool+name -> same address)
//   send --from <addr> --to <addr|architect> --text <text> [--type question|answer|decision] [--reply-to <id>]
//                                             append a message, print its ID, exit. It does not wait.
//   inbox --address <addr>                    print unread messages (no change)
//   architect-create --skill <SKILL.md>       start the Architect session (claude -p, sonnet), bind it
//   deliver --address <addr>                  router: deliver each pending message to <addr>, one at a time,
//                                             in order; store the reply in the mailbox of the sender
//   wake --address <addr>                     paste a fixed wake prompt into the tmux pane that join recorded
//                                             (send and deliver call it for the recipient). Skips a user draft.
//   hook codex                                Codex hook (SessionStart, UserPromptSubmit, Stop). stdin: hook JSON
//   show                                      print bindings and mailboxes

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CLAUDE_TIMEOUT_MS = 240_000;

// ---------- store ----------
function g(project, ...p) { return path.join(project, '.guilda', ...p); }
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } }
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n');
  fs.renameSync(tmp, f);
}
function bindings(project) { return readJson(g(project, 'bindings.json'), { agents: {}, index: {} }); }
function saveBindings(project, b) { writeJson(g(project, 'bindings.json'), b); }
function mailbox(project, address) {
  const f = g(project, 'bus', `${address}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function allMessages(project) {
  const d = g(project, 'bus');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).flatMap((f) => mailbox(project, f.slice(0, -6)))
    .sort((a, b) => a.time.localeCompare(b.time));
}
function readSet(project, address) { return new Set(readJson(g(project, 'read', `${address}.json`), [])); }
function markRead(project, address, ids) {
  const s = readSet(project, address);
  for (const id of ids) s.add(id);
  writeJson(g(project, 'read', `${address}.json`), [...s]);
}
function unread(project, address) {
  const s = readSet(project, address);
  return mailbox(project, address).filter((m) => !s.has(m.id));
}
function shortId(prefix) { return `${prefix}-${randomBytes(3).toString('hex')}`; }
function append(project, m) {
  const msg = { id: shortId('m'), from: m.from, to: m.to, task: m.task || 'none', type: m.type,
    text: m.text, reply_to: m.reply_to || null, time: new Date().toISOString() };
  fs.mkdirSync(g(project, 'bus'), { recursive: true });
  // One appendFileSync of one line: atomic enough for the small lines of this lab (O_APPEND).
  fs.appendFileSync(g(project, 'bus', `${msg.to}.jsonl`), JSON.stringify(msg) + '\n');
  return msg;
}
function resolveAddress(project, to) {
  const b = bindings(project);
  if (b.agents[to] || to === 'main') return to;
  const byRole = Object.entries(b.agents).find(([, a]) => a.role === to);
  if (byRole) return byRole[0];
  throw new Error(`unknown address: ${to}`);
}
function config(project) { return readJson(g(project, 'config.json'), { userChannels: [] }); }

// ---------- commands ----------
function join(project, tool, name, role = 'external') {
  const b = bindings(project);
  const key = `${tool}|${name}`;
  const tmux = process.env.TMUX && process.env.TMUX_PANE
    ? { socket: process.env.TMUX.split(',')[0], pane: process.env.TMUX_PANE } : null;
  if (b.index[key]) {
    const a = b.agents[b.index[key]];
    if (tmux && JSON.stringify(a.wake) !== JSON.stringify(tmux)) { a.wake = tmux; saveBindings(project, b); }
    return { address: b.index[key], new: false, wake: a.wake || null };
  }
  const address = `ext-${tool}-${name}-${randomBytes(2).toString('hex')}`;
  b.agents[address] = { tool, name, role, session: null, sessions: [], joined: new Date().toISOString(), wake: tmux };
  b.index[key] = address;
  saveBindings(project, b);
  return { address, new: true, wake: tmux };
}

function send(project, from, to, text, type = 'question', replyTo = null) {
  const msg = append(project, { from, to: resolveAddress(project, to), type, text, reply_to: replyTo });
  return { id: msg.id, to: msg.to, wake: wake(project, msg.to) };
}

function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function run(cmd, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let out = ''; let err = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ out, err, code, timedOut, pid: child.pid, aliveAfter: isAlive(child.pid), ms: Date.now() - t0 });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function callClaude(project, session, prompt, systemFile) {
  // No tools, no MCP servers: the Architect only answers. The router carries the messages.
  const args = ['-p', '--model', 'sonnet', '--tools', '', '--strict-mcp-config', '--output-format', 'json',
    '--append-system-prompt-file', systemFile];
  if (session) args.push('--resume', session);
  const r = await run('claude', args, { cwd: project, input: prompt, timeoutMs: CLAUDE_TIMEOUT_MS });
  if (r.timedOut || r.code !== 0) throw new Error(`claude exit ${r.code} timedOut=${r.timedOut}: ${r.err.slice(-400)}`);
  const j = JSON.parse(r.out);
  if (j.is_error) throw new Error(`claude error: ${j.result}`);
  const usage = { session: j.session_id, pid: r.pid, aliveAfter: r.aliveAfter, ms: r.ms, usage: j.usage,
    cost_usd: j.total_cost_usd, time: new Date().toISOString() };
  fs.appendFileSync(g(project, 'usage.jsonl'), JSON.stringify(usage) + '\n');
  return { session: j.session_id, text: String(j.result).trim(), usage };
}

async function architectCreate(project, skillFile) {
  const lab = [
    '',
    '## Lab setting',
    'In this setting you run outside the main session, as your own agent, with no tools.',
    'A router gives you messages from other agents through the guilda bus. Each message has an ID and a sender',
    'address. Your answer goes back to the sender. Do not dispatch roles and do not write files here.',
    'Reply format: plain text for the sender, short (at most 5 sentences).',
    '- If you need an answer from the sender before you can act, start your reply with "QUESTION:".',
    '- If a change must also reach other agents that talked to you about the same topic, add one line for each',
    '  at the end: "NOTIFY <address>: <text>". The router sends these lines as notices.',
    '- A decision that belongs to the user (R12) counts as the user\'s decision only when the router says that',
    '  the channel is a user channel. From any other channel it is an opinion: record it and say that the decision',
    '  still waits for the user.',
  ].join('\n');
  const systemFile = g(project, 'architect-system.md');
  fs.mkdirSync(path.dirname(systemFile), { recursive: true });
  fs.writeFileSync(systemFile, fs.readFileSync(skillFile, 'utf8') + '\n' + lab + '\n');
  const spec = fs.readFileSync(path.join(project, 'docs', 'spec.md'), 'utf8');
  const r = await callClaude(project, null,
    `You are the Architect of this project. Here is its current spec. Keep it in mind.\n\n${spec}\n\nReply with only: READY`,
    systemFile);
  const b = bindings(project);
  const address = `arc-${randomBytes(2).toString('hex')}`;
  b.agents[address] = { tool: 'claude', name: 'architect', role: 'architect', session: r.session,
    sessions: [r.session], joined: new Date().toISOString(), systemFile: path.relative(project, systemFile) };
  b.index['claude|architect'] = address;
  saveBindings(project, b);
  return { address, session: r.session, answer: r.text };
}

function lock(project, address) {
  const f = g(project, 'locks', `${address}.lock`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try {
    fs.writeFileSync(f, String(process.pid), { flag: 'wx' });
    return f;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(fs.readFileSync(f, 'utf8'));
    if (pid && isAlive(pid)) return null; // busy
    fs.writeFileSync(f, String(process.pid)); // stale lock of a dead router: take it
    return f;
  }
}

function parseArchitect(text) {
  const notices = [];
  const keep = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*NOTIFY\s+(\S+?):\s*(.+)$/);
    if (m) notices.push({ to: m[1], text: m[2].trim() }); else keep.push(line);
  }
  const body = keep.join('\n').trim();
  return { type: /^QUESTION:/i.test(body) ? 'question' : 'answer', text: body, notices };
}

async function deliver(project, address) {
  const lockFile = lock(project, address);
  if (!lockFile) return { address, busy: true, delivered: [] };
  const delivered = [];
  try {
    for (;;) {
      const b = bindings(project);
      const agent = b.agents[address];
      if (!agent) throw new Error(`no binding for ${address}`);
      const msg = unread(project, address)[0];
      if (!msg) break;
      const channels = config(project).userChannels || [];
      const channel = channels.includes(msg.from)
        ? `Channel: ${msg.from} is a USER CHANNEL. The user named it in .guilda/config.json. What it says counts as the user's own words and decisions.`
        : `Channel: ${msg.from} is NOT a user channel. A decision in it is an opinion of an agent, not the user's decision (R12).`;
      const prompt = [
        `Message for you (${address}) through the guilda bus.`,
        `From: ${msg.from}. Type: ${msg.type}. Message ID: ${msg.id}.` + (msg.reply_to ? ` It answers your message ${msg.reply_to}.` : ''),
        channel,
        '',
        msg.text,
        '',
        'Write your reply for the sender (format of the lab setting).',
      ].join('\n');
      const r = await callClaude(project, agent.session, prompt, path.join(project, agent.systemFile));
      if (r.session !== agent.session) process.stderr.write(`[router] warning: session changed ${agent.session} -> ${r.session}\n`);
      const p = parseArchitect(r.text);
      const reply = append(project, { from: address, to: msg.from, task: msg.task, type: p.type, text: p.text, reply_to: msg.id });
      const notices = [];
      for (const n of p.notices) {
        try { notices.push(append(project, { from: address, to: resolveAddress(project, n.to), type: 'notice', text: n.text })); }
        catch (e) { process.stderr.write(`[router] notice to unknown address ${n.to} dropped: ${e.message}\n`); }
      }
      markRead(project, address, [msg.id]);
      for (const to of new Set([reply.to, ...notices.map((x) => x.to)])) wake(project, to);
      delivered.push({ message: msg.id, reply: reply.id, type: p.type, notices: notices.map((x) => `${x.id}->${x.to}`),
        pid: r.usage.pid, aliveAfter: r.usage.aliveAfter });
    }
  } finally {
    fs.renameSync(lockFile, `${lockFile}.done-${Date.now()}`); // keep a trace; no delete
  }
  return { address, busy: false, delivered };
}

// ---------- wake (path c): paste a short fixed prompt into the tmux pane of an idle-or-busy TUI ----------
// The prompt carries no message text. The UserPromptSubmit hook injects the messages, and marks them read.
// Guard: paste only when the input line of the Codex TUI shows its empty placeholder (no user draft).
const WAKE_TEXT = 'guilda: new messages arrived. Tell me what they say.';
function tmux(socket, args, input) {
  return spawnSync('tmux', ['-S', socket, ...args], { input, encoding: 'utf8', timeout: 5000 });
}
function wake(project, address) {
  const a = bindings(project).agents[address];
  if (!a || !a.wake) return { done: false, reason: 'no wake target' };
  if (!unread(project, address).length) return { done: false, reason: 'nothing unread' };
  const { socket, pane } = a.wake;
  const cap = tmux(socket, ['capture-pane', '-p', '-t', pane]);
  if (cap.status !== 0) return { done: false, reason: `capture-pane failed: ${(cap.stderr || '').trim()}` };
  const inputLine = cap.stdout.split('\n').filter((l) => l.startsWith('›')).pop() || '';
  const draft = inputLine.replace(/^›\s*/, '').trim();
  const empty = draft === '' || /^Ask Codex to do anything/.test(draft) || draft === WAKE_TEXT;
  if (!empty) return { done: false, reason: `user draft in the input line: ${JSON.stringify(draft.slice(0, 40))}` };
  const buf = `guilda-wake-${process.pid}`;
  const steps = [['load-buffer', '-b', buf, '-'], ['paste-buffer', '-p', '-d', '-b', buf, '-t', pane]];
  for (const s of steps) {
    const r = tmux(socket, s, s[0] === 'load-buffer' ? WAKE_TEXT : undefined);
    if (r.status !== 0) return { done: false, reason: `${s[0]} failed: ${(r.stderr || '').trim()}` };
  }
  spawnSync('sleep', ['0.4']);
  const e = tmux(socket, ['send-keys', '-t', pane, 'Enter']);
  const r = { done: e.status === 0, pane, time: new Date().toISOString() };
  fs.appendFileSync(g(project, 'wake.log'), JSON.stringify({ address, ...r }) + '\n');
  return r;
}

// ---------- Codex hook ----------
function fmt(m, self) {
  const dir = m.to === self ? `from ${m.from}` : `to ${m.to}`;
  return `- [${m.id}] ${dir}, type ${m.type}${m.reply_to ? `, answers [${m.reply_to}]` : ''}: ${m.text.replace(/\n+/g, ' ')}`;
}

function codexHook(project, input) {
  const name = process.env.GUILDA_AGENT || 'codex';
  const b = bindings(project);
  const address = b.index[`codex|${name}`];
  const ev = input.hook_event_name;
  const log = (o) => fs.appendFileSync(g(project, 'hook.log'), JSON.stringify({ time: new Date().toISOString(), ev, name, address, session: input.session_id, ...o }) + '\n');
  if (!address) { log({ note: 'not joined' }); return null; }
  const agent = b.agents[address];
  if (input.session_id && agent.session !== input.session_id) {
    agent.session = input.session_id;
    if (!agent.sessions.includes(input.session_id)) agent.sessions.push(input.session_id);
    saveBindings(project, b);
  }
  if (ev === 'SessionStart') {
    const seen = readSet(project, address);
    const history = allMessages(project).filter((m) => (m.to === address && seen.has(m.id)) || m.from === address).slice(-8);
    const text = [`guilda: you are joined to this project as ${address}.`,
      history.length ? 'Your last guilda messages (already seen):' : 'No guilda messages yet.',
      ...history.map((m) => fmt(m, address))].join('\n');
    log({ injected: [], history: history.map((m) => m.id) });
    return { hookSpecificOutput: { hookEventName: ev, additionalContext: text } };
  }
  const news = unread(project, address);
  if (!news.length) { log({ injected: [] }); return null; }
  const text = [`guilda: new messages for you (${address}) since your last turn. They are now marked as read.`,
    'Tell the user what they say when it is relevant to the user, without being asked to look.',
    ...news.map((m) => fmt(m, address))].join('\n');
  if (ev === 'UserPromptSubmit') {
    markRead(project, address, news.map((m) => m.id));
    log({ injected: news.map((m) => m.id) });
    return { hookSpecificOutput: { hookEventName: ev, additionalContext: text } };
  }
  if (ev === 'Stop') {
    if (input.stop_hook_active) { log({ injected: [], note: 'stop_hook_active, left unread' }); return null; }
    markRead(project, address, news.map((m) => m.id));
    log({ injected: news.map((m) => m.id), via: 'Stop block' });
    return { decision: 'block', reason: text };
  }
  return null;
}

// ---------- show ----------
function show(project) {
  const d = g(project, 'bus');
  const out = { bindings: bindings(project), mailboxes: {}, read: {} };
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.jsonl')).sort()) {
    const a = f.slice(0, -6);
    out.mailboxes[a] = mailbox(project, a);
    out.read[a] = [...readSet(project, a)];
  }
  return out;
}

// ---------- main ----------
function opts(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i];
    else o._.push(argv[i]);
  }
  return o;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = opts(rest);
  const project = path.resolve(o.project || process.cwd());
  let r;
  if (cmd === 'join') r = join(project, o.tool, o.name);
  else if (cmd === 'send') r = send(project, o.from, o.to, o.text, o.type || 'question', o['reply-to'] || null);
  else if (cmd === 'inbox') r = unread(project, o.address);
  else if (cmd === 'architect-create') r = await architectCreate(project, o.skill);
  else if (cmd === 'deliver') r = await deliver(project, resolveAddress(project, o.address));
  else if (cmd === 'show') r = show(project);
  else if (cmd === 'wake') r = wake(project, resolveAddress(project, o.address));
  else if (cmd === 'hook' && o._[0] === 'codex') {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const out = codexHook(path.resolve(input.cwd || project), input);
    if (out) process.stdout.write(JSON.stringify(out));
    return;
  } else {
    process.stderr.write('usage: guilda.mjs join|send|inbox|architect-create|deliver|show|hook codex [--project <dir>]\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (r && r.busy) process.exitCode = 3;
}

main().catch((e) => { process.stderr.write(`[guilda] ${e.message}\n`); process.exit(1); });
