import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PROJECT = '/project'

const BINDINGS = {
  'T1-exe-a1b2c3': { tool: 'codex', session: 's-codex', state: 'running' },
  'T1-arc-a1b2c3': { tool: 'claude', session: 's-claude', state: 'review' },
}

const QUEUE = [{ id: 'T1', state: 'running', agent: 'T1-exe-a1b2c3' }]

const PANE = {
  plugin: 'guilda-panel',
  component: 'Pane',
  requestId: 'guilda-agents',
  props: {
    title: 'guilda agents',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'guilda-panel',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type Files = Record<string, string>

// Stands for the engine beneath the plugin: files from memory, a missing one
// rejects as the engine's read does.
function engine(on: On, files: Files, opened: string[], toasts: string[] = [], stats = { reads: 0 }) {
  on('fs.read', (_, e) => {
    stats.reads += 1
    const text = files[e.path]
    if (text === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: text }
  })
  on('command.register', () => ({ value: { command: 'guilda-agents' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('M2: the pane lists each agent with address, tool, state and age', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(
    on,
    {
      [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(BINDINGS),
      [`${PROJECT}/.guilda/queue.json`]: JSON.stringify(QUEUE),
    },
    opened,
  )

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['guilda-agents'])
  await clock.advance(4000)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
    expect(texts).toEqual([
      'T1-exe-a1b2c3', 'Codex', 'running', '4s', 'T1',
      'T1-arc-a1b2c3', 'Claude', 'review', '4s',
    ])
    const codex = await ui.find({ type: 'Text', text: 'Codex' })
    const claude = await ui.find({ type: 'Text', text: 'Claude' })
    expect(codex?.props.color).not.toBe(claude?.props.color)
    await ui.unmount()
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text' }))?.text).toBe('guilda: 1 Codex running')
    await band.unmount()
  }
})

test('M5: without .guilda/bindings.json nothing is drawn or opened', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(on, {}, opened)
  // Stands for the engine's own drawing where the plugin passes.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(6000)
  expect(opened).toEqual([])

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine'])
    await band.unmount()
  }

  const ran = await $.command.run({
    command: 'guilda-agents',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(JSON.stringify(ran)).toContain('no agents')
  expect(opened).toEqual([])
})

test('M5: an invalid bindings file is ignored', async ($, on) => {
  const opened: string[] = []
  mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: '{ not json' }, opened)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

test('a change to done raises a toast; the band goes away', async ($, on) => {
  const opened: string[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  const files: Files = { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(BINDINGS) }
  engine(on, files, opened, toasts)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  files[`${PROJECT}/.guilda/bindings.json`] = JSON.stringify({
    ...BINDINGS,
    'T1-exe-a1b2c3': { tool: 'codex', session: 's-codex', state: 'done' },
  })
  await clock.advance(2000)
  expect(toasts).toEqual(['guilda: T1-exe-a1b2c3 (Codex) done'])

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine'])
  await band.unmount()
})

const BASH_ROW = (command: string) =>
  ({
    plugin: 'guilda-panel',
    component: 'ToolUse',
    requestId: 'toolu_1',
    props: {
      tool_use_id: 'toolu_1',
      tool: 'Bash',
      input: { command },
      isRunning: true,
      isErrored: false,
      isInterrupted: false,
    },
  }) as const

test('M4: a Bash row that runs codex keeps the row and adds a Codex label', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

  const commands = [
    'codex exec --json "hi" < /dev/null',
    'timeout 120 codex exec --json -C . "hi"',
    'cd ../lab && timeout 120 codex exec "hi"',
  ]
  for (const command of commands) {
    const ui = await $.ui.mount({ ...BASH_ROW(command), surface: 'terminal' })
    expect((await ui.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['Codex', 'engine row'])
    await ui.unmount()
  }

  for (const command of ['echo codex', 'git log --grep codex', 'ls codex-notes']) {
    const ui = await $.ui.mount({ ...BASH_ROW(command), surface: 'terminal' })
    expect((await ui.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine row'])
    await ui.unmount()
  }
})

test('M6: the poll timer stops when the session ends', async ($, on) => {
  const opened: string[] = []
  const stats = { reads: 0 }
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(on, {}, opened, [], stats)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(4000)
  const whileRunning = stats.reads
  expect(whileRunning).toBeGreaterThan(1)

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
  await clock.advance(10_000)
  expect(stats.reads).toBe(whileRunning)
})
