export type GuildaPanelTool = 'claude' | 'codex' | 'other'

export type GuildaPanelAgent = {
  address: string
  tool: GuildaPanelTool
  state: string
  task?: string
  changedAt: number
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
