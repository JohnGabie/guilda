// Extension session marker: tells the core plugin that this plugin loaded in this session.
// It writes .guilda/.extension-live.json and nothing else. It prints nothing and exits 0.
import fs from 'node:fs';
import path from 'node:path';

async function readInput() {
  let text = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) text += chunk;
    return JSON.parse(text) ?? {};
  } catch {
    return {};
  }
}

try {
  const input = await readInput();
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const dir = path.join(project, '.guilda');
  if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    const marker = { sessionId: input.session_id ?? null, at: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, '.extension-live.json'), JSON.stringify(marker) + '\n');
  }
} catch {
  // A hook must never stop the session.
}
process.exitCode = 0;
