import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type {
  GuildaPanelAgent,
  GuildaPanelDiagnostics,
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

function width(text: string): number {
  return [...text].length
}

// Cuts the middle of `text` to `room` cells, an ellipsis in its place.
function cutMiddle(text: string, room: number): string {
  const chars = [...text]
  if (chars.length <= room) return text
  if (room <= 0) return ''
  if (room === 1) return '…'
  const head = Math.ceil((room - 1) / 2)
  const tail = room - 1 - head
  return chars.slice(0, head).join('') + '…' + (tail > 0 ? chars.slice(-tail).join('') : '')
}

// One row, exactly `columns` cells when it fits: the middle text (address and
// task) is cut first, never the right end.
export function agentRow(agent: GuildaPanelAgent, now: number, columns: number): string {
  const end = agent.state === 'running' ? now : agent.changedAt
  const seconds = Math.max(0, Math.round((end - (agent.startedAt ?? agent.changedAt)) / 1000))
  const right = [`${seconds}s`, agent.state, ...(agent.tokens !== undefined ? [`↓ ${tokenText(agent.tokens)} tokens`] : [])].join(' · ')
  const left = `○  ${agentType(agent)}  `
  // The address stays in /guilda-agents and the pane.
  const middle = agent.title ?? ''
  const gap = 2
  const room = columns - width(left) - width(right) - gap
  if (room < (middle === '' ? 0 : 4)) {
    // No room for a readable title: type and right end only, or both cut.
    const pad = columns - width(left) - width(right)
    return pad >= 0 ? `${left}${' '.repeat(pad)}${right}` : cutMiddle(`${left}${right}`, columns)
  }
  const shown = cutMiddle(middle, room)
  return `${left}${shown}${' '.repeat(columns - width(left) - width(shown) - width(right))}${right}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    startCwd = e.cwd
    await $.command.register({
      name: 'guilda-agents',
      description: 'Show the guilda agents of this project (Claude or Codex) in a pane, with diagnostics',
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

  on('command.run', { command: 'guilda-agents' }, async $ => {
    const now = await poll($).catch(async error => {
      await recordError($, error)
      return read($, snapshot)
    })
    let pane = 'not opened (no agents)'
    if (now.agents.length > 0) {
      const opened = await $.ui.open({ id: PANE, title: TITLE })
      pane = opened.isPlaced ? 'opened' : `open, not drawn: ${opened.reason}`
    }
    return { text: diagnosticsText(await read($, diagnostics), pane, now.agents) }
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

  // The external agents at work, one dim row each, drawn like the engine's own
  // agent list: `○  guilda:<role>-<tool>  <title>` and, at the right end,
  // `<elapsed>s · <state>[ · ↓ <n> tokens]`. No render site sits inside or
  // under that list; the hint line under the prompt is the lowest one, so the
  // rows go right under the engine's hint line, which is kept as drawn.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { agents, at } = await read($, snapshot)
    const shown = visibleAgents(agents, at)
    if (shown.length === 0) return next(e)
    const line = await next(e)
    const columns = e.viewport?.columns ?? 80
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {line}
        {shown.map(agent => (
          <Text key={`row:${agent.address}`} dimColor wrap="truncate-end">
            {agentRow(agent, at, columns)}
          </Text>
        ))}
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
