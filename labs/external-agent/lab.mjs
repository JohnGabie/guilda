#!/usr/bin/env node
// Lab harness for the external-agent lab. No dependencies.
//   setup <project>                         write the test project: spec, AGENTS.md, Codex hooks
//   turn <project> <name> new|resume <text> one Codex turn as agent <name> (env GUILDA_AGENT=<name>).
//                                           "new" starts a new Codex session; "resume" resumes the last one.
//                                           Appends {name, mode, thread, text, usage, pid, aliveAfter, ms}
//                                           to <project>/.guilda-lab/turns.jsonl and prints it.
// The harness state (.guilda-lab/) is separate from the guilda store (.guilda/).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const GUILDA = path.join(here, 'guilda.mjs');
const TIMEOUT_MS = 300_000;

const SPEC = `# tasknote — spec

A small command-line app to keep notes with tasks.

- D1 \`@decided\` Storage: one SQLite file in the user's data folder. No server.
- D2 \`@decided\` Export format: CSV, one row per note.
- D3 \`@open\` Sync between machines: not decided. The user decides.
- D4 \`@decided\` The maximum length of a note is 2000 characters.
- D5 \`@decided\` The app is written in Node.js 24, with no runtime dependencies.
`;

function agentsMd() {
  return `# Agent instructions for this project

This project uses guilda. guilda is the project manager of the agents. The Architect owns the spec and the plan.
You do not change the spec. You ask the Architect.

guilda command (run it with node, from this folder):

    node "${GUILDA}" <command>

- First, get your address: \`join --tool codex --name "$GUILDA_AGENT"\`. It prints {"address": ...}.
  The same name always gets the same address. Do this once per session, before you send.
- Ask the Architect: \`send --from <your address> --to architect --text "<question>"\`.
  To answer a question of the Architect, add \`--type answer --reply-to <its message ID>\`.
  To give a decision of the user, use \`--type decision\`.
  It prints a message ID and returns at once. The answer is not in its output. Do not wait for it and do not poll.
- guilda puts new messages for you into your context at the start of your next turn. Use them to tell the
  user what the Architect answered or did. Do not run other guilda commands to look for them.
`;
}

function setup(project) {
  fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(project, 'docs', 'spec.md'), SPEC);
  fs.writeFileSync(path.join(project, 'AGENTS.md'), agentsMd());
  fs.mkdirSync(path.join(project, '.codex'), { recursive: true });
  const cmd = `node "${GUILDA}" hook codex`;
  const hooks = { hooks: {} };
  for (const e of ['SessionStart', 'UserPromptSubmit', 'Stop']) hooks.hooks[e] = [{ hooks: [{ type: 'command', command: cmd }] }];
  fs.writeFileSync(path.join(project, '.codex', 'hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
  fs.mkdirSync(path.join(project, '.guilda'), { recursive: true });
  return { project, files: ['docs/spec.md', 'AGENTS.md', '.codex/hooks.json'] };
}

function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function lastThread(project, name) {
  const f = path.join(project, '.guilda-lab', 'turns.jsonl');
  if (!fs.existsSync(f)) return null;
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.name === name && r.thread);
  return rows.length ? rows[rows.length - 1].thread : null;
}

function turn(project, name, mode, text) {
  // Project trust for this run only (-c at the session layer), and hook trust for this run only.
  // Nothing is written to the user's Codex home by these flags.
  const common = ['--json', '--skip-git-repo-check', '--ignore-user-config', '--dangerously-bypass-hook-trust',
    '-c', `projects={"${project}"={trust_level="trusted"}}`];
  let args;
  if (mode === 'new') args = ['exec', ...common, '-s', 'workspace-write', '-C', project, text];
  else {
    const thread = lastThread(project, name);
    if (!thread) throw new Error(`no earlier thread for ${name}`);
    args = ['exec', 'resume', ...common, '-c', 'sandbox_mode="workspace-write"', thread, text];
  }
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('codex', args, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GUILDA_AGENT: name } });
    let out = ''; let err = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, TIMEOUT_MS);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('close', (code) => {
      clearTimeout(timer);
      let thread = null; const messages = []; const usage = []; const commands = [];
      for (const l of out.split('\n')) {
        if (!l.startsWith('{')) continue;
        let e; try { e = JSON.parse(l); } catch { continue; }
        if (e.type === 'thread.started') thread = e.thread_id;
        if (e.type === 'item.completed' && e.item?.type === 'agent_message') messages.push(e.item.text);
        if (e.type === 'item.completed' && e.item?.type === 'command_execution') commands.push(e.item.command);
        if (e.type === 'turn.completed') usage.push(e.usage);
      }
      const row = { time: new Date().toISOString(), name, mode, prompt: text, thread, code, timedOut, ms: Date.now() - t0,
        pid: child.pid, aliveAfter: isAlive(child.pid), commands, messages, text: messages[messages.length - 1] || null, usage };
      const dir = path.join(project, '.guilda-lab');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'turns.jsonl'), JSON.stringify(row) + '\n');
      fs.appendFileSync(path.join(dir, 'codex-raw.jsonl'), out);
      if (err.trim()) fs.appendFileSync(path.join(dir, 'codex-stderr.log'), `--- ${row.time} ${name}\n${err}\n`);
      resolve(row);
    });
  });
}

const [cmd, project, ...rest] = process.argv.slice(2);
if (cmd === 'setup') console.log(JSON.stringify(setup(path.resolve(project)), null, 2));
else if (cmd === 'turn') turn(path.resolve(project), rest[0], rest[1], rest[2]).then((r) => console.log(JSON.stringify(r, null, 2)));
else { console.error('usage: lab.mjs setup|turn <project> ...'); process.exit(2); }
