import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const now = () => performance.timeOrigin + performance.now();
const t0 = now();
let raw = '';
for await (const c of process.stdin) raw += c;
const input = JSON.parse(raw || '{}');
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const WAIT_MS = Number(process.env.L4_WAIT_MS ?? 300);
const STEP_MS = 20;
const MARKER = '.extension-live.json';

// Method A: the marker of this session, with a bounded wait for the extension hook.
function readMarker() {
  try { return JSON.parse(fs.readFileSync(path.join(projectDir, '.guilda', MARKER), 'utf8')); } catch { return null; }
}
function ensureIgnored() {
  const gi = path.join(projectDir, '.guilda', '.gitignore');
  let text = '';
  try { text = fs.readFileSync(gi, 'utf8'); } catch {}
  if (!text.split('\n').includes(MARKER)) fs.appendFileSync(gi, (text && !text.endsWith('\n') ? '\n' : '') + MARKER + '\n');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aStart = now();
let firstRead = null, answerA = 'n/a', polls = 0;
if (fs.existsSync(path.join(projectDir, '.guilda'))) {
  ensureIgnored();
  const deadline = aStart + WAIT_MS;
  for (;;) {
    const m = readMarker();
    polls++;
    const hit = !!m && m.sessionId === input.session_id;
    if (firstRead === null) firstRead = hit ? 'loaded' : 'not loaded';
    if (hit) { answerA = 'loaded'; break; }
    if (now() >= deadline) { answerA = 'not loaded'; break; }
    await sleep(STEP_MS);
  }
}
const aEnd = now();

// Method B: claude plugin list --json (read only).
let answerB = 'n/a', bNames = [], bErr = null;
const bStart = now();
if (process.env.L4_METHOD_B === '1') {
  try {
    const out = execFileSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    const list = JSON.parse(out);
    const arr = Array.isArray(list) ? list : (list.plugins || list.installed || []);
    bNames = arr.map((p) => `${p.id || p.name}|${p.enabled ?? p.status ?? ''}|${p.scope ?? ''}`);
    answerB = arr.some((p) => String(p.id || p.name).startsWith('l4ext')) ? 'loaded' : 'not loaded';
  } catch (e) { bErr = String(e.message).slice(0, 200); }
}
const bEnd = now();

const t1 = now();
if (process.env.L4_LOG) {
  fs.appendFileSync(path.join(process.env.L4_LOG, 'core.jsonl'), JSON.stringify({
    hook: 'core', session: input.session_id, source: input.source, procStart: performance.timeOrigin, start: t0, end: t1,
    methodA: { answer: answerA, firstRead, polls, ms: +(aEnd - aStart).toFixed(1), waitMs: WAIT_MS },
    methodB: { answer: answerB, ms: +(bEnd - bStart).toFixed(1), names: bNames, err: bErr },
    inputKeys: Object.keys(input).sort(),
    envClaudeKeys: Object.keys(process.env).filter((k) => /CLAUDE|PLUGIN/.test(k)).sort(),
  }) + '\n');
}
const note = answerA === 'not loaded' ? 'l4core: the extension l4ext did not load.' : `l4core: extension ${answerA}.`;
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: note } }));
