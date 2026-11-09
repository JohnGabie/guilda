import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type {
  GuildaPanelAgent,
  GuildaPanelDiagnostics,
  GuildaPanelLog,
  GuildaPanelLogLine,
  GuildaPanelSnapshot,
  GuildaPanelTool,
} from '../types'

const PANE = 'guilda-agents'
const TITLE = 'guilda agents'
const POLL_MS = 2000
// How long a row stays under the prompt after its agent is done or failed.
const LINGER_MS = 10_000
const EMPTY: GuildaPanelSnapshot = { agents: [], at: 0 }
const NO_DIAGNOSTICS: GuildaPanelDiagnostics = { folder: '', looked: [], isFound: false, count: 0, at: 0 }

// Bump the shape when the snapshot's fields change: it declines what an older
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'guilda-panel', key: 'snapshot' } as const, EMPTY, {
  shape: 'snapshot-3',
})

// What the last poll saw, for /guilda-agents: the folder, whether the file was
// there, the agent count, the poll time and the last error.
const diagnostics = atom({ plugin: 'guilda-panel', key: 'diagnostics' } as const, NO_DIAGNOSTICS, {
  shape: 'diagnostics-1',
})

// The agents whose log pane was opened (the last LOG_PANES), and the tail of
// each one's log as the last poll read it.
const LOG_PANES = 5
const LOG_LINES = 15
const LOG_PANE_PREFIX = 'guilda-log-'
const logOpen = atom({ plugin: 'guilda-panel', key: 'logOpen' } as const, [] as string[], { shape: 'log-open-1' })
const logs = atom({ plugin: 'guilda-panel', key: 'logs' } as const, {} as Record<string, GuildaPanelLog>, {
  shape: 'logs-1',
})

// Whether the last PromptHint drawing was on the fullscreen terminal: for
// /guilda-agents, since the pointer (hover, click) reaches a mod's elements
// where the surface reports it. A drawing may not write $.state.
let lastScreen: string = 'not drawn yet'

const TOOL_LABEL: Record<GuildaPanelTool, string> = { claude: 'Claude', codex: 'Codex', other: '?' }
const TOOL_COLOR: Record<GuildaPanelTool, string> = { claude: 'claude', codex: 'ide', other: 'inactive' }
const STATE_COLOR: Record<string, string> = {
  running: 'warning',
  done: 'success',
  failed: 'error',
  review: 'suggestion',
}

// `codex` as the command, after any `cd X &&` and an optional `timeout [opts] N`.
const CODEX_COMMAND =
  /^\s*(?:cd\s+\S+\s*&&\s*)*(?:timeout\s+(?:-\S+\s+)*\d+(?:\.\d+)?[smhd]?\s+)?(?:\S*\/)?codex(?:\s|$)/

export function isCodexCommand(command: unknown): boolean {
  return typeof command === 'string' && CODEX_COMMAND.test(command)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toTool(value: unknown): GuildaPanelTool {
  return value === 'claude' || value === 'codex' ? value : 'other'
}

function toTime(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return ms
  }
  return undefined
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// A missing file is `undefined`; a file that does not read or parse rejects,
// so the poll records why.
async function readJson($: EngineInterface, path: string): Promise<unknown> {
  if (!(await $.fs.exists(path))) return undefined
  const text = await $.fs.read(path)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${path}: ${errorText(error)}`)
  }
}

function queueTasks(queue: unknown): Record<string, unknown>[] {
  const list = Array.isArray(queue) ? queue : isRecord(queue) && Array.isArray(queue.tasks) ? queue.tasks : []
  return list.filter(isRecord)
}

export function buildAgents(
  bindings: unknown,
  queue: unknown,
  previous: readonly GuildaPanelAgent[],
  now: number,
): GuildaPanelAgent[] {
  if (!isRecord(bindings)) return []
  const tasks = queueTasks(queue)
  const agents: GuildaPanelAgent[] = []
  for (const [address, binding] of Object.entries(bindings)) {
    if (!isRecord(binding)) continue
    const task = tasks.filter(one => one.agent === address).at(-1)
    const state =
      typeof binding.state === 'string'
        ? binding.state
        : typeof task?.state === 'string'
          ? task.state
          : 'idle'
    const before = previous.find(one => one.address === address)
    // Kept while the state holds: a binding rewritten for its token count only
    // moves `updated`, not the state.
    const changedAt =
      before !== undefined && before.state === state ? before.changedAt : (toTime(binding.updated) ?? now)
    const agent: GuildaPanelAgent = { address, tool: toTool(binding.tool), state, changedAt }
    if (typeof task?.id === 'string') agent.task = task.id
    if (typeof binding.role === 'string' && binding.role !== '') agent.role = binding.role
    const title = typeof binding.title === 'string' ? binding.title : task?.title
    if (typeof title === 'string' && title !== '') agent.title = title
    if (agent.tool === 'other' && typeof binding.tool === 'string' && binding.tool !== '') agent.toolName = binding.tool
    if (binding.inSession === true) agent.inSession = true
    // When it began running: kept from the poll that first saw it running.
    const startedAt = state === 'running' ? (before?.state === 'running' ? before.startedAt : changedAt) : before?.startedAt
    if (startedAt !== undefined) agent.startedAt = startedAt
    if (typeof binding.tokens === 'number' && Number.isFinite(binding.tokens) && binding.tokens >= 0) {
      agent.tokens = binding.tokens
    }
    agents.push(agent)
  }
  return agents
}

// An address that is safe as a file name and a pane id: letters, digits,
// `_`, `-` and `.`, not starting with a dot.
export function isSafeAddress(address: string): boolean {
  return /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,55}$/.test(address)
}

function clockText(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19)
}

// One log line as drawn: `HH:MM:SS  <kind>  <text>`, on one row.
export function logLineText(line: GuildaPanelLogLine): string {
  const text = line.text.replace(/\s+/g, ' ').trim()
  return `${line.time !== undefined ? `${clockText(line.time)}  ` : ''}${line.kind.padEnd(7)}  ${text}`
}

export function logPaneId(address: string): string {
  return `${LOG_PANE_PREFIX}${address.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64)
}

const LOG_KINDS = new Set(['command', 'message', 'file', 'tokens', 'state'])

// The last `count` lines of a `.guilda/logs/<address>.jsonl` text, one event
// each: `{ time, kind, text }`. A line that does not parse is kept as text.
export function logTail(text: string, count = LOG_LINES): GuildaPanelLogLine[] {
  const lines = text.split('\n').filter(line => line.trim() !== '')
  return lines.slice(-count).map(line => {
    try {
      const event: unknown = JSON.parse(line)
      if (isRecord(event)) {
        const kind = typeof event.kind === 'string' && LOG_KINDS.has(event.kind) ? event.kind : 'other'
        const one: GuildaPanelLogLine = { kind, text: typeof event.text === 'string' ? event.text : '' }
        const time = toTime(event.time)
        if (time !== undefined) one.time = time
        return one
      }
    } catch {
      // kept as text below
    }
    return { kind: 'other', text: line }
  })
}

// The folder session.start saw, and the poll timer. Both are set again by
// session.start, which runs after every load and reload of this module.
let startCwd: string | undefined
let timer: Timer | undefined
let isPolling = false

// The folders to look in, in order: where the session runs now, its project
// root, and where it ran at session.start. The working directory moves during
// a session (`cd`, `/cd`, a worktree), so they are read again at each poll.
async function folders($: EngineInterface): Promise<string[]> {
  const found: string[] = []
  const cwd = await $.session.cwd()
  const root = await $.session.root()
  for (const one of [cwd, root, startCwd]) {
    if (one !== undefined && one !== '' && !found.includes(one)) found.push(one)
  }
  return found
}

async function writeDiagnostics($: EngineInterface, value: GuildaPanelDiagnostics): Promise<void> {
  await update($, diagnostics, () => value)
}

async function recordError($: EngineInterface, error: unknown): Promise<void> {
  const before = await read($, diagnostics)
  await writeDiagnostics($, { ...before, error: errorText(error), errorAt: await $.clock.now() })
}

// Reads the log of each agent whose log pane is open; a missing file is
// `isFound: false` ("no log yet").
async function readLogs($: EngineInterface, folder: string, addresses: readonly string[], now: number): Promise<void> {
  if (addresses.length === 0 || folder === '') return
  const read: Record<string, GuildaPanelLog> = {}
  for (const address of addresses) {
    if (!isSafeAddress(address)) continue
    const path = `${folder}/.guilda/logs/${address}.jsonl`
    try {
      read[address] = (await $.fs.exists(path))
        ? { isFound: true, lines: logTail(await $.fs.read(path)), at: now }
        : { isFound: false, lines: [], at: now }
    } catch (error) {
      read[address] = { isFound: false, lines: [], at: now, error: errorText(error) }
    }
  }
  await update($, logs, before => ({ ...before, ...read }))
}

// Opens the log pane of one agent: remembers it for the poll, reads its log
// once now, then opens `guilda: <label> log`.
async function openLog($: EngineInterface, address: string): Promise<void> {
  const { agents } = await read($, snapshot)
  const agent = agents.find(one => one.address === address)
  if (agent === undefined || !isSafeAddress(address)) return
  const open = await update($, logOpen, before => [...before.filter(one => one !== address), address].slice(-LOG_PANES))
  const diag = await read($, diagnostics)
  await readLogs($, diag.folder, open, await $.clock.now())
  await $.ui.open({ id: logPaneId(address), title: `guilda: ${agentType(agent)} log` })
}

async function poll($: EngineInterface): Promise<GuildaPanelSnapshot> {
  const before = await read($, snapshot)
  if (isPolling) return before
  isPolling = true
  try {
    const now = await $.clock.now()
    const looked = await folders($)
    let folder = looked[0] ?? ''
    let isFound = false
    for (const one of looked) {
      if (await $.fs.exists(`${one}/.guilda/bindings.json`)) {
        folder = one
        isFound = true
        break
      }
    }
    let bindings: unknown
    let queue: unknown
    let error: string | undefined
    try {
      bindings = isFound ? await readJson($, `${folder}/.guilda/bindings.json`) : undefined
      if (isFound && !isRecord(bindings)) throw new Error(`${folder}/.guilda/bindings.json: not a JSON object`)
      queue = isRecord(bindings) ? await readJson($, `${folder}/.guilda/queue.json`) : undefined
    } catch (failure) {
      error = errorText(failure)
    }
    const agents = buildAgents(bindings, queue, before.agents, now)
    // The last error stays until a newer one replaces it.
    const previous = await read($, diagnostics)
    const seen: GuildaPanelDiagnostics = { folder, looked, isFound, count: agents.length, at: now }
    const lastError = error ?? previous.error
    if (lastError !== undefined) {
      seen.error = lastError
      seen.errorAt = error !== undefined ? now : (previous.errorAt ?? now)
    }
    await writeDiagnostics($, seen)
    if (agents.length === 0 && before.agents.length === 0) return before

    for (const agent of agents) {
      const old = before.agents.find(one => one.address === agent.address)
      const isFinished = agent.state === 'done' || agent.state === 'failed'
      if (isExternal(agent) && old !== undefined && old.state !== agent.state && isFinished) {
        $.ui.toast(`guilda: ${agent.address} (${TOOL_LABEL[agent.tool]}) ${agent.state}`)
      }
    }

    const next: GuildaPanelSnapshot = { agents, at: now }
    await update($, snapshot, () => next)
    await readLogs($, folder, await read($, logOpen), now)
    return next
  } finally {
    isPolling = false
  }
}

function timeText(ms: number): string {
  return ms > 0 ? new Date(ms).toISOString() : 'never'
}

export function diagnosticsText(
  diag: GuildaPanelDiagnostics,
  pane: string,
  agents: readonly GuildaPanelAgent[] = [],
): string {
  const lines = [
    `guilda-panel: reads ${diag.folder === '' ? '(no folder)' : `${diag.folder}/.guilda/`}`,
    `  looked in: ${diag.looked.length === 0 ? '(none)' : diag.looked.join(', ')}`,
    `  bindings.json: ${diag.isFound ? 'found' : 'not found'}`,
    `  agents: ${diag.count}`,
    `  last poll: ${timeText(diag.at)}`,
    `  last error: ${diag.error === undefined ? 'none' : `${diag.error} (at ${timeText(diag.errorAt ?? 0)})`}`,
    `  pane: ${pane}`,
  ]
  for (const agent of agents) {
    const where = isExternal(agent) ? '' : ' (in session, not in the rows)'
    lines.push(`  - ${agent.address}: ${agentType(agent)}, ${agent.state}${agent.title !== undefined ? `, ${agent.title}` : ''}${where}`)
  }
  return lines.join('\n')
}

// Agents outside this conversation: an external tool (codex, another CLI).
// Claude agents, and any binding marked `inSession`, are this session's own
// subagents, which the engine's agent list already shows.
export function isExternal(agent: GuildaPanelAgent): boolean {
  return agent.tool !== 'claude' && agent.inSession !== true
}

// External agents running, and those done or failed less than LINGER_MS ago.
export function visibleAgents(agents: readonly GuildaPanelAgent[], now: number): GuildaPanelAgent[] {
  return agents.filter(agent => {
    if (!isExternal(agent)) return false
    if (agent.state === 'running') return true
    const isFinished = agent.state === 'done' || agent.state === 'failed'
    return isFinished && agent.startedAt !== undefined && now - agent.changedAt < LINGER_MS
  })
}

export function tokenText(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens))
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

const TOOL_NAME: Record<GuildaPanelTool, string> = { claude: 'claude', codex: 'codex', other: 'agent' }

// The type column, in guilda's naming: `guilda:<role>-<tool>`
// (`guilda:executor-codex`), or the tool name alone when the binding has no role.
export function agentType(agent: GuildaPanelAgent): string {
  const tool = agent.toolName ?? TOOL_NAME[agent.tool]
  return agent.role !== undefined ? `guilda:${agent.role}-${tool}` : tool
}

// The marker before each row: a hollow diamond, not the engine's `○`/`●`,
// which mark its own pressable agent rows. U+25C7, in the common terminal fonts.
export const MARKER = '◇'
// Drawn over the marker while the pointer is on the row: a click on the
// row's type opens that agent's log pane.
export const HOVER_MARKER = '›'
// The dim label over the rows, so they read as a group of their own.
export const HEADING = 'other models'

export type RowParts = { type: string; title: string; right: string }

// The three texts of a row: the type column, the title (the address stays in
// /guilda-agents and the pane), and the right end, which is never cut.
export function rowParts(agent: GuildaPanelAgent, now: number): RowParts {
  const end = agent.state === 'running' ? now : agent.changedAt
  const seconds = Math.max(0, Math.round((end - (agent.startedAt ?? agent.changedAt)) / 1000))
  const right = [
    `${seconds}s`,
    agent.state,
    ...(agent.tokens !== undefined ? [`↓ ${tokenText(agent.tokens)} tokens`] : []),
  ].join(' · ')
  return { type: agentType(agent), title: agent.title ?? '', right }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    startCwd = e.cwd
    await $.command.register({
      name: 'guilda-agents',
      description: 'Show the guilda agents of this project in a pane, with diagnostics; `log [address|role]` opens an agent log',
      argumentHint: '[log [address|role]]',
    })
    timer?.cancel()
    timer = $.clock.every(POLL_MS, () => {
      void poll($).catch(error => recordError($, error))
    })
    await poll($).catch(error => recordError($, error))

    return next(e)
  })

  on('session.end', ($, e, next) => {
    // A /clear ends the conversation, not the process, and no session.start
    // follows it: keep polling then.
    if (e.reason !== 'clear') {
      timer?.cancel()
      timer = undefined
    }
    return next(e)
  })

  on('command.run', { command: 'guilda-agents' }, async ($, e) => {
    const now = await poll($).catch(async error => {
      await recordError($, error)
      return read($, snapshot)
    })
    // `/guilda-agents log [address or role]` opens a log pane without the pointer.
    const words = e.args.trim().split(/\s+/).filter(word => word !== '')
    if (words[0] === 'log') {
      const wanted = words[1]
      const external = now.agents.filter(isExternal)
      const agent =
        wanted === undefined
          ? (external.find(one => one.state === 'running') ?? external[0])
          : external.find(one => one.address === wanted || one.role === wanted)
      if (agent === undefined) return { text: `guilda-panel: no external agent${wanted !== undefined ? ` matches ${wanted}` : ''}` }
      await openLog($, agent.address)
      return { text: `guilda-panel: log of ${agent.address} (${agentType(agent)}) opened` }
    }
    let pane = 'not opened (no agents)'
    if (now.agents.length > 0) {
      const opened = await $.ui.open({ id: PANE, title: TITLE })
      pane = opened.isPlaced ? 'opened' : `open, not drawn: ${opened.reason}`
    }
    return { text: `${diagnosticsText(await read($, diagnostics), pane, now.agents)}\n  screen: ${lastScreen}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { agents, at } = await read($, snapshot)

    if (agents.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No guilda agents.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {agents.map(agent => (
          <Box key={`row:${agent.address}`} flexDirection="row" gap={1}>
            <Text>{agent.address}</Text>
            <Text color={TOOL_COLOR[agent.tool]}>{TOOL_LABEL[agent.tool]}</Text>
            <Text color={STATE_COLOR[agent.state]} dimColor={STATE_COLOR[agent.state] === undefined}>
              {agent.state}
            </Text>
            <Text dimColor>{`${Math.max(0, Math.round((at - agent.changedAt) / 1000))}s`}</Text>
            {agent.task !== undefined && <Text dimColor>{agent.task}</Text>}
          </Box>
        ))}
      </Box>
    )
  })

  // An agent's log pane: its type, state and time at the top, then the last
  // lines of `.guilda/logs/<address>.jsonl`, read again at each poll.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const requestId = e.requestId ?? ''
    if (!requestId.startsWith(LOG_PANE_PREFIX)) return next(e)
    const { agents, at } = await read($, snapshot)
    const agent = agents.find(one => logPaneId(one.address) === requestId)
    const { Box, Text } = $.ui.resolve(e)
    if (agent === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>This agent is no longer in .guilda/bindings.json.</Text>
        </Box>
      )
    }
    const log = (await read($, logs))[agent.address]
    const parts = rowParts(agent, at)

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">{`${parts.type} · ${parts.right}`}</Text>
        <Text dimColor wrap="truncate-middle">
          {agent.address}
        </Text>
        {log === undefined || !log.isFound ? (
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

  // The external agents at work, under a dim `other models` heading, one dim
  // row each, laid out like the engine's own agent list:
  // `◇  guilda:<role>-<tool>  <title>  ...  <elapsed>s · <state>[ · ↓ <n> tokens]`.
  // No render site sits inside or under that list; the hint line under the
  // prompt is the lowest one, so the rows go right under the engine's hint
  // line, which is kept as drawn. The right end never shrinks; the title takes
  // what is left and is cut in the middle, on one row.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { agents, at } = await read($, snapshot)
    const shown = visibleAgents(agents, at)
    if (shown.length === 0) return next(e)
    const line = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    lastScreen = e.viewport?.isFullscreen === true ? 'fullscreen' : e.viewport?.isFullscreen === false ? 'main screen' : 'unknown'
    const onOpen = (address: string) => () => {
      void openLog($, address).catch(error => recordError($, error))
    }

    return (
      <Box flexDirection="column">
        {line}
        <Text key="heading" dimColor wrap="truncate-end">
          {HEADING}
        </Text>
        {shown.map(agent => {
          const parts = rowParts(agent, at)
          // One hover group per row: the pointer on any of its parts lights all
          // of them, and reveals the arrow over the marker. A group needs no
          // keyed Box around it.
          const scope = `row-${agent.address}`.slice(0, 64)
          return (
            <Box key={`row:${agent.address}`} flexDirection="row" gap={2} hover={{ scope }}>
              <Box flexShrink={0} width={1} hover={{ scope }}>
                <Text dimColor hover={{ scope }}>
                  {MARKER}
                </Text>
                <Box position="absolute" left={0} top={0} display="none" hover={{ scope, display: 'flex' }}>
                  <Text>{HOVER_MARKER}</Text>
                </Box>
              </Box>
              <Box flexShrink={0} hover={{ scope }}>
                <Button
                  key={`open:${agent.address}`}
                  plain
                  dimColor
                  hover={{ scope, dimColor: false }}
                  onPress={onOpen(agent.address)}
                >
                  {parts.type}
                </Button>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0} hover={{ scope }}>
                <Text dimColor wrap="truncate-middle" hover={{ scope }}>
                  {parts.title}
                </Text>
              </Box>
              <Box flexShrink={0} hover={{ scope }}>
                <Text dimColor hover={{ scope }}>
                  {parts.right}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    const input = e.props.input
    const command = isRecord(input) ? input.command : undefined
    if (!isCodexCommand(command)) return next(e)
    const row = await next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text color={TOOL_COLOR.codex}>Codex</Text>
        {row}
      </Box>
    )
  })
}
