import fs from 'node:fs';
import path from 'node:path';
const now = () => performance.timeOrigin + performance.now();
const t0 = now();
let raw = '';
for await (const c of process.stdin) raw += c;
const input = JSON.parse(raw || '{}');
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const dir = path.join(projectDir, '.guilda');
let wrote = false;
if (fs.existsSync(dir)) {
  const file = path.join(dir, '.extension-live.json');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sessionId: input.session_id, at: new Date().toISOString() }) + '\n');
  fs.renameSync(tmp, file);
  wrote = true;
}
const t1 = now();
// Lab instrumentation only (not part of the method).
if (process.env.L4_LOG) {
  fs.appendFileSync(path.join(process.env.L4_LOG, 'ext.jsonl'), JSON.stringify({
    hook: 'ext', session: input.session_id, source: input.source, procStart: performance.timeOrigin, start: t0, end: t1, wrote,
    inputKeys: Object.keys(input).sort(),
  }) + '\n');
}
