// The end hook of a subagent (SubagentStop, section 4c, X6). It writes the `end` line, one `tokens` line for each
// model of the agent transcript, a `verdict` line for a check role, a copy of the transcript (DU3 a), and then the
// `done` signal with the usage list (section 4a). A record hook fails open (X9): each error gives exit 0, and no
// partial line. No reply text, command text or prompt enters the log (D13, R19).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeSignal, validId, DISPATCH_FILE } from '../lib/queue.mjs';
import { parseVerdict } from '../lib/verdict.mjs';
import { ensureIgnored } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';

/** A longer string value of an audit line is cut at this length (SC-G13). */
const MAX_VALUE = 200;
/** An audit line must stay under this size, so one append is one whole line. */
const MAX_LINE_BYTES = 4096;
const TMP_BYTES = 4;
/** The transcript copy holds reply and tool text, so only its owner may read it (R19). */
const COPY_MODE = 0o600;
/** The check roles whose last reply is a verdict or a report with a `Result:` line. */
const VERDICT_AGENTS = new Set(['guilda:reviewer', 'guilda:security', 'guilda:qa']);
/** The transcript usage fields (L2, I4) and their names in the audit log and the usage list (section 4a). */
const USAGE_FIELDS = [
  ['input', 'input_tokens'],
  ['cacheRead', 'cache_read_input_tokens'],
  ['cacheCreation', 'cache_creation_input_tokens'],
  ['output', 'output_tokens'],
];
const PLAIN_WORD = /^[A-Za-z0-9._-]+$/;

const isRealDir = (p) => {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

const cut = (v) => (typeof v === 'string' && v.length > MAX_VALUE ? v.slice(0, MAX_VALUE) : v);
const isCount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const str = (v) => (typeof v === 'string' ? v : null);

/** The task of the agent from its dispatch.json, or null. */
function taskOf(projectDir, agentId) {
  try {
    const file = path.join(projectDir, '.guilda', 'queue', 'signals', 'agents', agentId, DISPATCH_FILE);
    if (!fs.lstatSync(file).isFile()) return null;
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validId('task', d && d.task) ? d.task : null;
  } catch {
    return null;
  }
}

/** Append one audit line, or nothing. The file must be a plain file with one link, or not exist yet. */
function appendAudit(guildaDir, record) {
  const clean = Object.fromEntries(Object.entries(record).map(([k, v]) => [k, cut(v)]));
  const line = `${JSON.stringify(clean)}\n`;
  if (Buffer.byteLength(line) >= MAX_LINE_BYTES) return;
  const file = path.join(guildaDir, 'audit.jsonl');
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.nlink !== 1) return;
  } catch (err) {
    if (err.code !== 'ENOENT') return;
  }
  try {
    ensureIgnored(guildaDir);
    fs.appendFileSync(file, line);
  } catch {
    // Fail open (X9).
  }
}

/** The sums of message.usage of each assistant line, one item for each message.model, or null with no data. */
function sumUsage(text) {
  const byModel = new Map();
  for (const raw of text.split('\n')) {
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    const msg = line && line.type === 'assistant' && line.message && typeof line.message === 'object' ? line.message : null;
    if (!msg || typeof msg.model !== 'string' || !msg.usage || typeof msg.usage !== 'object') continue;
    const model = cut(msg.model);
    const sum = byModel.get(model) ?? { model, input: 0, cacheRead: 0, cacheCreation: 0, output: 0 };
    for (const [key, field] of USAGE_FIELDS) if (isCount(msg.usage[field])) sum[key] += msg.usage[field];
    byModel.set(model, sum);
  }
  return byModel.size > 0 ? [...byModel.values()] : null;
}

/** Make one folder level under `parent`. It must be a real folder, not a link. */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  if (!isRealDir(dir)) throw new Error('refused: not a real folder');
}

/** The path of the transcript copy: .guilda/transcripts/<task or none>/<agentId>.jsonl. */
const copyPath = (guildaDir, task, agentId) => path.join(guildaDir, 'transcripts', task ?? 'none', `${agentId}.jsonl`);

/**
 * The byte count of the transcript part that an earlier end of the same agent already counted, or 0. A resume
 * (SendMessage) writes into the same transcript and fires a second SubagentStop (L2), and the earlier end left its
 * copy of the transcript: when the transcript starts with the bytes of that copy, those bytes are counted already.
 */
function countedBytes(guildaDir, task, agentId, bytes) {
  try {
    const dest = copyPath(guildaDir, task, agentId);
    const st = fs.lstatSync(dest);
    if (!st.isFile() || st.nlink !== 1 || st.size > bytes.length) return 0;
    const prev = fs.readFileSync(dest);
    return bytes.subarray(0, prev.length).equals(prev) ? prev.length : 0;
  } catch {
    return 0;
  }
}

/** Copy the transcript bytes to .guilda/transcripts/<task or none>/<agentId>.jsonl. The relative path, or null. */
function copyTranscript(guildaDir, task, agentId, bytes) {
  try {
    const folder = task ?? 'none';
    const top = path.join(guildaDir, 'transcripts');
    ensureIgnored(guildaDir);
    ensureDir(top);
    ensureDir(path.join(top, folder));
    const dest = copyPath(guildaDir, task, agentId);
    const tmp = `${dest}.${process.pid}.${crypto.randomBytes(TMP_BYTES).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, bytes, { flag: 'wx', mode: COPY_MODE });
    fs.renameSync(tmp, dest);
    return `.guilda/transcripts/${folder}/${agentId}.jsonl`;
  } catch {
    return null;
  }
}

/** The first word of the last `Stage:` line, or null. */
function stageOf(text) {
  let stage = null;
  for (const m of text.matchAll(/^[ \t]*Stage:[ \t]*(\S*)/gm)) stage = m[1] || null;
  return stage !== null && PLAIN_WORD.test(stage) ? stage : null;
}

await runHookMain(async (input) => {
  const agentId = input.agent_id;
  if (!validId('agent', agentId)) return 0;
  const projectDir = resolveProjectDir(input);
  const guildaDir = path.join(projectDir, '.guilda');
  if (!isRealDir(guildaDir)) return 0;
  const t = new Date().toISOString();
  const agentType = str(input.agent_type);
  const transcript = str(input.agent_transcript_path);
  const task = taskOf(projectDir, agentId);

  let bytes = null;
  try {
    if (transcript !== null) bytes = fs.readFileSync(transcript);
  } catch {
    bytes = null;
  }
  const usage = bytes === null ? null : sumUsage(bytes.subarray(countedBytes(guildaDir, task, agentId, bytes)).toString('utf8'));
  const copy = bytes === null ? null : copyTranscript(guildaDir, task, agentId, bytes);

  appendAudit(guildaDir, { kind: 'end', t, agentId, agentType, task, transcript, copy });
  for (const u of usage ?? []) appendAudit(guildaDir, { kind: 'tokens', t, agentId, task, ...u });
  if (VERDICT_AGENTS.has(agentType)) {
    const reply = str(input.last_assistant_message) ?? '';
    const result = parseVerdict(reply).result;
    appendAudit(guildaDir, {
      kind: 'verdict',
      t,
      agentId,
      task,
      result: result !== null && PLAIN_WORD.test(result) ? result : null,
      stage: stageOf(reply),
    });
  }
  // L2, I11: no SubagentStop field tells an error end, so each end is `done` with the reason `finished`.
  if (isRealDir(path.join(guildaDir, 'queue'))) {
    try {
      writeSignal(projectDir, { agentId }, 'done', { at: t, reason: 'finished', usage });
    } catch {
      // A second end of the same agent (a resume) finds the first done signal: it stays (section 4a).
    }
  }
  return 0;
});
