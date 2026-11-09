export type GuildaPanelTool = 'claude' | 'codex' | 'other'

export type GuildaPanelAgent = {
  address: string
  tool: GuildaPanelTool
  state: string
  task?: string
  /** When the state last changed, ms. */
  changedAt: number
  /** When the agent began running, ms; absent if no poll saw it running. */
  startedAt?: number
  /** Tokens used so far, from the binding's optional `tokens` field. */
  tokens?: number
  /** The guilda role (`executor`, `architect`), from the binding's optional `role`. */
  role?: string
  /** What the agent works on, from the binding's optional `title`, else the queue task's `title`. */
  title?: string
  /** The binding's `tool` when it is neither `claude` nor `codex`. */
  toolName?: string
  /** True when the binding marks a Claude subagent of this session (`inSession: true`). */
  inSession?: boolean
}

export type GuildaPanelSnapshot = {
  agents: GuildaPanelAgent[]
  at: number
}

export type GuildaPanelDiagnostics = {
  /** The folder whose .guilda/ the last poll read ('' before any poll). */
  folder: string
  /** The folders it looked in, in order: session cwd, project root, cwd at start. */
  looked: string[]
  isFound: boolean
  count: number
  /** Time of the last poll, ms. */
  at: number
  error?: string
  errorAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'guilda-panel': {
      snapshot: Shaped<GuildaPanelSnapshot>
      diagnostics: Shaped<GuildaPanelDiagnostics>
    }
  }
}
