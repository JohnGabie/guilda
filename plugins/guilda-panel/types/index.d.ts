/** One task of the queue as the panel draws it (section 4h of the 0.3.0 spec). */
export type GuildaPanelTask = {
  /** The task ID (X4). */
  id: string
  state: string
  /** When the task entered its state, ms; null when state.json has no time. */
  since: number | null
  /** The address of the work run, only when it matches X4. */
  address: string | null
  /** The agent ID, only when it matches X4. */
  agentId: string | null
  /** The role code (`exe`, `rev`, ...). */
  role: string | null
  tool: string | null
  inSession: boolean | null
  title: string
  tokens: number | null
  /** When the attempt started, ms. */
  startedAt: number | null
  agentSeconds: number
}

export type GuildaPanelInitStep = { name: string; state: string }

/** The init progress while it is active: younger than 10 min, and a step not done. */
export type GuildaPanelInit = {
  steps: GuildaPanelInitStep[]
  /** The index of the step that the row names. */
  current: number
}

export type GuildaPanelSnapshot = {
  /** Time of the poll, ms. */
  at: number
  /** True when the project has a `.guilda/queue/` folder. */
  hasQueue: boolean
  tasks: GuildaPanelTask[]
  /** The check of the first FAIL line of `.guilda/.doctor-last.json`. */
  doctorFail: string | null
  init: GuildaPanelInit | null
  /** The pace line of `.guilda/pace-last.json`, or null when the file gives no line. */
  pace?: string | null
}

export type GuildaPanelLogLine = {
  /** ms, when the line has a time. */
  time?: number
  /** `command`, `message`, `file`, `tokens`, `state`, or `other`. */
  kind: string
  text: string
}

/** The log pane: the address it shows and the last lines of its log. */
export type GuildaPanelLog = {
  address: string | null
  /** False while `.guilda/logs/<address>.jsonl` does not exist ("no log yet"). */
  isFound: boolean
  lines: GuildaPanelLogLine[]
}

export type GuildaPanelDiagnostics = {
  /** The project folder of the last poll ('' before a poll or with no `.guilda/`). */
  folder: string
  /** Time of the last poll, ms. */
  at: number
  /** The read and parse errors of the last poll. */
  errors: string[]
  lastError?: string
  lastErrorAt?: number
  /** The last press of a row that reached the mod through ui.press: its key and what it did. */
  lastPress?: string
  lastPressAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'guilda-panel': {
      snapshot: Shaped<GuildaPanelSnapshot>
      diagnostics: Shaped<GuildaPanelDiagnostics>
      log: Shaped<GuildaPanelLog>
      initPlaced: Shaped<boolean>
    }
  }
}
