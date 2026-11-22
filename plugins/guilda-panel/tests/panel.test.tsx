import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { DOCTOR_LAST as DOCTOR_FAIL } from './fixtures/doctor-last'

// The tests of the guilda-panel mod: section 4h of the 0.3.0 spec, S26 to S30.
// Each hook in `engine` stands for the engine: the files come from memory.

const PROJECT = '/project'
const T0 = Date.parse('2026-11-20T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const STATE_PATH = `${PROJECT}/.guilda/queue/state.json`
const DOCTOR_PATH = `${PROJECT}/.guilda/.doctor-last.json`
const INIT_PATH = `${PROJECT}/.guilda/.init-progress.json`
const LOG_PATH = `${PROJECT}/.guilda/logs/T5-exe-19cd.jsonl`

type Task = Record<string, unknown>

function task(fields: Task): Task {
  return {
    work: 'w-5c1e9a02',
    state: 'running',
    attempt: 1,
    address: null,
    agentId: null,
    role: 'exe',
    tool: 'claude',
    inSession: false,
    title: '',
    since: iso(T0),
    startedAt: null,
    lastHeartbeat: null,
    busyUntil: null,
    tokens: null,
    agentSeconds: 0,
    checks: [],
    ...fields,
  }
}

// The fixture of S26: three running tasks, T3 in the session.
function s26Tasks(): Record<string, Task> {
  return {
    T3: task({ address: 'T3-exe-7f2a', agentId: 'a1b2c3', inSession: true, title: 'Plan the login', startedAt: iso(T0 - 20_000), tokens: 41_200 }),
    T5: task({ address: 'T5-exe-19cd', tool: 'codex', title: 'Port the parser', startedAt: iso(T0 - 4000), tokens: 1200 }),
    T6: task({ address: 'T6-exe-2a3b', title: 'Write the docs', startedAt: iso(T0 - 9000), tokens: 300 }),
  }
}

function stateText(tasks: Record<string, Task>): string {
  return JSON.stringify({ generator: 'guilda 0.4.0', journalSeq: 12, slots: 3, works: {}, tasks, bindings: {} })
}

type Entry = { text: string; mtimeMs?: number; realPath?: string }
type Files = Record<string, Entry>
type Seen = { reads: string[]; touched: string[]; opened: string[]; closed: string[] }

const fileOf = (text: string, mtimeMs = T0): Entry => ({ text, mtimeMs })

// Stands for the engine beneath the plugin. A folder exists when a file is in
// it. `realPath` of an entry is where a link lands.
function engine(on: On, files: Files, where: { cwd: string } = { cwd: PROJECT }): Seen {
  const seen: Seen = { reads: [], touched: [], opened: [], closed: [] }
  const isDir = (path: string) => Object.keys(files).some(one => one.startsWith(`${path}/`))
  on('session.cwd', () => ({ value: where.cwd }))
  on('session.root', () => ({ value: where.cwd }))
  on('fs.exists', (_, e) => {
    seen.touched.push(e.path)
    return { value: files[e.path] !== undefined || isDir(e.path) }
  })
  on('fs.stat', (_, e) => {
    seen.touched.push(e.path)
    const file = files[e.path]
    if (file !== undefined) {
      const stat = { kind: 'file' as const, size: file.text.length, mtimeMs: file.mtimeMs ?? T0, isLink: file.realPath !== undefined }
      return { value: e.resolve ? { ...stat, realPath: file.realPath ?? e.path } : stat }
    }
    if (isDir(e.path)) {
      const stat = { kind: 'dir' as const, size: 0, mtimeMs: T0, isLink: false }
      return { value: e.resolve ? { ...stat, realPath: e.path } : stat }
    }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('fs.read', (_, e) => {
    seen.touched.push(e.path)
    seen.reads.push(e.path)
    const file = files[e.path]
    if (file === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: file.text.slice(e.offset ?? 0) }
  })
  on('command.register', () => ({ value: { command: 'guilda-agents' } }))
  const open: string[] = []
  on('ui.open', (_, e) => {
    seen.opened.push(e.id)
    if (!open.includes(e.id)) open.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    seen.closed.push(e.id)
    open.splice(open.indexOf(e.id), 1)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: open.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return seen
}

// Stands for the engine's own drawing of each site the plugin passes on.
function engineDraws(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const HINT = {
  plugin: 'guilda-panel',
  component: 'PromptHint',
  requestId: 'prompt-hint',
  props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' },
  viewport: { columns: 120, rows: 30 },
} as const

const PANE = (requestId: string, title: string) =>
  ({
    plugin: 'guilda-panel',
    component: 'Pane',
    requestId,
    props: { title, isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const RUN = {
  command: 'guilda-agents',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 150 },
} as const

type Mounted = {
  findAll: (query: { type: string }) => Promise<{ text: string; key: string | undefined; props: Record<string, unknown> }[]>
  unmount: () => Promise<void>
}

async function textsOf(ui: Mounted): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(one => one.text)
}

async function buttonsOf(ui: Mounted): Promise<string[]> {
  return (await ui.findAll({ type: 'Button' })).map(one => one.text)
}

// One row: the marker, the hover arrow over it, the title and the right end.
const ROW = (title: string, right: string) => ['◇', '›', title, right]

test('rows show only external agents', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on, { [STATE_PATH]: fileOf(stateText(s26Tasks())) })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const hint = await $.ui.mount({ ...HINT, surface })
    const texts = await textsOf(hint)
    expect(texts).toEqual([
      'engine',
      'other models',
      ...ROW('Port the parser', '4s · running · ↓ 1,200 tokens'),
      ...ROW('Write the docs', '9s · running · ↓ 300 tokens'),
      'agent work: 0.0 h',
    ])
    expect(await buttonsOf(hint)).toEqual(['guilda:executor-codex', 'guilda:executor-claude'])
    const all = (await buttonsOf(hint)).concat(texts).join('\n')
    expect(all).not.toMatch(/T3|T5-exe|T6-exe|Plan the login|a1b2c3/)
    const heading = (await hint.findAll({ type: 'Text' }))[1]
    expect(heading?.props.dimColor).toBe(true)
    await hint.unmount()
  }
})

test('row hides 10 s after done', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const tasks = s26Tasks()
  const files: Files = { [STATE_PATH]: fileOf(stateText(tasks)) }
  engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  // T5 changes to done at T0 + 2 s; the poll of T0 + 2 s reads it.
  const change = T0 + 2000
  tasks.T5 = { ...tasks.T5, state: 'done', since: iso(change), agentSeconds: 6 }
  files[STATE_PATH] = fileOf(stateText(tasks), change)

  const rowsAt = async (): Promise<string[]> => {
    const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
    const buttons = await buttonsOf(hint)
    const texts = await textsOf(hint)
    await hint.unmount()
    return [...buttons, ...texts.filter(one => one === 'Port the parser' || one.includes('done'))]
  }

  await clock.advance(2000)
  expect(await rowsAt()).toEqual(['guilda:executor-codex', 'guilda:executor-claude', 'Port the parser', '6s · done · ↓ 1,200 tokens'])
  await clock.advance(8000)
  expect(await rowsAt()).toEqual(['guilda:executor-codex', 'guilda:executor-claude', 'Port the parser', '6s · done · ↓ 1,200 tokens'])
  await clock.advance(4000)
  expect(await rowsAt()).toEqual(['guilda:executor-claude'])
})

test('no guilda, no output', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const other = '/other'
  const seen = engine(on, { [`${other}/README.md`]: fileOf('no guilda here') }, { cwd: other })
  engineDraws(on)

  await $.session.start({ cwd: other, surface: 'terminal', isInteractive: true })
  await clock.advance(4000)

  for (const columns of [100, 150]) {
    const hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns, rows: 30 } })
    expect(await textsOf(hint)).toEqual(['engine'])
    expect(await buttonsOf(hint)).toEqual([])
    await hint.unmount()
  }
  await clock.advance(4000)
  expect(seen.opened).toEqual([])
  expect(seen.reads).toEqual([])
})

test('doctor mark and work hours', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const tasks = {
    T5: task({ address: 'T5-exe-19cd', tool: 'codex', title: 'Port the parser', startedAt: iso(T0 - 4000), agentSeconds: 7200 }),
    T6: task({ address: 'T6-exe-2a3b', state: 'done', since: iso(T0 - 3_600_000), title: 'Write the docs', agentSeconds: 5040 }),
  }
  const files: Files = {
    [STATE_PATH]: fileOf(stateText(tasks)),
    [DOCTOR_PATH]: fileOf(JSON.stringify(DOCTOR_FAIL)),
  }
  engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  let hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  let texts = await textsOf(hint)
  // The fixture has an UNKNOWN line before the FAIL line: only FAIL marks.
  expect(texts[1]).toBe('other models · doctor: hooks live FAIL')
  expect(texts.at(-1)).toBe('agent work: 3.4 h')
  await hint.unmount()

  // Without a FAIL line: no mark, also with an UNKNOWN line.
  const lines = (DOCTOR_FAIL as { lines: { check: string; result: string }[] }).lines.map(one =>
    one.result === 'FAIL' ? { ...one, result: 'PASS' } : one,
  )
  files[DOCTOR_PATH] = fileOf(JSON.stringify({ ...DOCTOR_FAIL, lines }))
  await clock.advance(2000)
  hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  texts = await textsOf(hint)
  expect(texts[1]).toBe('other models')
  expect(texts.at(-1)).toBe('agent work: 3.4 h')
  await hint.unmount()
})

test('no .doctor-last.json: no mark and no diagnostic', async ($, on) => {
  mock.clock(on, { now: T0 })
  const seen = engine(on, { [STATE_PATH]: fileOf(stateText(s26Tasks())) })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await textsOf(hint))[1]).toBe('other models')
  await hint.unmount()
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('errors: none')
  expect(ran.text).toContain('last error: none')
  expect(seen.reads).not.toContain(DOCTOR_PATH)
})

const STEPS = ['Read the project', 'Ask the questions', 'Write the config', 'Write the rules', 'Check the hooks', 'Run doctor', 'Report']

function initText(states: string[], at = T0): string {
  return JSON.stringify({ at: iso(at), steps: STEPS.map((name, i) => ({ name, state: states[i] })) })
}

test('init progress', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const doing = ['done', 'done', 'doing', 'todo', 'todo', 'todo', 'todo']
  const files: Files = { [INIT_PATH]: fileOf(initText(doing)) }
  const seen = engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  // 100 columns: no pane, one row under the prompt.
  let hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 100, rows: 30 } })
  await clock.advance(2000)
  await hint.unmount()
  hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 100, rows: 30 } })
  expect(await textsOf(hint)).toEqual(['engine', 'guilda init: step 3 of 7 — Write the config'])
  await hint.unmount()
  await clock.advance(2000)
  expect(seen.opened).toEqual([])

  // 150 columns: the pane opens by itself and lists the 7 steps.
  hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 150, rows: 30 } })
  await hint.unmount()
  await clock.advance(2000)
  expect(seen.opened).toEqual(['guilda-init'])
  hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 150, rows: 30 } })
  expect(await textsOf(hint)).toEqual(['engine'])
  await hint.unmount()
  const pane = await $.ui.mount({ ...PANE('guilda-init', 'guilda init'), surface: 'terminal' })
  // S29: the pane is "guilda init", in its title and as its first line.
  expect(await textsOf(pane)).toEqual(['guilda init', ...STEPS.map((name, i) => `${i + 1}. ${name} · ${doing[i]}`)])
  await pane.unmount()

  // Each step done: nothing of init shows, and the pane closes.
  files[INIT_PATH] = fileOf(initText(STEPS.map(() => 'done'), T0 + 6000))
  await clock.advance(2000)
  expect(seen.closed).toEqual(['guilda-init'])
  for (const columns of [100, 150]) {
    hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns, rows: 30 } })
    expect(await textsOf(hint)).toEqual(['engine'])
    await hint.unmount()
  }

  // A file older than 10 min shows nothing.
  files[INIT_PATH] = fileOf(initText(doing, T0 - 11 * 60_000))
  await clock.advance(2000)
  hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 100, rows: 30 } })
  expect(await textsOf(hint)).toEqual(['engine'])
  await hint.unmount()
})

const logLine = (second: number, kind: string, text: string) =>
  JSON.stringify({ t: `2026-11-20T09:59:${String(second).padStart(2, '0')}.000Z`, kind, text })

test('detail pane and log pane', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const tasks = s26Tasks()
  const files: Files = { [STATE_PATH]: fileOf(stateText(tasks)) }
  const seen = engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  // /guilda-agents opens the detail pane: each task, of each tool.
  const ran = await $.command.run(RUN)
  expect(seen.opened).toEqual(['guilda-agents'])
  expect(ran.text).toContain(`reads ${PROJECT}/.guilda/`)
  for (const surface of ['terminal', 'desktop'] as const) {
    const wide = PANE('guilda-agents', 'guilda agents')
    const pane = await $.ui.mount({ ...wide, props: { ...wide.props, bodyColumns: 100 }, surface })
    expect(await textsOf(pane)).toEqual([
      'T3 · guilda:executor-claude · running · T3-exe-7f2a · agent a1b2c3 · ↓ 41,200 tokens · 20s',
      'T5 · guilda:executor-codex · running · T5-exe-19cd · agent - · ↓ 1,200 tokens · 4s',
      'T6 · guilda:executor-claude · running · T6-exe-2a3b · agent - · ↓ 300 tokens · 9s',
    ])
    await pane.unmount()
  }
  // A narrow pane drops the label, the field that section 4h does not list, so each line fits.
  const narrow = await $.ui.mount({ ...PANE('guilda-agents', 'guilda agents'), surface: 'terminal' })
  const narrowTexts = await textsOf(narrow)
  expect(narrowTexts).toEqual([
    'T3 · running · T3-exe-7f2a · agent a1b2c3 · ↓ 41,200 tokens · 20s',
    'T5 · running · T5-exe-19cd · agent - · ↓ 1,200 tokens · 4s',
    'T6 · running · T6-exe-2a3b · agent - · ↓ 300 tokens · 9s',
  ])
  for (const one of narrowTexts) expect(one.length <= 80).toBe(true)
  await narrow.unmount()

  // The log form with no log file: 'no log yet'.
  let log = await $.command.run({ ...RUN, args: 'log T5-exe-19cd' })
  expect(log.text).toContain('log of T5-exe-19cd (guilda:executor-codex) opened')
  expect(seen.opened).toEqual(['guilda-agents', 'guilda-log'])
  let pane = await $.ui.mount({ ...PANE('guilda-log', 'guilda log'), surface: 'terminal' })
  expect(await textsOf(pane)).toEqual(['guilda:executor-codex · 4s · running · ↓ 1,200 tokens', 'T5-exe-19cd', 'no log yet'])
  await pane.unmount()

  // 20 lines in the log: the pane shows the last 15, read again at each poll.
  const lines = Array.from({ length: 20 }, (_, i) => logLine(i, i % 2 === 0 ? 'state' : 'message', `line ${i}`))
  files[LOG_PATH] = fileOf(lines.join('\n') + '\n')
  await clock.advance(2000)
  pane = await $.ui.mount({ ...PANE('guilda-log', 'guilda log'), surface: 'terminal' })
  let texts = await textsOf(pane)
  expect(texts.length).toBe(2 + 15)
  expect(texts[2]).toBe('09:59:05  message  line 5')
  expect(texts.at(-1)).toBe('09:59:19  message  line 19')
  await pane.unmount()

  // The click on a row opens the same log pane; the row has the hover arrow.
  log = await $.command.run({ ...RUN, args: 'log T6-exe-2a3b' })
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const tree = JSON.stringify(await (hint as unknown as { drawn: () => Promise<unknown> }).drawn())
  expect(tree).toContain('"hover":{"scope":"row-T5-exe-19cd","display":"flex"}')
  await (hint as unknown as { press: (q: { key: string }) => Promise<void> }).press({ key: 'open:T5-exe-19cd' })
  await hint.unmount()
  expect(seen.opened.at(-1)).toBe('guilda-log')
  // The press reached the mod through ui.press: /guilda-agents says so, for the live check.
  const pressed = await $.command.run(RUN)
  expect(pressed.text).toMatch(/last press: open:T5-exe-19cd \(log opened\) at 2026-11-20T\S+/)
  pane = await $.ui.mount({ ...PANE('guilda-log', 'guilda log'), surface: 'terminal' })
  texts = await textsOf(pane)
  expect(texts[1]).toBe('T5-exe-19cd')
  expect(texts.length).toBe(2 + 15)
  await pane.unmount()

  // A file that exists and does not parse goes to the diagnostics, and the command prints it.
  files[DOCTOR_PATH] = fileOf('{ not json')
  await clock.advance(2000)
  const again = await $.command.run(RUN)
  expect(again.text).toMatch(/errors: .*\.doctor-last\.json/)
})

test('an address with no match of X4 is not read', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const tasks = {
    ...s26Tasks(),
    // An address and an attempt that do not match X4.
    T7: task({ address: '../../secret', tool: 'codex', title: 'Bad address' }),
    T8: task({ address: 'T8-exe-1a2b', tool: 'codex', attempt: '1/../..', title: 'Bad attempt' }),
    '..': task({ address: 'T9-exe-1a2b', tool: 'codex', title: 'Bad task' }),
  }
  const files: Files = {
    [STATE_PATH]: fileOf(stateText(tasks)),
    // A log that is a link to a file outside the project.
    [LOG_PATH]: { text: logLine(1, 'message', 'secret'), realPath: '/elsewhere/key' },
  }
  const seen = engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await clock.advance(2000)

  for (const args of ['log ../../secret', 'log T5-exe-zzzz', 'log ../T5-exe-19cd']) {
    const ran = await $.command.run({ ...RUN, args })
    expect(ran.text).toContain('invalid address')
  }
  await $.command.run({ ...RUN, args: 'log T5-exe-19cd' })
  await clock.advance(2000)
  const pane = await $.ui.mount({ ...PANE('guilda-log', 'guilda log'), surface: 'terminal' })
  expect((await textsOf(pane)).at(-1)).toBe('no log yet')
  await pane.unmount()

  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('outside the project')
  expect(seen.reads).not.toContain(LOG_PATH)
  for (const path of seen.touched) {
    expect(path.includes('..')).toBe(false)
    expect(path.includes('secret')).toBe(false)
    expect(path === PROJECT || path.startsWith(`${PROJECT}/.guilda`)).toBe(true)
  }
})

// C0 (tab and newline too), DEL and C1. A command reply joins its lines with a newline, so it is checked apart.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/
const ESC = '\u001b[31m'
const CSI = '\u009b'

test('file text with ESC sequences shows no control characters', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const tasks = {
    T5: task({
      address: 'T5-exe-19cd',
      tool: 'codex',
      role: 'exe',
      state: 'running',
      title: `Port ${ESC}the${CSI} parser\u0007\t\n`,
      startedAt: iso(T0 - 4000),
    }),
    T6: task({ address: 'T6-exe-2a3b', tool: `co${ESC}dex`, role: `e${CSI}xe`, state: `run${ESC}ning`, title: 'Docs' }),
  }
  const files: Files = {
    [STATE_PATH]: fileOf(stateText(tasks)),
    [DOCTOR_PATH]: fileOf(JSON.stringify({ at: iso(T0), lines: [{ check: `hooks${ESC} live${CSI}`, result: 'FAIL', evidence: '' }] })),
    [INIT_PATH]: fileOf(JSON.stringify({ at: iso(T0), steps: [{ name: `Read${ESC} the${CSI} project`, state: 'doing' }] })),
    [LOG_PATH]: fileOf(logLine(1, 'message', `red ${ESC}text${CSI} here\u007f`) + '\n'),
  }
  engine(on, files)
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const drawnTexts: string[] = []
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 100, rows: 30 } })
  drawnTexts.push(...(await textsOf(hint)), ...(await buttonsOf(hint)))
  await hint.unmount()
  expect(drawnTexts).toContain('Port the parser')
  expect(drawnTexts).toContain('other models · doctor: hooks live FAIL')

  await $.command.run({ ...RUN, args: 'log T5-exe-19cd' })
  for (const [id, title] of [['guilda-log', 'guilda log'], ['guilda-agents', 'guilda agents'], ['guilda-init', 'guilda init']]) {
    const pane = await $.ui.mount({ ...PANE(id as string, title as string), surface: 'terminal' })
    drawnTexts.push(...(await textsOf(pane)))
    await pane.unmount()
  }
  expect(drawnTexts.some(one => one.endsWith('red text here'))).toBe(true)
  for (const one of drawnTexts) expect(CONTROL.test(one)).toBe(false)

  // A JSON.parse message can quote the bytes of the file: the diagnostics strip them too.
  files[DOCTOR_PATH] = fileOf(`${ESC}{${CSI}`)
  await clock.advance(2000)
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('.doctor-last.json')
  expect(CONTROL_BUT_NEWLINE.test(ran.text ?? '')).toBe(false)
})

// S4-32: the `bindings` key of state.json. The fixture uses `tool: "codex"` as data; the mod runs no Codex code.
type Binding = Record<string, unknown>

function binding(fields: Binding): Binding {
  return {
    address: null,
    tool: null,
    inSession: false,
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

function s432Bindings(joinedState: string): Record<string, Binding> {
  return {
    'ext-codex-voice-4592': binding({ address: 'ext-codex-voice-4592', tool: 'codex', name: 'voice', sessions: ['sess-9'], state: joinedState }),
    'T5-exe-1a2b': binding({ address: 'T5-exe-1a2b', tool: 'codex', role: 'exe', agentId: 'a7c1', task: 'T5' }),
    'T3-exe-7f2a': binding({ address: 'T3-exe-7f2a', tool: 'claude', inSession: true, role: 'exe', agentId: 'a1b2c3', task: 'T3' }),
  }
}

// T5 is running and has no row of its own (inSession unknown), so the binding row stands for it.
function s432State(bindings: Record<string, Binding> | undefined): string {
  const tasks = { T5: task({ address: 'T5-exe-1a2b', tool: 'codex', inSession: null }) }
  const body: Record<string, unknown> = { generator: 'guilda 0.4.0', journalSeq: 3, slots: 3, works: {}, tasks }
  if (bindings !== undefined) body.bindings = bindings
  return JSON.stringify(body)
}

const BINDING_ROW = (label: string, right: string) => ['◇', label, right]

test('binding rows', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on, { [STATE_PATH]: fileOf(s432State(s432Bindings('bound'))) })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await textsOf(hint)).toEqual([
    'engine',
    'other models',
    ...BINDING_ROW('guilda:voice-codex', 'idle'),
    ...BINDING_ROW('guilda:executor-codex', 'running'),
    'agent work: 0.0 h',
  ])
  await hint.unmount()

  await $.command.run(RUN)
  const wide = PANE('guilda-agents', 'guilda agents')
  const pane = await $.ui.mount({ ...wide, props: { ...wide.props, bodyColumns: 100 }, surface: 'terminal' })
  const lines = (await textsOf(pane)).filter(one => !one.startsWith('T5 ·'))
  expect(lines).toEqual([
    'ext-codex-voice-4592 · codex · session sess-9 · bound',
    'T5-exe-1a2b · codex · agent a7c1 · bound',
    'T3-exe-7f2a · claude · agent a1b2c3 · bound',
  ])
  await pane.unmount()
})

test('binding rows: an unbound entry has no row', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on, { [STATE_PATH]: fileOf(s432State(s432Bindings('unbound'))) })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await textsOf(hint)).toEqual(['engine', 'other models', ...BINDING_ROW('guilda:executor-codex', 'running'), 'agent work: 0.0 h'])
  await hint.unmount()

  await $.command.run(RUN)
  const wide = PANE('guilda-agents', 'guilda agents')
  const pane = await $.ui.mount({ ...wide, props: { ...wide.props, bodyColumns: 100 }, surface: 'terminal' })
  expect(await textsOf(pane)).toContain('ext-codex-voice-4592 · codex · session sess-9 · unbound')
  await pane.unmount()
})

test('binding rows: no bindings key, no row and no diagnostic', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on, { [STATE_PATH]: fileOf(s432State(undefined)) })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })

  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await textsOf(hint)).toEqual(['engine'])
  await hint.unmount()
  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('errors: none')
})

test('binding rows: the mod reads no file in .guilda/bus', async ($, on) => {
  mock.clock(on, { now: T0 })
  const seen = engine(on, {
    [STATE_PATH]: fileOf(s432State(s432Bindings('bound'))),
    [`${PROJECT}/.guilda/bus/msg-1.json`]: fileOf('{"from":"ext-codex-voice-4592","text":"hello"}'),
    [`${PROJECT}/.guilda/bus/inbox/msg-2.json`]: fileOf('{}'),
  })
  engineDraws(on)

  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)

  expect(seen.reads).toContain(STATE_PATH)
  expect(seen.touched.filter(path => path.includes('/.guilda/bus'))).toEqual([])
})

// Section 5k: the pace line, from .guilda/pace-last.json.
const PACE_PATH = `${PROJECT}/.guilda/pace-last.json`
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function paceFile(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    source: 'usage',
    fetchedAt: iso(T0 - 60_000),
    slots: 3,
    lowTier: false,
    why: 'ok',
    resumeAt: null,
    writtenAt: iso(T0 - 30_000),
    ...fields,
  })
}

async function paceTexts(on: On, $: Parameters<Parameters<typeof test>[1]>[0], pace: string | undefined) {
  mock.clock(on, { now: T0 })
  const files: Files = { [STATE_PATH]: fileOf(stateText(s26Tasks())) }
  if (pace !== undefined) files[PACE_PATH] = fileOf(pace)
  const seen = engine(on, files)
  engineDraws(on)
  await $.session.start({ cwd: PROJECT, surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const texts = (await textsOf(hint)).filter(one => one.startsWith('pace:'))
  await hint.unmount()
  return { texts, seen }
}

test('pace line: a fresh file shows the line', async ($, on) => {
  const one = await paceTexts(on, $, paceFile({ slots: 2, why: 'slow_down' }))
  expect(one.texts).toEqual(['pace: 2 agents — slow_down'])
})

test('pace line: resumeAt adds the local time', async ($, on) => {
  const resume = T0 + 3_600_000
  const one = await paceTexts(on, $, paceFile({ slots: 0, why: 'blocked', resumeAt: iso(resume) }))
  expect(one.texts).toEqual([`pace: 0 agents — blocked until ${hhmm(resume)}`])
})

test('pace line: no file gives no line', async ($, on) => {
  expect((await paceTexts(on, $, undefined)).texts).toEqual([])
})

test('pace line: a bad file gives no line', async ($, on) => {
  expect((await paceTexts(on, $, '{ not json')).texts).toEqual([])
})

test('pace line: schemaVersion 2 gives no line', async ($, on) => {
  expect((await paceTexts(on, $, paceFile({ schemaVersion: 2 }))).texts).toEqual([])
})

test('pace line: source off gives no line', async ($, on) => {
  expect((await paceTexts(on, $, paceFile({ source: 'off', why: 'off' }))).texts).toEqual([])
})

test('pace line: an old fetchedAt ends with old data', async ($, on) => {
  const one = await paceTexts(on, $, paceFile({ fetchedAt: iso(T0 - 16 * 60_000) }))
  expect(one.texts).toEqual(['pace: 3 agents — ok — old data'])
})

test('pace line: an unknown why gives no line', async ($, on) => {
  expect((await paceTexts(on, $, paceFile({ why: 'panic' }))).texts).toEqual([])
})

test('pace line: slots 9 gives no line', async ($, on) => {
  expect((await paceTexts(on, $, paceFile({ slots: 9 }))).texts).toEqual([])
})

test('pace line: a huge file is not read', async ($, on) => {
  const one = await paceTexts(on, $, paceFile({ pad: 'x'.repeat(70 * 1024) }))
  expect(one.texts).toEqual([])
  expect(one.seen.reads).not.toContain(PACE_PATH)
})
