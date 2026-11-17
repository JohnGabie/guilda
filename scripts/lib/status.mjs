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
