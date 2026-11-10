#!/usr/bin/env node
// Probe: do the project Codex hooks run in an app-server session (the transport of the voice setup)?
// Usage: GUILDA_AGENT=<name> node appserver-probe.mjs <project> "<user text>" [<user text 2>]
// Starts `codex app-server` on stdio (one child, it ends when this script closes its stdin), starts a
// thread in <project>, sends each text as one turn, prints the agent messages and the token usage.
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const [project, ...texts] = process.argv.slice(2);
const child = spawn('codex', ['--dangerously-bypass-hook-trust', 'app-server',
  '-c', `projects={"${project}"={trust_level="trusted"}}`, ...(process.env.PROBE_CONFIG ? ['-c', process.env.PROBE_CONFIG] : [])], { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] });
let err = '';
child.stderr.on('data', (c) => { err += c; });
let nextId = 1;
const pending = new Map();
const waiters = [];
const rl = readline.createInterface({ input: child.stdout });
rl.on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.id !== undefined && m.method) { // a server request: refuse approvals
    child.stdin.write(JSON.stringify({ id: m.id, result: { decision: 'decline' } }) + '\n');
    return;
  }
  for (const w of [...waiters]) w(m);
});
function call(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  return new Promise((res) => pending.set(id, res));
}
function waitFor(pred) {
  return new Promise((res) => { const w = (m) => { if (pred(m)) { waiters.splice(waiters.indexOf(w), 1); res(m); } }; waiters.push(w); });
}
const out = { messages: [], usage: [] };
waiters.push((m) => {
  if (m.method === 'item/completed' && m.params?.item?.type === 'agentMessage') out.messages.push(m.params.item.text);
  if (m.method === 'thread/tokenUsage/updated') out.usage.push(m.params?.tokenUsage?.total ?? m.params);
});
const init = await call('initialize', { clientInfo: { name: 'guilda-lab', version: '0.0.1' } });
if (init.error) { console.error('initialize', JSON.stringify(init.error)); process.exit(1); }
child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
if (process.env.PROBE_HOOKS_LIST) { const hl = await call('hooks/list', { cwds: [project] }); out.hooksList = hl.result ?? hl.error; }
const ts = await call('thread/start', { cwd: project, sandbox: 'workspace-write' });
if (ts.error) { console.error('thread/start', JSON.stringify(ts.error)); process.exit(1); }
out.thread = ts.result.thread?.id;
for (const text of texts) {
  const done = waitFor((m) => m.method === 'turn/completed');
  const r = await call('turn/start', { threadId: out.thread, input: [{ type: 'text', text, text_elements: [] }] });
  if (r.error) { console.error('turn/start', JSON.stringify(r.error)); break; }
  await done;
}
child.stdin.end();
child.on('close', (code) => {
  let alive = true; try { process.kill(child.pid, 0); } catch { alive = false; }
  out.exit = code; out.pid = child.pid; out.aliveAfter = alive; out.stderrTail = err.slice(-300);
  console.log(JSON.stringify(out, null, 2));
});
