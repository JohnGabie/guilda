import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type {
  GuildaPanelDiagnostics,
  GuildaPanelInit,
  GuildaPanelLog,
  GuildaPanelLogLine,
  GuildaPanelSnapshot,
  GuildaPanelTask,
} from '../types'

// The guilda-panel mod (section 4h of the 0.3.0 spec). It reads the queue files of the project and shows the agents
// that run outside the conversation. It writes no file, starts no process and makes no network call.

// fold copy: begin
// A copy of the fold of scripts/lib/queue.mjs, with types. A mod cannot import a core script. The test
// 'panel fold equals core fold' of tests/queue.test.mjs checks that both give the same state.
const MS_PER_SECOND = 1000
const MAX_ATTEMPTS = 3
const TASK_ID = /^[A-Za-z0-9]{1,24}$/
const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/
const ADDRESS_BODY =
  'main|architect|supervisor|council-[0-9a-f]{4}|[A-Za-z0-9]{1,24}-[a-z]{2,4}-[0-9a-f]{4}|ext-[a-z0-9]{1,24}-[A-Za-z0-9]{1,24}-[0-9a-f]{4}'
const ADDRESS = new RegExp(`^(${ADDRESS_BODY})$`)
const TOOL_ID = /^[a-z0-9]{1,24}$/
const NAME_ID = /^[A-Za-z0-9]{1,24}$/
const SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/
const AGENT_TYPE = /^[A-Za-z0-9:._-]{1,64}$/
const ARCHITECT = 'architect'
const WORK_ID = /^w-[0-9a-f]{8}$/
const RESERVED_TASK_IDS = Object.freeze(['main', 'architect', 'supervisor', 'council', 'ext'])
const ROLE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  arc: 'architect',
  exe: 'executor',
  rev: 'reviewer',
  qa: 'qa',
  sec: 'security',
  vc: 'version-control',
  lab: 'lab',
  dev: 'devops',
  ai: 'ai-lead',
})
const ROLE_CODES = Object.freeze(Object.keys(ROLE_NAMES))

function validId(kind: string, value: any): boolean {
  switch (kind) {
    case 'task':
      return typeof value === 'string' && TASK_ID.test(value) && !RESERVED_TASK_IDS.includes(value)
    case 'attempt': {
      const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value
      return Number.isInteger(n) && n >= 1 && n <= MAX_ATTEMPTS
    }
    case 'agent':
      return typeof value === 'string' && AGENT_ID.test(value) && value !== '.' && value !== '..'
    case 'address':
      return typeof value === 'string' && ADDRESS.test(value)
    case 'role':
      return typeof value === 'string' && ROLE_CODES.includes(value)
    case 'work':
      return typeof value === 'string' && WORK_ID.test(value)
    case 'tool':
      return typeof value === 'string' && TOOL_ID.test(value)
    case 'name':
      return typeof value === 'string' && NAME_ID.test(value)
    case 'session':
      return typeof value === 'string' && SESSION_ID.test(value)
    case 'agentType':
      return typeof value === 'string' && AGENT_TYPE.test(value)
    default:
      return false
  }
}

function parseJournal(text: string): { events: any[]; skipped: number[]; partial: boolean } {
  const lines = text.split('\n')
  const last = lines.pop() as string
  const events: any[] = []
  const skipped: number[] = []
  lines.forEach((line, i) => {
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      e = null
    }
    if (e !== null && typeof e === 'object' && !Array.isArray(e)) events.push(e)
    else skipped.push(i + 1)
  })
  return { events, skipped, partial: last.length > 0 }
}

function toMs(v: any): number | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? null : ms
}

const later = (a: any, b: any): any => {
  if (!a) return b ?? null
  if (!b) return a
  return (toMs(b) as number) > (toMs(a) as number) ? b : a
}

function usageTotal(usage: any): number | null {
  if (!Array.isArray(usage)) return null
  let sum = 0
  for (const u of usage) {
    for (const k of ['input', 'cacheRead', 'cacheCreation', 'output']) {
      if (u && Number.isFinite(u[k])) sum += u[k]
    }
  }
  return sum
}

function newTask(e: any): any {
  return {
    work: e.work ?? null,
    key: e.key ?? null,
    state: 'pending',
    attempt: 1,
    address: null,
    agentId: null,
    role: null,
    tool: null,
    inSession: null,
    tier: null,
    title: e.title ?? '',
    deps: Array.isArray(e.deps) ? [...e.deps] : [],
    uses: Array.isArray(e.uses) ? [...e.uses] : [],
    owns: Array.isArray(e.owns) ? [...e.owns] : [],
    since: e.t ?? null,
    cause: null,
    startedAt: null,
    lastHeartbeat: null,
    busyUntil: null,
    tokens: null,
    agentSeconds: 0,
    checks: [],
  }
}

function resetAttempt(t: any): void {
  t.attempt += 1
  for (const k of ['address', 'agentId', 'role', 'tool', 'inSession', 'tier', 'startedAt', 'lastHeartbeat', 'busyUntil', 'tokens']) {
    t[k] = null
  }
}

function newBinding(address: string, fields: any): any {
  return {
    address,
    tool: null,
    inSession: null,
    agentId: null,
    agentType: null,
    sessions: [],
    parentSession: null,
    parentAgent: null,
    name: null,
    role: null,
    task: null,
    state: 'bound',
    ...fields,
  }
}

function foldBinding(bindings: any, e: any): void {
  if (!validId('address', e.address)) return
  const b = Object.hasOwn(bindings, e.address) ? bindings[e.address] : null
  switch (e.type) {
    case 'dispatch':
      bindings[e.address] = newBinding(e.address, {
        tool: e.tool ?? null,
        inSession: e.inSession ?? null,
        role: e.role ?? null,
        task: e.task ?? null,
      })
      break
    case 'agent': {
      let entry = b
      if (!entry && e.address === ARCHITECT) {
        entry = newBinding(ARCHITECT, { tool: 'claude', inSession: true, role: 'arc', task: null })
        bindings[ARCHITECT] = entry
      }
      if (!entry) break
      entry.agentId = e.agentId ?? null
      entry.agentType = e.agentType ?? null
      entry.parentSession = e.parentSession ?? null
      entry.parentAgent = e.parentAgent ?? null
      break
    }
    case 'join':
      if (!b) bindings[e.address] = newBinding(e.address, { tool: e.tool ?? null, inSession: false, name: e.name ?? null })
      break
    case 'session':
      if (b && typeof e.session === 'string' && !b.sessions.includes(e.session)) b.sessions.push(e.session)
      break
    case 'unbind':
      if (b) b.state = 'unbound'
      break
    default:
      break
  }
}

function fold(events: any[], { now, generator }: { now?: any; generator?: string } = {}): any {
  const s: any = {
    generator,
    journalSeq: 0,
    slots: 1,
    works: Object.create(null),
    tasks: Object.create(null),
    bindings: Object.create(null),
  }
  const runningSince: any = Object.create(null)
  const seconds: any = Object.create(null)
  const runs: any = Object.create(null)
  for (const e of events) {
    if (!e || typeof e !== 'object') continue
    if (Number.isFinite(e.seq)) s.journalSeq = Math.max(s.journalSeq, e.seq)
    const t = typeof e.task === 'string' && Object.hasOwn(s.tasks, e.task) ? s.tasks[e.task] : null
    switch (e.type) {
      case 'plan':
        if (Number.isInteger(e.slots) && e.slots > 0) s.slots = e.slots
        if (typeof e.work === 'string') s.works[e.work] = { plan: e.plan ?? null, part: e.part ?? null }
        break
      case 'task':
        if (typeof e.task === 'string' && !t) {
          s.tasks[e.task] = newTask(e)
          seconds[e.task] = 0
        }
        break
      case 'dispatch':
        if (!t || typeof e.address !== 'string') break
        foldBinding(s.bindings, e)
        runs[e.address] = { task: e.task, check: e.check === true }
        if (e.check === true) {
          t.checks.push({ address: e.address, role: e.role ?? null, agentId: null, attempt: e.attempt ?? t.attempt })
        } else {
          Object.assign(t, {
            address: e.address,
            agentId: null,
            role: e.role ?? null,
            tool: e.tool ?? null,
            inSession: e.inSession ?? null,
            tier: e.tier ?? null,
          })
        }
        break
      case 'agent': {
        foldBinding(s.bindings, e)
        const run = runs[e.address]
        if (!run || !Object.hasOwn(s.tasks, run.task)) break
        const owner = s.tasks[run.task]
        if (run.check) {
          const c = owner.checks.find((x: any) => x.address === e.address)
          if (c) c.agentId = e.agentId ?? null
        } else if (owner.address === e.address) {
          owner.agentId = e.agentId ?? null
        }
        break
      }
      case 'signal': {
        if (!t || e.attempt !== t.attempt) break
        if (e.address && runs[e.address]?.check) break
        if (e.address && t.address && e.address !== t.address) break
        if (e.kind === 'started') t.startedAt = later(t.startedAt, e.at)
        if (e.kind === 'heartbeat') {
          if (!t.lastHeartbeat || (toMs(e.at) as number) >= (toMs(t.lastHeartbeat) as number)) {
            t.lastHeartbeat = e.at ?? null
            t.busyUntil = e.busyUntil ?? null
            if (Number.isFinite(e.tokens)) t.tokens = e.tokens
          }
        }
        if (e.kind === 'done' || e.kind === 'failed') {
          const total = usageTotal(e.usage)
          if (total !== null) t.tokens = total
        }
        break
      }
      case 'state': {
        if (!t) break
        if (t.state === 'running' && runningSince[e.task] !== undefined) {
          seconds[e.task] += Math.max(0, (toMs(e.t) as number) - runningSince[e.task]) / MS_PER_SECOND
          delete runningSince[e.task]
        }
        if ((e.cause === 'retry' || e.cause === 'reject') && e.to === 'ready') resetAttempt(t)
        t.state = e.to
        t.since = e.t ?? t.since
        t.cause = e.cause ?? null
        if (e.to === 'running' && toMs(e.t) !== null) runningSince[e.task] = toMs(e.t)
        break
      }
      case 'join':
      case 'session':
      case 'unbind':
        foldBinding(s.bindings, e)
        break
      default:
        break
    }
  }
  const nowMs = toMs(now)
  for (const [id, t] of Object.entries(s.tasks) as [string, any][]) {
    let sec = seconds[id] ?? 0
    if (runningSince[id] !== undefined && nowMs !== null) sec += Math.max(0, nowMs - runningSince[id]) / MS_PER_SECOND
    t.agentSeconds = Math.round(sec)
  }
  return s
}
// fold copy: end

const POLL_MS = 2000
// A row stays under the prompt this long after its task is done or failed (lab agent-panel, run 2).
const LINGER_MS = 10_000
// The init progress shows while its file is younger than this.
const INIT_MAX_AGE_MS = 10 * 60_000
// A pane opens unasked only from this width (lab agent-panel).
const INIT_PANE_COLUMNS = 144
const LOG_LINES = 15
// The log pane reads at most this many bytes from the end of a log.
const LOG_TAIL_BYTES = 65_536
// The engine reads at most 4 MiB in one call.
const MAX_JSON_BYTES = 4 * 1024 * 1024
const SECONDS_PER_HOUR = 3600
const GENERATOR = 'guilda-panel'

const DETAIL_PANE = 'guilda-agents'
const DETAIL_TITLE = 'guilda agents'
const LOG_PANE = 'guilda-log'
const INIT_PANE = 'guilda-init'
const INIT_TITLE = 'guilda init'
// The key of a row's label Button.
const PRESS_PREFIX = 'open:'

export const HEADING = 'other models'
// The marker of a row: a hollow diamond, not the engine's own agent markers.
export const MARKER = '◇'
// Drawn over the marker while the pointer is on the row.
export const HOVER_MARKER = '›'

// The states that keep a row, and the states that keep it for LINGER_MS more (section 4h).
const ACTIVE_STATES = ['dispatched', 'running', 'stalled']
const FINISHED_STATES = ['done', 'failed']
const LOG_KINDS = ['command', 'message', 'file', 'tokens', 'state']

const QUEUE_DIR = '.guilda/queue'
const STATE_FILE = `${QUEUE_DIR}/state.json`
const JOURNAL_FILE = `${QUEUE_DIR}/journal.jsonl`
const DOCTOR_FILE = '.guilda/.doctor-last.json'
const INIT_FILE = '.guilda/.init-progress.json'

// One entry of the `bindings` key of state.json, as the panel keeps it (section 4b).
type PanelBinding = {
  address: string
  tool: string | null
  name: string | null
  role: string | null
  inSession: boolean | null
  agentId: string | null
  lastSession: string | null
  state: string
  /** The state of the task of the entry, or null when the entry has no live run. */
  taskState: string | null
  /** The ID of the task of the entry. */
  taskId: string | null
}
// The snapshot of the types file, with the binding entries. The types file is not in this task's file list.
type PanelSnapshot = GuildaPanelSnapshot & { bindings?: PanelBinding[] }

const EMPTY: GuildaPanelSnapshot = { at: 0, hasQueue: false, tasks: [], doctorFail: null, init: null }
const NO_DIAGNOSTICS: GuildaPanelDiagnostics = { folder: '', at: 0, errors: [] }
const NO_LOG: GuildaPanelLog = { address: null, isFound: false, lines: [] }

const snapshot = atom({ plugin: 'guilda-panel', key: 'snapshot' } as const, EMPTY, { shape: 'snapshot-t20-1' })
const diagnostics = atom({ plugin: 'guilda-panel', key: 'diagnostics' } as const, NO_DIAGNOSTICS, {
  shape: 'diagnostics-t20-1',
})
const logView = atom({ plugin: 'guilda-panel', key: 'log' } as const, NO_LOG, { shape: 'log-t20-1' })
const initPlaced = atom({ plugin: 'guilda-panel', key: 'initPlaced' } as const, false, { shape: 'init-placed-1' })

// The folder of session.start, the poll timer, and the last width a drawing saw. session.start sets them again
// after each load of this module. A drawing may not write $.state, so the width is a module value.
let startCwd: string | undefined
let timer: Timer | undefined
let isPolling = false
let lastColumns = 0
// True after the person closed the init pane by hand, until the init progress ends.
let isInitDismissed = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// C0 (tab and newline too), DEL and C1: a file can hold terminal escape sequences.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g
// An ESC [ sequence (CSI) goes whole, so no `[31m` stays behind.
const ESC_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g

// Each string that comes from a file passes here before the mod draws or prints it.
export function clean(text: string): string {
  return text.replace(ESC_CSI, '').replace(CONTROL_CHARS, '')
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type Root = { folder: string; real: string }
type Found = { text: string; mtimeMs: number }

// The project folder: the first of the session folders that has a `.guilda` folder. Read again at each poll,
// because the working directory moves during a session.
async function findRoot($: EngineInterface): Promise<Root | null> {
  const cwd = await $.session.cwd()
  const root = await $.session.root()
  const looked: string[] = []
  for (const one of [cwd, root, startCwd]) {
    if (one === undefined || one === '' || looked.includes(one)) continue
    looked.push(one)
    const folder = one.replace(/\/+$/, '')
    if (!(await $.fs.exists(`${folder}/.guilda`))) continue
    const stat = await $.fs.stat(folder, { resolve: true })
    if (stat.realPath === undefined) continue
    return { folder, real: stat.realPath.replace(/\/+$/, '') }
  }
  return null
}

// Reads one file of the project. A missing file is undefined. A file that lands outside the project folder
// throws, and nothing is read. `tail` reads only that many bytes from the end.
async function readInside($: EngineInterface, root: Root, rel: string, tail?: number): Promise<Found | undefined> {
  const path = `${root.folder}/${rel}`
  if (!(await $.fs.exists(path))) return undefined
  const stat = await $.fs.stat(path, { resolve: true })
  if (stat.realPath === undefined || !stat.realPath.startsWith(`${root.real}/`)) throw new Error(`${rel}: outside the project`)
  if (stat.kind !== 'file') throw new Error(`${rel}: not a file`)
  if (tail !== undefined && stat.size > tail) {
    const offset = stat.size - tail
    const text = await $.fs.read(path, { offset, length: tail })
    // The first line can be cut: drop it.
    return { text: text.slice(text.indexOf('\n') + 1), mtimeMs: stat.mtimeMs }
  }
  if (stat.size > MAX_JSON_BYTES) throw new Error(`${rel}: larger than ${MAX_JSON_BYTES} bytes`)
  return { text: await $.fs.read(path), mtimeMs: stat.mtimeMs }
}

function parseJson(rel: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${rel}: ${errorText(error)}`)
  }
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)

// The tasks of the queue: state.json, or the fold of the journal when state.json is missing, bad, or older than
// the journal (X7).
type Queue = { tasks: Record<string, unknown>; bindings: unknown }

async function readQueue($: EngineInterface, root: Root, now: number, errors: string[]): Promise<Queue> {
  let state: Record<string, unknown> | null = null
  let stateTime = 0
  try {
    const found = await readInside($, root, STATE_FILE)
    if (found !== undefined) {
      const parsed = parseJson(STATE_FILE, found.text)
      if (!isRecord(parsed) || !isRecord(parsed.tasks) || !Number.isFinite(parsed.journalSeq)) {
        throw new Error(`${STATE_FILE}: not a state object`)
      }
      state = parsed
      stateTime = found.mtimeMs
    }
  } catch (error) {
    errors.push(errorText(error))
  }
  const journalPath = `${root.folder}/${JOURNAL_FILE}`
  const fromState = (): Queue => ({ tasks: (state?.tasks as Record<string, unknown>) ?? {}, bindings: state?.bindings })
  if (!(await $.fs.exists(journalPath))) return fromState()
  const journalTime = (await $.fs.stat(journalPath)).mtimeMs
  if (state !== null && stateTime >= journalTime) return fromState()
  try {
    const found = await readInside($, root, JOURNAL_FILE)
    if (found === undefined) return { tasks: {}, bindings: undefined }
    const { events, skipped } = parseJournal(found.text)
    if (skipped.length > 0) errors.push(`${JOURNAL_FILE}: lines skipped: ${skipped.join(', ')}`)
    const folded = fold(events, { now, generator: GENERATOR })
    return { tasks: folded.tasks, bindings: folded.bindings }
  } catch (error) {
    errors.push(errorText(error))
    return fromState()
  }
}

function toTask(id: string, raw: Record<string, unknown>, errors: string[]): GuildaPanelTask {
  const address = raw.address === null || raw.address === undefined ? null : raw.address
  if (address !== null && !validId('address', address)) errors.push(`${STATE_FILE}: task ${id}: the address does not match X4`)
  const agentId = raw.agentId === null || raw.agentId === undefined ? null : raw.agentId
  return {
    id,
    state: typeof raw.state === 'string' ? clean(raw.state) : 'unknown',
    since: toMs(raw.since),
    address: validId('address', address) ? (address as string) : null,
    agentId: validId('agent', agentId) ? (agentId as string) : null,
    role: typeof raw.role === 'string' ? clean(raw.role) : null,
    tool: typeof raw.tool === 'string' ? clean(raw.tool) : null,
    inSession: typeof raw.inSession === 'boolean' ? raw.inSession : null,
    title: typeof raw.title === 'string' ? clean(raw.title) : '',
    tokens: num(raw.tokens),
    startedAt: toMs(raw.startedAt),
    agentSeconds: num(raw.agentSeconds) ?? 0,
  }
}

// The heartbeat of an external run gives its tokens between two sync runs (section 4h).
async function heartbeatTokens(
  $: EngineInterface,
  root: Root,
  id: string,
  raw: Record<string, unknown>,
  errors: string[],
): Promise<number | null> {
  if (!validId('task', id) || !validId('attempt', raw.attempt)) return null
  const rel = `${QUEUE_DIR}/signals/${id}/${String(raw.attempt)}/heartbeat`
  try {
    const found = await readInside($, root, rel)
    if (found === undefined) return null
    const body = parseJson(rel, found.text)
    if (!isRecord(body)) throw new Error(`${rel}: not a JSON object`)
    const at = toMs(body.at)
    const last = toMs(raw.lastHeartbeat)
    if (at === null || (last !== null && at <= last)) return null
    return num(body.tokens)
  } catch (error) {
    errors.push(errorText(error))
    return null
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' ? clean(value) : null)

// The entries of the `bindings` key. No key gives no entry and no diagnostic (D40).
function toBindings(raw: unknown, tasks: Record<string, unknown>): PanelBinding[] {
  if (!isRecord(raw)) return []
  const found: PanelBinding[] = []
  for (const [address, value] of Object.entries(raw)) {
    if (!validId('address', address) || !isRecord(value)) continue
    const taskId = typeof value.task === 'string' && validId('task', value.task) ? value.task : null
    const task = taskId !== null && Object.hasOwn(tasks, taskId) ? tasks[taskId] : null
    const sessions = Array.isArray(value.sessions) ? value.sessions.filter(one => typeof one === 'string') : []
    found.push({
      address: clean(address),
      tool: text(value.tool),
      name: text(value.name),
      role: text(value.role),
      inSession: typeof value.inSession === 'boolean' ? value.inSession : null,
      agentId: text(value.agentId),
      lastSession: sessions.length > 0 ? clean(sessions.at(-1) as string) : null,
      state: text(value.state) ?? 'unknown',
      taskState: isRecord(task) ? text(task.state) : null,
      taskId,
    })
  }
  return found
}

async function readTasks(
  $: EngineInterface,
  root: Root,
  now: number,
  errors: string[],
): Promise<{ tasks: GuildaPanelTask[]; bindings: PanelBinding[] }> {
  const queue = await readQueue($, root, now, errors)
  const raw = queue.tasks
  const bindings = toBindings(queue.bindings, raw)
  const tasks: GuildaPanelTask[] = []
  for (const [id, value] of Object.entries(raw)) {
    if (!validId('task', id)) {
      errors.push(`${STATE_FILE}: a task ID does not match X4`)
      continue
    }
    if (!isRecord(value)) continue
    const one = toTask(id, value, errors)
    if (one.inSession === false && ACTIVE_STATES.includes(one.state)) {
      const tokens = await heartbeatTokens($, root, id, value, errors)
      if (tokens !== null) one.tokens = tokens
    }
    tasks.push(one)
  }
  return { tasks, bindings }
}

// The check of the first FAIL line of .doctor-last.json. A missing file is no mark and no diagnostic.
async function readDoctor($: EngineInterface, root: Root, errors: string[]): Promise<string | null> {
  try {
    const found = await readInside($, root, DOCTOR_FILE)
    if (found === undefined) return null
    const body = parseJson(DOCTOR_FILE, found.text)
    if (!isRecord(body) || !Array.isArray(body.lines)) throw new Error(`${DOCTOR_FILE}: no lines list`)
    const fail = body.lines.find(line => isRecord(line) && line.result === 'FAIL' && typeof line.check === 'string')
    return isRecord(fail) ? clean(fail.check as string) : null
  } catch (error) {
    errors.push(errorText(error))
    return null
  }
}

// The init progress while its file is younger than 10 min and a step is not done.
async function readInit($: EngineInterface, root: Root, now: number, errors: string[]): Promise<GuildaPanelInit | null> {
  try {
    const found = await readInside($, root, INIT_FILE)
    if (found === undefined) return null
    const body = parseJson(INIT_FILE, found.text)
    if (!isRecord(body) || !Array.isArray(body.steps)) throw new Error(`${INIT_FILE}: no steps list`)
    const at = toMs(body.at)
    if (at === null || now - at >= INIT_MAX_AGE_MS) return null
    const steps = body.steps
      .filter(isRecord)
      .map(step => ({
        name: typeof step.name === 'string' ? clean(step.name) : '',
        state: typeof step.state === 'string' ? clean(step.state) : '',
      }))
    if (steps.length === 0 || steps.every(step => step.state === 'done')) return null
    const doing = steps.findIndex(step => step.state === 'doing')
    const todo = steps.findIndex(step => step.state === 'todo')
    const open = steps.findIndex(step => step.state !== 'done')
    return { steps, current: doing >= 0 ? doing : todo >= 0 ? todo : open }
  } catch (error) {
    errors.push(errorText(error))
    return null
  }
}

function logLine(line: string): GuildaPanelLogLine {
  try {
    const event: unknown = JSON.parse(line)
    if (isRecord(event)) {
      const kind = typeof event.kind === 'string' && LOG_KINDS.includes(event.kind) ? event.kind : 'other'
      const one: GuildaPanelLogLine = { kind, text: typeof event.text === 'string' ? clean(event.text) : '' }
      const time = toMs(event.t)
      if (time !== null) one.time = time
      return one
    }
  } catch {
    // kept as text below
  }
  return { kind: 'other', text: clean(line) }
}

// The last LOG_LINES lines of .guilda/logs/<address>.jsonl. The address must match X4.
async function readLog($: EngineInterface, root: Root, address: string, errors: string[]): Promise<GuildaPanelLog> {
  if (!validId('address', address)) return { address: null, isFound: false, lines: [] }
  try {
    const found = await readInside($, root, `.guilda/logs/${address}.jsonl`, LOG_TAIL_BYTES)
    if (found === undefined) return { address, isFound: false, lines: [] }
    const lines = found.text.split('\n').filter(line => line.trim() !== '')
    return { address, isFound: true, lines: lines.slice(-LOG_LINES).map(logLine) }
  } catch (error) {
    errors.push(errorText(error))
    return { address, isFound: false, lines: [] }
  }
}

async function recordDiagnostics($: EngineInterface, folder: string, at: number, found: string[]): Promise<void> {
  // A JSON.parse message can quote the bytes of a file.
  const errors = found.map(clean)
  await update($, diagnostics, before => {
    const next: GuildaPanelDiagnostics = { folder, at, errors }
    if (before.lastPress !== undefined) {
      next.lastPress = before.lastPress
      if (before.lastPressAt !== undefined) next.lastPressAt = before.lastPressAt
    }
    const lastError = errors.at(-1) ?? before.lastError
    if (lastError !== undefined) {
      next.lastError = lastError
      next.lastErrorAt = errors.length > 0 ? at : (before.lastErrorAt ?? at)
    }
    return next
  })
}

async function recordError($: EngineInterface, error: unknown): Promise<void> {
  const before = await read($, diagnostics)
  await recordDiagnostics($, before.folder, await $.clock.now(), [...before.errors, errorText(error)])
}

// Opens the init pane on a wide terminal while the init progress is active, and closes it after.
async function placeInitPane($: EngineInterface, init: GuildaPanelInit | null): Promise<void> {
  const panes = await $.ui.panes()
  const pane = panes.find(one => one.id === INIT_PANE)
  if (init === null) {
    isInitDismissed = false
    if (pane !== undefined) await $.ui.close({ id: INIT_PANE })
    await update($, initPlaced, () => false)
    return
  }
  if (pane === undefined && !isInitDismissed && lastColumns >= INIT_PANE_COLUMNS) {
    const opened = await $.ui.open({ id: INIT_PANE, title: INIT_TITLE })
    await update($, initPlaced, () => opened.isPlaced)
    return
  }
  await update($, initPlaced, () => pane?.isPlaced === true)
}

async function poll($: EngineInterface): Promise<GuildaPanelSnapshot> {
  if (isPolling) return read($, snapshot)
  isPolling = true
  try {
    const now = await $.clock.now()
    const errors: string[] = []
    const root = await findRoot($)
    let next: PanelSnapshot = { ...EMPTY, at: now }
    if (root !== null) {
      const hasQueue = await $.fs.exists(`${root.folder}/${QUEUE_DIR}`)
      const queue = hasQueue ? await readTasks($, root, now, errors) : { tasks: [], bindings: [] }
      next = {
        at: now,
        hasQueue,
        tasks: queue.tasks,
        bindings: queue.bindings,
        doctorFail: await readDoctor($, root, errors),
        init: await readInit($, root, now, errors),
      }
      const log = await read($, logView)
      if (log.address !== null) {
        const fresh = await readLog($, root, log.address, errors)
        await update($, logView, () => fresh)
      }
    }
    await update($, snapshot, () => next)
    await recordDiagnostics($, root?.folder ?? '', now, errors)
    await placeInitPane($, next.init)
    return next
  } finally {
    isPolling = false
  }
}

const group = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// The label of a run: guilda:<role>-<tool>, for example guilda:executor-codex.
export function label(task: GuildaPanelTask): string {
  const tool = task.tool ?? 'agent'
  if (task.role === null) return tool
  return `guilda:${ROLE_NAMES[task.role] ?? task.role}-${tool}`
}

function seconds(task: GuildaPanelTask, now: number): number {
  if (ACTIVE_STATES.includes(task.state)) {
    const start = task.startedAt ?? task.since
    return start === null ? task.agentSeconds : Math.max(0, Math.round((now - start) / 1000))
  }
  return task.agentSeconds
}

// The right end of a row: `<n>s · <state> · ↓ <n> tokens`.
export function rightText(task: GuildaPanelTask, now: number): string {
  const parts = [`${seconds(task, now)}s`, task.state]
  if (task.tokens !== null) parts.push(`↓ ${group(task.tokens)} tokens`)
  return parts.join(' · ')
}

export function visibleRows(snap: GuildaPanelSnapshot): GuildaPanelTask[] {
  return snap.tasks.filter(task => {
    if (task.inSession !== false) return false
    if (ACTIVE_STATES.includes(task.state)) return true
    return FINISHED_STATES.includes(task.state) && task.since !== null && snap.at - task.since < LINGER_MS
  })
}

// The bound external agents that have a row: not in the session, state bound. An entry whose task already has a
// task row has no second row.
export function bindingRows(snap: PanelSnapshot): PanelBinding[] {
  const shown = visibleRows(snap)
  return (snap.bindings ?? []).filter(
    one =>
      one.state === 'bound' &&
      one.inSession === false &&
      !shown.some(task => task.address === one.address || (one.taskId !== null && task.id === one.taskId)),
  )
}

// guilda:<role name>-<tool>, or guilda:<name>-<tool> for a joined agent.
export function bindingLabel(one: PanelBinding): string {
  const tool = one.tool ?? 'agent'
  const who = one.role !== null ? (ROLE_NAMES[one.role] ?? one.role) : (one.name ?? one.address)
  return `guilda:${who}-${tool}`
}

export function bindingRight(one: PanelBinding): string {
  return one.taskState === 'running' ? 'running' : 'idle'
}

export function bindingLine(one: PanelBinding): string {
  return [
    one.address,
    one.tool ?? '-',
    one.agentId !== null ? `agent ${one.agentId}` : `session ${one.lastSession ?? '-'}`,
    one.state,
  ].join(' · ')
}

export function workText(tasks: readonly GuildaPanelTask[]): string {
  const total = tasks.reduce((sum, task) => sum + task.agentSeconds, 0)
  return `agent work: ${(total / SECONDS_PER_HOUR).toFixed(1)} h`
}

export function detailLine(task: GuildaPanelTask, now: number, withLabel = true): string {
  const tokens = task.tokens === null ? 'no tokens' : `↓ ${group(task.tokens)} tokens`
  return [
    task.id,
    ...(withLabel ? [label(task)] : []),
    task.state,
    task.address ?? '-',
    `agent ${task.agentId ?? '-'}`,
    tokens,
    `${seconds(task, now)}s`,
  ].join(' · ')
}

function clockText(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19)
}

export function logLineText(line: GuildaPanelLogLine): string {
  const text = line.text.replace(/\s+/g, ' ').trim()
  return `${line.time !== undefined ? `${clockText(line.time)}  ` : ''}${line.kind.padEnd(7)}  ${text}`
}

function timeText(ms: number | undefined): string {
  return ms !== undefined && ms > 0 ? new Date(ms).toISOString() : 'never'
}

export function diagnosticsText(diag: GuildaPanelDiagnostics, snap: GuildaPanelSnapshot, pane: string): string {
  return [
    `guilda-panel: reads ${diag.folder === '' ? '(no .guilda folder)' : `${diag.folder}/.guilda/`}`,
    `  queue: ${snap.hasQueue ? 'found' : 'not found'}`,
    `  tasks: ${snap.tasks.length}`,
    `  last poll: ${timeText(diag.at)}`,
    `  errors: ${diag.errors.length === 0 ? 'none' : diag.errors.join('; ')}`,
    `  last error: ${diag.lastError === undefined ? 'none' : `${diag.lastError} (at ${timeText(diag.lastErrorAt)})`}`,
    `  last press: ${diag.lastPress === undefined ? 'none' : `${diag.lastPress} at ${timeText(diag.lastPressAt)}`}`,
    `  pane: ${pane}`,
  ].join('\n')
}

async function openLog($: EngineInterface, address: string): Promise<string> {
  if (!validId('address', address)) return 'guilda-panel: invalid address'
  const snap = await read($, snapshot)
  const task = snap.tasks.find(one => one.address === address)
  if (task === undefined) return `guilda-panel: no task has the address ${address}`
  const diag = await read($, diagnostics)
  const errors: string[] = []
  const root = await findRoot($)
  const log = root === null ? { address, isFound: false, lines: [] } : await readLog($, root, address, errors)
  await update($, logView, () => log)
  if (errors.length > 0) await recordDiagnostics($, diag.folder, await $.clock.now(), [...diag.errors, ...errors])
  await $.ui.open({ id: LOG_PANE, title: `guilda: ${label(task)} log` })
  return `guilda-panel: log of ${address} (${label(task)}) opened`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    startCwd = e.cwd
    await $.command.register({
      name: 'guilda-agents',
      description: 'Show each guilda task of this project in a pane, with diagnostics; `log <address>` opens the log of an agent',
      argumentHint: '[log <address>]',
    })
    timer?.cancel()
    timer = $.clock.every(POLL_MS, () => {
      void poll($).catch(error => recordError($, error))
    })
    await poll($).catch(error => recordError($, error))
    return next(e)
  })

  on('session.end', ($, e, next) => {
    // A /clear ends the conversation, not the process, and no session.start follows it: keep polling then.
    if (e.reason !== 'clear') {
      timer?.cancel()
      timer = undefined
    }
    return next(e)
  })

  on('ui.close', ($, e, next) => {
    if (e.id === INIT_PANE && e.origin.kind === 'person') isInitDismissed = true
    // The log pane forgets its address. A failed write never keeps the pane open.
    if (e.id === LOG_PANE) void update($, logView, () => NO_LOG).catch(error => recordError($, error))
    return next(e)
  })

  // A press of a row's label. The hook runs with the event's own `$`, and it records the press in the
  // diagnostics, so /guilda-agents shows whether a click on the row reached the mod.
  on('ui.press', async ($, e, next) => {
    if (!e.element.startsWith(PRESS_PREFIX)) return next(e)
    const address = e.element.slice(PRESS_PREFIX.length)
    const result = await openLog($, address).catch(error => `failed: ${errorText(error)}`)
    const outcome = result.endsWith('opened') ? 'log opened' : clean(result)
    const at = await $.clock.now()
    await update($, diagnostics, before => ({ ...before, lastPress: `${PRESS_PREFIX}${address} (${outcome})`, lastPressAt: at }))
    return { element: e.element }
  })

  on('command.run', { command: 'guilda-agents' }, async ($, e) => {
    const snap = await poll($).catch(async error => {
      await recordError($, error)
      return read($, snapshot)
    })
    const words = e.args.trim().split(/\s+/).filter(word => word !== '')
    if (words[0] === 'log') {
      if (words.length !== 2) return { text: 'guilda-panel: usage: /guilda-agents log <address>' }
      return { text: await openLog($, words[1] as string) }
    }
    const opened = await $.ui.open({ id: DETAIL_PANE, title: DETAIL_TITLE })
    const pane = opened.isPlaced ? 'opened' : `open, not drawn: ${opened.reason}`
    return { text: diagnosticsText(await read($, diagnostics), snap, pane) }
  })

  // The detail pane: each task of the queue, of each tool.
  on('ui.render', { component: 'Pane', requestId: DETAIL_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap: PanelSnapshot = await read($, snapshot)
    const bound = snap.bindings ?? []
    if (snap.tasks.length === 0 && bound.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No guilda tasks.</Text>
        </Box>
      )
    }
    // Section 4h lists the state, the address, the agent ID, the tokens and the time. The label is the field
    // to drop first when a line does not fit the pane.
    const withLabel = snap.tasks.every(task => detailLine(task, snap.at).length <= e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {snap.tasks.map(task => (
          <Text key={`task:${task.id}`} wrap="truncate-end">
            {detailLine(task, snap.at, withLabel)}
          </Text>
        ))}
        {bound.map(one => (
          <Text key={`binding:${one.address}`} wrap="truncate-end">
            {bindingLine(one)}
          </Text>
        ))}
      </Box>
    )
  })

  // The log pane: the label, the time, the state and the tokens, the address, then the last lines of the log.
  on('ui.render', { component: 'Pane', requestId: LOG_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const log = await read($, logView)
    const task = snap.tasks.find(one => one.address !== null && one.address === log.address)
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">{task === undefined ? 'guilda log' : `${label(task)} · ${rightText(task, snap.at)}`}</Text>
        <Text dimColor wrap="truncate-middle">
          {log.address ?? '-'}
        </Text>
        {!log.isFound ? (
          <Text dimColor>no log yet</Text>
        ) : (
          log.lines.map((line, index) => (
            <Text key={`log:${index}`} dimColor={line.kind !== 'message'} wrap="truncate-end">
              {logLineText(line)}
            </Text>
          ))
        )}
      </Box>
    )
  })

  // The init progress pane: each step with its state.
  on('ui.render', { component: 'Pane', requestId: INIT_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { init } = await read($, snapshot)
    if (init === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No guilda init in progress.</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text bold>{INIT_TITLE}</Text>
        {init.steps.map((step, index) => (
          <Text key={`step:${index}`} dimColor={step.state === 'done'} wrap="truncate-end">
            {`${index + 1}. ${step.name} · ${step.state}`}
          </Text>
        ))}
      </Box>
    )
  })

  // Under the hint line of the prompt: the heading, one row for each external agent, the work hours, and the
  // init row on a narrow terminal. The hint line stays as the engine draws it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.viewport !== undefined) lastColumns = e.viewport.columns
    const snap: PanelSnapshot = await read($, snapshot)
    const isPlaced = await read($, initPlaced)
    const rows = visibleRows(snap)
    const boundRows = bindingRows(snap)
    const showsBlock = snap.hasQueue && (rows.length > 0 || boundRows.length > 0 || snap.doctorFail !== null)
    const init = snap.init
    const showsInit = init !== null && (lastColumns < INIT_PANE_COLUMNS || !isPlaced)
    if (!showsBlock && !showsInit) return next(e)
    const line = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const heading = snap.doctorFail === null ? HEADING : `${HEADING} · doctor: ${snap.doctorFail} FAIL`
    const onOpen = (address: string) => () => {
      void openLog($, address).catch(error => recordError($, error))
    }

    return (
      <Box flexDirection="column">
        {line}
        {showsBlock && (
          <Text key="heading" dimColor wrap="truncate-end">
            {heading}
          </Text>
        )}
        {showsBlock &&
          rows.map(task => {
            // One hover group for each row: the pointer on a part lights each part and shows the arrow.
            const scope = `row-${task.address ?? task.id}`.slice(0, 64)
            return (
              <Box key={`row:${task.id}`} flexDirection="row" gap={2} hover={{ scope }}>
                <Box flexShrink={0} width={1} hover={{ scope }}>
                  <Text dimColor hover={{ scope }}>
                    {MARKER}
                  </Text>
                  <Box position="absolute" left={0} top={0} display="none" hover={{ scope, display: 'flex' }}>
                    <Text>{HOVER_MARKER}</Text>
                  </Box>
                </Box>
                <Box flexShrink={0} hover={{ scope }}>
                  {task.address !== null ? (
                    <Button
                      key={`${PRESS_PREFIX}${task.address}`}
                      plain
                      dimColor
                      hover={{ scope, dimColor: false }}
                      onPress={onOpen(task.address)}
                    >
                      {label(task)}
                    </Button>
                  ) : (
                    <Text dimColor hover={{ scope }}>
                      {label(task)}
                    </Text>
                  )}
                </Box>
                <Box flexGrow={1} flexShrink={1} minWidth={0} hover={{ scope }}>
                  <Text dimColor wrap="truncate-middle" hover={{ scope }}>
                    {task.title}
                  </Text>
                </Box>
                <Box flexShrink={0} hover={{ scope }}>
                  <Text dimColor hover={{ scope }}>
                    {rightText(task, snap.at)}
                  </Text>
                </Box>
              </Box>
            )
          })}
        {showsBlock &&
          boundRows.map(one => {
            const scope = `row-${one.address}`.slice(0, 64)
            return (
              <Box key={`binding:${one.address}`} flexDirection="row" gap={2} hover={{ scope }}>
                <Box flexShrink={0} width={1} hover={{ scope }}>
                  <Text dimColor hover={{ scope }}>
                    {MARKER}
                  </Text>
                </Box>
                <Box flexShrink={0} hover={{ scope }}>
                  <Text dimColor hover={{ scope }}>
                    {bindingLabel(one)}
                  </Text>
                </Box>
                <Box flexGrow={1} flexShrink={1} minWidth={0} />
                <Box flexShrink={0} hover={{ scope }}>
                  <Text dimColor hover={{ scope }}>
                    {bindingRight(one)}
                  </Text>
                </Box>
              </Box>
            )
          })}
        {showsBlock && (
          <Text key="work" dimColor wrap="truncate-end">
            {workText(snap.tasks)}
          </Text>
        )}
        {showsInit && init !== null && (
          <Text key="init" dimColor wrap="truncate-end">
            {`guilda init: step ${init.current + 1} of ${init.steps.length} — ${init.steps[init.current]?.name ?? ''}`}
          </Text>
        )}
      </Box>
    )
  })
}
