// The text and the object of `status` (D21, section 4g). Pure: no file read, no clock read.
import { ROLE_NAMES, lateMark } from './queue.mjs';

export const TASK_STATES = Object.freeze([
  'pending', 'ready', 'dispatched', 'running', 'review', 'done', 'failed', 'stalled', 'held', 'dead',
]);
export const DEFAULT_EVENTS = 10;
const MS_PER_MINUTE = 60000;
const SECONDS_PER_HOUR = 3600;
const ARROW = '→';
const SEP = '  ';

const iso = (ms) => new Date(ms).toISOString();
const noMs = (ms) => iso(ms).replace(/\.\d{3}Z$/, 'Z');
const clock = (t) => {
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? String(t ?? '') : iso(ms).slice(11, 19);
};
const roleName = (code) => ROLE_NAMES[code] ?? code ?? '-';

/** The parts of section 4g: { tasks, running, stalled, events, agentSeconds }. */
export function statusJson(state, events, { now, count = DEFAULT_EVENTS } = {}) {
  const nowMs = Date.parse(now);
  const tasks = Object.fromEntries(TASK_STATES.map((s) => [s, 0]));
  const running = [];
  const stalled = [];
  let agentSeconds = 0;
  for (const [id, t] of Object.entries(state.tasks ?? {})) {
    if (Object.hasOwn(tasks, t.state)) tasks[t.state] += 1;
    agentSeconds += Number.isFinite(t.agentSeconds) ? t.agentSeconds : 0;
    const row = { task: id, role: roleName(t.role), address: t.address ?? '-', tool: t.tool ?? '-' };
    if (t.state === 'running') {
      const since = Date.parse(t.since);
      const minutes = Number.isNaN(since) || Number.isNaN(nowMs) ? 0 : Math.max(0, Math.floor((nowMs - since) / MS_PER_MINUTE));
      running.push({ ...row, minutes, tokens: Number.isFinite(t.tokens) ? t.tokens : 0, late: lateMark(t, now) });
    } else if (t.state === 'stalled') {
      stalled.push({ ...row, cause: t.cause ?? '-' });
    }
  }
  const last = events
    .filter((e) => e && e.type === 'state')
    .slice(-Math.max(0, count))
    .reverse()
    .map((e) => ({ t: e.t, task: e.task, from: e.from, to: e.to, cause: e.cause ?? null }));
  return { tasks, running, stalled, events: count > 0 ? last : [], agentSeconds };
}

/** The text of section 4g. */
export function renderStatus(state, events, { now, count = DEFAULT_EVENTS } = {}) {
  const o = statusJson(state, events, { now, count });
  const nowMs = Date.parse(now);
  const out = [`guilda status ${'—'} ${Number.isNaN(nowMs) ? now : noMs(nowMs)}`];
  out.push(`Tasks: ${TASK_STATES.map((s) => `${s} ${o.tasks[s]}`).join(' · ')}`);
  if (o.running.length > 0) {
    out.push('Running:');
    for (const r of o.running) {
      const cols = [r.task, r.role, r.address, r.tool, `${r.minutes}m`, `${r.tokens.toLocaleString('en-US')} tokens`];
      if (r.late) cols.push(`late: ${r.late}`);
      out.push(`  ${cols.join(SEP)}`);
    }
  }
  if (o.stalled.length > 0) {
    out.push('Stalled:');
    for (const r of o.stalled) out.push(`  ${[r.task, r.role, r.address, r.tool, r.cause].join(SEP)}`);
  }
  if (o.events.length > 0) {
    out.push('Last events:');
    for (const e of o.events) out.push(`  ${[clock(e.t), e.task, `${e.from} ${ARROW} ${e.to} (${e.cause ?? '-'})`].join(SEP)}`);
  }
  out.push(`Agent work: ${(o.agentSeconds / SECONDS_PER_HOUR).toFixed(1)} h`);
  return `${out.join('\n')}\n`;
}

// ---- --agent (D32, section 4f) ----

const SHORT_HASH = 7;
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const COMMIT_ID = /^[0-9a-f]{7,64}$/;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const short = (hash) => String(hash).slice(0, SHORT_HASH);
const roleCodeOf = (name) => Object.keys(ROLE_NAMES).find((c) => ROLE_NAMES[c] === name) ?? null;

/** The runs (dispatch events) that a name picks: an address, an agent ID, or `<role name> <task ID>`. */
function pickRuns(events, name) {
  const dispatches = events.filter((e) => e && e.type === 'dispatch' && typeof e.address === 'string');
  const byAddress = dispatches.filter((d) => d.address === name);
  if (byAddress.length > 0) return byAddress;
  const bound = events.filter((e) => e && e.type === 'agent' && e.agentId === name).map((e) => e.address);
  const byAgent = dispatches.filter((d) => bound.includes(d.address));
  if (byAgent.length > 0) return byAgent.slice(-1);
  const m = /^(\S+)\s+(\S+)$/.exec(name);
  const code = m ? roleCodeOf(m[1]) : null;
  return code ? dispatches.filter((d) => d.role === code && d.task === m[2]) : [];
}

/**
 * The text of `status --agent` (section 4f). Pure: the caller gives `blockNow(key)` ({ hash } or { finding })
 * and `countCommits(base, head)` (a number or null).
 */
export function renderAgent(name, state, events, audit, { blockNow, countCommits }) {
  const runs = pickRuns(events, name);
  if (runs.length === 0) return null;
  const blocks = runs.map((run) => {
    const task = state.tasks?.[run.task] ?? {};
    const agent = events.filter((e) => e && e.type === 'agent' && e.address === run.address).at(-1);
    const agentId = agent?.agentId ?? null;
    const mine = audit.filter((l) => agentId !== null && l && l.agentId === agentId);
    const tools = mine.filter((l) => l.kind === 'tool');
    const files = [...new Set(tools.filter((l) => FILE_TOOLS.has(l.tool) && typeof l.target === 'string').map((l) => l.target))];
    const end = mine.filter((l) => l.kind === 'end').at(-1);
    const done = events.filter((e) => e && e.type === 'signal' && e.kind === 'done' && e.task === run.task && e.attempt === run.attempt).at(-1);
    const head = done?.head ?? null;
    const n = run.baseCommit && head ? countCommits(run.baseCommit, head) : null;
    const uses = Array.isArray(run.uses) ? run.uses : [];
    const blockText = uses.map((u) => {
      const at = String(u).lastIndexOf('@');
      const key = at < 0 ? String(u) : String(u).slice(0, at);
      const hash = at < 0 ? null : String(u).slice(at + 1);
      const now = blockNow(key);
      if (!now.hash) return `${u} (${now.finding ?? 'UNKNOWN'})`;
      return `${u} (now ${now.hash}${now.hash === hash ? '' : ', SUSPECT'})`;
    });
    const checks = run.check === true
      ? [run]
      : events.filter((e) => e && e.type === 'dispatch' && e.check === true && e.task === run.task && e.attempt === run.attempt);
    const reviews = checks.map((c) => {
      const id = events.filter((e) => e && e.type === 'agent' && e.address === c.address).at(-1)?.agentId;
      const v = audit.filter((l) => l && l.kind === 'verdict' && id !== undefined && l.agentId === id).at(-1);
      return v ? `${c.address} ${[v.result ?? 'no result', v.stage].filter(Boolean).join(' ')}` : `${c.address} no verdict`;
    });
    const where = run.inSession === false ? 'outside' : 'in session';
    const transcript = end ? `transcript: ${end.transcript ?? 'none'}${end.copy ? ` (copy: ${end.copy})` : ''}` : 'transcript: none';
    return [
      `agent: ${run.address} (${roleName(run.role)}, ${run.tool ?? '-'}, ${where}, ${agentId === null ? 'no agent ID' : `agent ${agentId}`})`,
      `task: ${run.task} ${'—'} ${task.title ?? run.task}; attempt ${run.attempt}; state ${task.state ?? '-'}`,
      `brief: ${run.briefFile ?? 'none'}; base commit ${run.baseCommit ? short(run.baseCommit) : 'none'}`,
      `blocks: ${blockText.length > 0 ? blockText.join(', ') : 'none'}`,
      n === null ? 'commits: not measured' : `commits: ${short(run.baseCommit)}..${short(head)}, ${plural(n, 'commit')}`,
      `reviews: ${reviews.length > 0 ? reviews.join('; ') : 'none'}`,
      `audit: ${plural(tools.length, 'tool call')}; files: ${files.length > 0 ? files.join(', ') : 'none'}`,
      transcript,
    ].join('\n');
  });
  return `${blocks.join('\n\n')}\n`;
}
