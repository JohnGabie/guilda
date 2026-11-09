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

declare module 'claude-code' {
  interface PluginState {
    'guilda-panel': { snapshot: Shaped<GuildaPanelSnapshot> }
  }
}
