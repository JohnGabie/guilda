import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { GuildaPanelAgent, GuildaPanelSnapshot, GuildaPanelTool } from '../types'

const PANE = 'guilda-agents'
const TITLE = 'guilda agents'
const POLL_MS = 2000
const EMPTY: GuildaPanelSnapshot = { agents: [], at: 0 }

// Bump the shape when the snapshot's fields change: it declines what an older
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'guilda-panel', key: 'snapshot' } as const, EMPTY, {
  shape: 'snapshot-1',
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

async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return undefined
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
    const changedAt =
      toTime(binding.updated) ?? (before !== undefined && before.state === state ? before.changedAt : now)
    const agent: GuildaPanelAgent = { address, tool: toTool(binding.tool), state, changedAt }
    if (typeof task?.id === 'string') agent.task = task.id
    agents.push(agent)
  }
  return agents
}

// The project the session runs in, and the poll timer. Both are set again by
// session.start, which runs after every load and reload of this module.
let projectDir: string | undefined
let timer: Timer | undefined
let isPolling = false

async function poll($: EngineInterface): Promise<GuildaPanelSnapshot> {
  const before = await read($, snapshot)
  if (projectDir === undefined || isPolling) return before
  isPolling = true
  try {
    const bindings = await readJson($, `${projectDir}/.guilda/bindings.json`)
    const queue = isRecord(bindings) ? await readJson($, `${projectDir}/.guilda/queue.json`) : undefined
    const now = await $.clock.now()
    const agents = buildAgents(bindings, queue, before.agents, now)
    if (agents.length === 0 && before.agents.length === 0) return before

    for (const agent of agents) {
      const old = before.agents.find(one => one.address === agent.address)
      const isFinished = agent.state === 'done' || agent.state === 'failed'
      if (old !== undefined && old.state !== agent.state && isFinished) {
        $.ui.toast(`guilda: ${agent.address} (${TOOL_LABEL[agent.tool]}) ${agent.state}`)
      }
    }

    const next: GuildaPanelSnapshot = { agents, at: now }
    await update($, snapshot, () => next)
    if (before.agents.length === 0 && agents.length > 0) {
      void $.ui.open({ id: PANE, title: TITLE })
    }
    return next
  } finally {
    isPolling = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectDir = e.cwd
    await $.command.register({
      name: 'guilda-agents',
      description: 'Show the guilda agents of this project (Claude or Codex) in a pane',
    })
    timer?.cancel()
    timer = $.clock.every(POLL_MS, () => {
      void poll($).catch(() => undefined)
    })
    await poll($).catch(() => undefined)

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
    const now = await poll($).catch(() => EMPTY)
    if (now.agents.length === 0) {
      return { text: 'guilda: no agents in this project (no .guilda/bindings.json with agents).' }
    }
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: `guilda: ${now.agents.length} agent(s) shown in the pane.` }
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { agents } = await read($, snapshot)
    const running = agents.filter(agent => agent.state === 'running')
    if (running.length === 0) return next(e)

    const codex = running.filter(agent => agent.tool === 'codex').length
    const claude = running.filter(agent => agent.tool === 'claude').length
    const other = running.length - codex - claude
    const parts = [
      codex > 0 ? `${codex} Codex` : '',
      claude > 0 ? `${claude} Claude` : '',
      other > 0 ? `${other} other` : '',
    ].filter(part => part !== '')
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>{`guilda: ${parts.join(' · ')} running`}</Text>
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
