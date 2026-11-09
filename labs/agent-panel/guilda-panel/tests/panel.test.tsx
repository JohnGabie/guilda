import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PROJECT = '/project'

const BINDINGS = {
  'T1-exe-a1b2c3': { tool: 'codex', role: 'executor', title: 'Fix the login form', session: 's-codex', state: 'running' },
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

// The dim hint line under the prompt, the lowest site a mod draws in; the
// guilda rows go under it. 60 columns across.
const HINT = {
  plugin: 'guilda-panel',
  component: 'PromptHint',
  requestId: 'prompt-hint',
  props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' },
  viewport: { columns: 60, rows: 30 },
} as const

type Hint = { findAll: (query: { type: string }) => Promise<{ text: string; key: string | undefined; props: Record<string, unknown> }[]> }

// What a PromptHint drawing reads as: its texts, and the labels of its
// buttons (the type column of each row).
async function drawn(hint: Hint) {
  const texts = (await hint.findAll({ type: 'Text' })).map(one => one.text)
  const buttons = (await hint.findAll({ type: 'Button' })).map(one => one.text)
  return { texts, buttons }
}

// One row's texts: the marker, the hover arrow drawn over it, the title, the right end.
const ROW = (title: string, right: string) => ['◇', '›', title, right]

// Stands for the engine's own drawing of every site where the plugin passes.
function engineDraws(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

type Files = Record<string, string>
type Where = { cwd: string; root: string }

// Stands for the engine beneath the plugin: files from memory, a missing one
// rejects as the engine's read does; the session's folders from `where`.
function engine(
  on: On,
  files: Files,
  opened: string[],
  toasts: string[] = [],
  stats = { reads: 0 },
  where: Where = { cwd: PROJECT, root: PROJECT },
) {
  on('session.cwd', () => ({ value: where.cwd }))
  on('session.root', () => ({ value: where.root }))
  on('fs.exists', (_, e) => {
    stats.reads += 1
    return { value: files[e.path] !== undefined }
  })
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

  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  // The pane opens only on /guilda-agents.
  expect(opened).toEqual([])
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

  // Under the hint line, kept as the engine draws it: one dim row for the
  // running Codex executor; the Claude reviewer is in session and not shown.
  for (const surface of ['terminal', 'desktop'] as const) {
    const hint = await $.ui.mount({ ...HINT, surface })
    const { texts, buttons } = await drawn(hint)
    expect(texts).toEqual(['engine', 'other models', ...ROW('Fix the login form', '4s · running')])
    expect(buttons).toEqual(['guilda:executor-codex'])
    expect(texts.join(' ')).not.toContain('T1-exe-a1b2c3')
    const all = await hint.findAll({ type: 'Text' })
    // The heading, the marker, the title and the right end are dim; the arrow
    // over the marker is hidden until the pointer is on the row.
    for (const at of [1, 2, 4, 5]) expect(all[at]?.props.dimColor).toBe(true)
    expect(all[2]?.text).not.toBe('○')
    await hint.unmount()
  }
})

test('rows: external agents only, guilda:<role>-<tool> type, title, tokens, cut to fit, never wrapped', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(
    on,
    {
      [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify({
        'T7-exe-0f0f0f': { tool: 'codex', role: 'executor', state: 'running', tokens: 38_612 },
        'T8-exe-1a1a1a': { tool: 'gemini', state: 'running', title: 'Port the parser', tokens: 512 },
        // This session's own subagents: the engine's list shows them.
        'T7-arc-0f0f0f': { tool: 'claude', role: 'architect', state: 'running', title: 'Plan T7' },
        'T9-exe-2b2b2b': { tool: 'codex', role: 'executor', state: 'running', inSession: true, title: 'Hidden' },
      }),
      [`${PROJECT}/.guilda/queue.json`]: JSON.stringify([
        { id: 'T7', title: 'Rewrite the settings page so that every field validates on blur', state: 'running', agent: 'T7-exe-0f0f0f' },
      ]),
    },
    [],
  )
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  // Polls every 2 s: the last one at 28 s.
  await clock.advance(28_000)

  for (const columns of [100, 90, 60]) {
    const hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns, rows: 30 } })
    const { texts, buttons } = await drawn(hint)
    expect(texts).toEqual([
      'engine',
      'other models',
      ...ROW('Rewrite the settings page so that every field validates on blur', '28s · running · ↓ 38.6k tokens'),
      ...ROW('Port the parser', '28s · running · ↓ 512 tokens'),
    ])
    expect(buttons).toEqual(['guilda:executor-codex', 'gemini'])
    expect([...texts, ...buttons].join('\n')).not.toMatch(/T7-|T8-|T9-|architect|Hidden/)

    // The right end never shrinks; the title takes the rest and is cut in the
    // middle on one row.
    const all = await hint.findAll({ type: 'Text' })
    const title = all.find(one => one.text.startsWith('Rewrite'))
    expect(title?.props.wrap).toBe('truncate-middle')
    const boxes = await hint.findAll({ type: 'Box' })
    const shrinking = boxes.filter(one => one.props.flexShrink === 1)
    expect(shrinking.length).toBe(2)
    for (const box of shrinking) expect(box.props.flexGrow).toBe(1)
    await hint.unmount()
  }
})

const LOG_BINDINGS = {
  'T2-exe-aaaaaa': { tool: 'codex', role: 'executor', state: 'running', title: 'First' },
  'T3-exe-bbbbbb': { tool: 'codex', role: 'reviewer', state: 'running', title: 'Second' },
}

const logLine = (second: number, kind: string, text: string) =>
  JSON.stringify({ time: `2026-11-09T21:40:${String(second).padStart(2, '0')}.000Z`, kind, text })

const LOG_PANE = (id: string) => ({ ...PANE, requestId: id, props: { ...PANE.props, title: 'guilda log' } })

test('the hover arrow and the row parts share one hover group per row', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(LOG_BINDINGS) }, [])
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const boxes = await hint.findAll({ type: 'Box' })
  const arrows = boxes.filter(one => one.props.position === 'absolute')
  expect(arrows.length).toBe(2)
  expect(arrows.map(one => one.props.display)).toEqual(['none', 'none'])
  const tree = JSON.stringify(await hint.drawn())
  expect(tree).toContain('"hover":{"scope":"row-T2-exe-aaaaaa","display":"flex"}')
  expect(tree).toContain('"hover":{"scope":"row-T3-exe-bbbbbb","display":"flex"}')
  await hint.unmount()
})

test('a click on a row type opens the log pane of that agent', async ($, on) => {
  const opened: string[] = []
  mock.clock(on, { now: 1_000_000 })
  engine(
    on,
    {
      [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(LOG_BINDINGS),
      [`${PROJECT}/.guilda/logs/T3-exe-bbbbbb.jsonl`]: logLine(1, 'command', 'echo step 1') + '\n',
    },
    opened,
  )
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await hint.press({ key: 'open:T3-exe-bbbbbb' })
  await hint.unmount()
  expect(opened).toEqual(['guilda-log-T3-exe-bbbbbb'])

  const pane = await $.ui.mount({ ...LOG_PANE('guilda-log-T3-exe-bbbbbb'), surface: 'terminal' })
  const texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toEqual([
    'guilda:reviewer-codex · 0s · running',
    'T3-exe-bbbbbb',
    '21:40:01  command  echo step 1',
  ])
  await pane.unmount()
})

test('the log pane shows the last 15 lines and follows the log at each poll', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  const path = `${PROJECT}/.guilda/logs/T2-exe-aaaaaa.jsonl`
  const lines = Array.from({ length: 20 }, (_, i) => logLine(i, i % 2 === 0 ? 'command' : 'message', `line ${i}`))
  const files: Files = {
    [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(LOG_BINDINGS),
    [path]: lines.join('\n') + '\n',
  }
  engine(on, files, opened)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ ...RUN, args: 'log executor' })
  expect(ran.text).toContain('log of T2-exe-aaaaaa (guilda:executor-codex) opened')
  expect(opened).toEqual(['guilda-log-T2-exe-aaaaaa'])

  let pane = await $.ui.mount({ ...LOG_PANE('guilda-log-T2-exe-aaaaaa'), surface: 'terminal' })
  let texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts.length).toBe(2 + 15)
  expect(texts[2]).toBe('21:40:05  message  line 5')
  expect(texts.at(-1)).toBe('21:40:19  message  line 19')
  await pane.unmount()

  files[path] += logLine(30, 'tokens', '1200 in, 80 out') + '\n' + 'not json\n'
  await clock.advance(2000)
  pane = await $.ui.mount({ ...LOG_PANE('guilda-log-T2-exe-aaaaaa'), surface: 'terminal' })
  texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts.slice(-2)).toEqual(['21:40:30  tokens   1200 in, 80 out', 'other    not json'])
  expect(texts[0]).toBe('guilda:executor-codex · 2s · running')
  await pane.unmount()
})

test('a log pane without a log file says no log yet', async ($, on) => {
  const opened: string[] = []
  mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(LOG_BINDINGS) }, opened)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, args: 'log T2-exe-aaaaaa' })
  expect(opened).toEqual(['guilda-log-T2-exe-aaaaaa'])
  const pane = await $.ui.mount({ ...LOG_PANE('guilda-log-T2-exe-aaaaaa'), surface: 'terminal' })
  expect((await pane.findAll({ type: 'Text' })).map(one => one.text)).toEqual([
    'guilda:executor-codex · 0s · running',
    'T2-exe-aaaaaa',
    'no log yet',
  ])
  await pane.unmount()
})

test('M5: without .guilda/bindings.json nothing is drawn or opened', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(on, {}, opened)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(6000)
  expect(opened).toEqual([])

  for (const surface of ['terminal', 'desktop'] as const) {
    const hint = await $.ui.mount({ ...HINT, surface })
    expect((await hint.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine'])
    await hint.unmount()
  }

  const ran = await $.command.run({
    command: 'guilda-agents',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(ran.text).toContain('bindings.json: not found')
  expect(ran.text).toContain('agents: 0')
  expect(opened).toEqual([])
})

test('M5: an invalid bindings file is ignored', async ($, on) => {
  const opened: string[] = []
  mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: '{ not json' }, opened)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

test('a change to done raises a toast; the row stays 10 s, then goes away', async ($, on) => {
  const opened: string[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  const files: Files = { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(BINDINGS) }
  engine(on, files, opened, toasts)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  files[`${PROJECT}/.guilda/bindings.json`] = JSON.stringify({
    'T1-exe-a1b2c3': { ...BINDINGS['T1-exe-a1b2c3'], state: 'done' },
    // An in-session Claude agent finishing raises no toast: the engine has its own.
    'T1-arc-a1b2c3': { ...BINDINGS['T1-arc-a1b2c3'], state: 'done' },
  })
  await clock.advance(2000)
  expect(toasts).toEqual(['guilda: T1-exe-a1b2c3 (Codex) done'])

  const doneRow = ['engine', 'other models', ...ROW('Fix the login form', '2s · done')]
  let hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await drawn(hint)).texts).toEqual(doneRow)
  await hint.unmount()

  await clock.advance(8000)
  hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await drawn(hint)).texts).toEqual(doneRow)
  await hint.unmount()

  await clock.advance(2000)
  hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await hint.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine'])
  await hint.unmount()
  expect(opened).toEqual([])
})

test('an agent first seen done (an earlier run) draws no row', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify({ 'T0-exe-x': { tool: 'codex', state: 'done' } }) }, [])
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await hint.findAll({ type: 'Text' })).map(one => one.text)).toEqual(['engine'])
  await hint.unmount()
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

const RUN = {
  command: 'guilda-agents',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 96 },
} as const

test('/guilda-agents replies with the folder, the file, the count, the poll time and the last error', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T21:40:00.000Z') })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(BINDINGS) }, opened)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain(`reads ${PROJECT}/.guilda/`)
  expect(ran.text).toContain('bindings.json: found')
  expect(ran.text).toContain('agents: 2')
  expect(ran.text).toContain('last poll: 2026-11-09T21:40:02.000Z')
  expect(ran.text).toContain('last error: none')
  expect(ran.text).toContain('pane: opened')
  expect(ran.text).toContain('screen: not drawn yet')
  expect(ran.text).toContain('- T1-exe-a1b2c3: guilda:executor-codex, running, Fix the login form')
  expect(ran.text).toContain('- T1-arc-a1b2c3: claude, review (in session, not in the rows)')
  // Only the command opens it.
  expect(opened).toEqual(['guilda-agents'])
})

test('/guilda-agents opens the pane that a narrow terminal kept undrawn', async ($, on) => {
  const asked: string[] = []
  const files: Files = { [`${PROJECT}/.guilda/bindings.json`]: JSON.stringify(BINDINGS) }
  mock.clock(on, { now: 1_000_000 })
  on('session.cwd', () => ({ value: PROJECT }))
  on('session.root', () => ({ value: PROJECT }))
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('command.register', () => ({ value: { command: 'guilda-agents' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Unasked (the poll) waits under 144 columns; asked (the command) is placed.
  let isAsked = false
  on('ui.open', (_, e) => {
    asked.push(`${e.id}:${isAsked ? 'asked' : 'unasked'}`)
    return isAsked
      ? { value: { isPlaced: true } }
      : { value: { isPlaced: false, reason: 'unasked, 96 columns < 144' } }
  })

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  isAsked = true
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('pane: opened')
  expect(asked).toEqual(['guilda-agents:asked'])
})

test('a bad bindings file is reported as the last error, not swallowed', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  engine(on, { [`${PROJECT}/.guilda/bindings.json`]: '{ not json' }, [])

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('bindings.json: found')
  expect(ran.text).toContain(`last error: ${PROJECT}/.guilda/bindings.json:`)
  expect(ran.text).toContain('pane: not opened (no agents)')
})

test('the folder is read at each poll: the session cwd, then the project root', async ($, on) => {
  const opened: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  const files: Files = {}
  // The session started in /repo; the agents are in the root /root-dir.
  const where: Where = { cwd: '/repo', root: '/root-dir' }
  engine(on, files, opened, [], { reads: 0 }, where)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])

  files['/root-dir/.guilda/bindings.json'] = JSON.stringify(BINDINGS)
  await clock.advance(2000)
  expect(opened).toEqual([])
  let ran = await $.command.run(RUN)
  expect(ran.text).toContain('reads /root-dir/.guilda/')
  expect(ran.text).toContain('looked in: /repo, /root-dir')
  expect(ran.text).toContain('agents: 2')

  // The cwd moves to a folder with agents of its own: that one wins.
  where.cwd = '/work'
  files['/work/.guilda/bindings.json'] = JSON.stringify({ 'T2-exe-x': { tool: 'codex', state: 'running' } })
  await clock.advance(2000)
  ran = await $.command.run(RUN)
  expect(ran.text).toContain('reads /work/.guilda/')
  expect(ran.text).toContain('looked in: /work, /root-dir, /repo')
  expect(ran.text).toContain('agents: 1')
})
