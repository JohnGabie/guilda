# Lab: agent panel mod

Date: 2026-11-09. Branch: `lab/agent-panel`. Spec: `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`, D20.
Run by a dispatched agent (D19).

## Hypothesis

A Claude Code mod can show the agents of a project, with the tool that runs each one (Claude or Codex), from the
binding table and the queue in `.guilda/`. A Codex run then shows as Codex, not only as a Claude agent (lab check L6
of `2026-11-09-agent-bus.md`).

## PASS criteria (written before the run)

| ID | Check | PASS |
|---|---|---|
| M1 | Static checks | `claude plugin validate` passes, the type check passes, `claude plugin test` passes. |
| M2 | Pane from files | With a fixture `.guilda/bindings.json` and `.guilda/queue.json`, the pane lists each agent: address, tool, state, time since the last change. A test proves it. |
| M3 | Live update | A real Codex run through the lab router changes its state to `running` and then `done`. The pane shows both states within 5 s of each change. The user confirms. |
| M4 | Tool label | The tool row of a Bash command that runs `codex` shows a "Codex" label. The user confirms. |
| M5 | No change without guilda | In a folder without `.guilda/bindings.json`, the mod shows nothing. A test proves it. |
| M6 | No leftovers | The mod starts no process. Its timer stops when the session ends or the mod reloads. |

## Method

- Mod `guilda-panel`, Claude Code 2.1.321. Written in this session's mods folder
  (`~/.claude/dev-mods/<session>/guilda-panel/`), so the session loads it when the turn ends. A copy is in
  `labs/agent-panel/guilda-panel/`. Files: `.claude-plugin/plugin.json`, `hooks/hooks.json`
  (`{ "modules": ["./register.tsx"] }`), `hooks/register.tsx`, `types/index.d.ts` (the `$.state` contract),
  `tests/panel.test.tsx`.
- Every API call was looked up in the types file of the build (`types/claude-code.d.ts` of the plugin-authoring
  skill). What the mod uses:
  - `session.start`: keeps `e.cwd` as a last fallback folder, registers `/guilda-agents`, starts
    `$.clock.every(2000, poll)` and polls once. (Run 1 took the project dir from `e.cwd` once; see Run 1.)
  - Folder, read again at each poll: `$.session.cwd()`, then `$.session.root()`, then the `session.start` cwd;
    the first that has `.guilda/bindings.json` is read, else the first one. The event runs again after each reload, and a reload cancels the
    timers of the old module.
  - `poll`: `$.fs.read` of `<project>/.guilda/bindings.json` (address -> `{ tool, session, state?, updated? }`)
    and, only when that file is a valid object, `<project>/.guilda/queue.json` (an array of
    `{ id, state, agent }`, or `{ tasks: [...] }`). A missing or invalid file reads as "no agents". State of an
    agent: `binding.state`, else the state of its last queue task, else `idle`. Time of the last change:
    `binding.updated` (ISO text or ms), else the poll time at which the mod saw the state change. The result is
    one `$.state` value (`guilda-panel.snapshot`: agents and poll time), so the pane and band redraw on each
    write.
  - `$.ui.open({ id: 'guilda-agents', title: 'guilda agents' })` when the agent list goes from empty to not
    empty, and from `/guilda-agents`. With no agents the command opens nothing.
  - Diagnostics: each poll writes `guilda-panel.diagnostics` in `$.state` (folder read, folders looked in,
    whether `bindings.json` was found, agent count, poll time, last error and its time). A read or parse error
    is recorded there, not swallowed. `/guilda-agents` always answers these as text, and says whether the pane
    was opened (`opened`, or `open, not drawn: <reason>`).
  - `ui.render` `Pane` (`requestId: guilda-agents`): one row per agent: address, tool (`Codex` in the theme
    color `ide`, `Claude` in `claude`), state (running = warning, done = success, failed = error, review =
    suggestion), seconds since the last change, task id when the queue has one.
  - `ui.render` `AbovePrompt`: `next(e)` (no band of the mod) unless at least one agent is `running`; then
    `guilda: <n> Codex · <n> Claude running`.
  - `$.ui.toast` when a known agent changes to `done` or `failed`.
  - `ui.render` `ToolUse` with matcher `props.tool = Bash`: when `input.command` runs `codex` as the command
    (after optional `cd X &&` and `timeout [opts] N`, path prefix allowed), the hook keeps the engine row
    (`await next(e)`) and draws a `Codex` label above it.
  - `session.end`: cancels the timer, except for `reason: 'clear'` (the process goes on and no `session.start`
    follows a `/clear`).
- The mod uses no `$.process`, `$.http` or `$.fs.write`. `claude plugin validate` lists every call it makes.
- Static checks: `claude plugin validate <mod folder>`; `tsc -p` (TypeScript 5.6.3) with the `tsconfig.json`
  from the header of the types file, kept in a `mktemp -d` folder outside the mod, over the types file, the
  contract, the hooks module and the tests; `claude plugin test <mod folder>`. All three were run on the mods
  folder and `validate` and `test` again on the repo copy.
- Tests stand for the engine with test hooks: `fs.read` answers from a map in memory (a missing file is a
  `deny`, so the read rejects), `mock.clock` drives the 2 s timer, `ui.open` and `ui.toast` are recorded.
- Demo for M3: `labs/agent-panel/demo.mjs <project dir>` (Node, no dependencies). It adds `T1-arc-<rand>`
  (claude, `review`) and `T1-exe-<rand>` (codex, `running`) to `bindings.json` and a task to `queue.json`, with
  `updated` times, runs one real `codex exec --json --skip-git-repo-check -s read-only -C <dir> "Run the shell
  command: sleep 20. Then reply with only: DEMO-DONE"` (stdin `/dev/null`, 120 s timeout), then sets the codex
  agent and the task to `done` (`failed` on a timeout, an error or no `DEMO-DONE`). It keeps other entries and
  deletes no file. Not run by the dispatched agent.

## Evidence

### M1: static checks

- `claude plugin validate <mod folder>`: `✔ Validation passed with warnings`. Warnings: no `author` in
  `plugin.json`; the plugin-directory checks (README, LICENSE, icon), which do not change the result. It reports:
  - hooks: `session.start, session.end, command.run{command=guilda-agents}, ui.render{component=Pane,
    requestId=guilda-agents}, ui.render{component=AbovePrompt}, ui.render{component=ToolUse, props has
    {tool=Bash}}`
  - calls: `$.clock.every, $.clock.now (via poll), $.command.register, $.fs.read (via readJson), $.state.get,
    $.state.set, $.ui.open, $.ui.resolve, $.ui.toast (via poll)`
- An earlier draft failed validation: a `$` passed to a function declared inside `register` is refused. Fix: the
  poll function is declared at the top of the module.
- `tsc -p <tmp>/tsconfig.json`: exit 0.
- `claude plugin test <mod folder>`: 6 pass, 0 fail (run 1).
- After the run 1 fix: `validate` passes (calls now also list `$.fs.exists`, `$.session.cwd`, `$.session.root`;
  state `guilda-panel.diagnostics` and `guilda-panel.snapshot`), `tsc -p` exit 0, and `claude plugin test` on
  the mods folder and the repo copy:

```
(pass) M2: the pane lists each agent with address, tool, state and age
(pass) M5: without .guilda/bindings.json nothing is drawn or opened
(pass) M5: an invalid bindings file is ignored
(pass) a change to done raises a toast; the band goes away
(pass) M4: a Bash row that runs codex keeps the row and adds a Codex label
(pass) M6: the poll timer stops when the session ends
(pass) /guilda-agents replies with the folder, the file, the count, the poll time and the last error
(pass) /guilda-agents opens the pane that a narrow terminal kept undrawn
(pass) a bad bindings file is reported as the last error, not swallowed
(pass) the folder is read at each poll: the session cwd, then the project root
 10 pass
 0 fail
```

### M2: pane from files

Test `M2`: fixture `bindings.json` with `T1-exe-a1b2c3` (codex, `running`) and `T1-arc-a1b2c3` (claude,
`review`), `queue.json` with task `T1` for `T1-exe-a1b2c3`. After `session.start` the pane is opened once
(`ui.open` with `guilda-agents`). After 4 s on the mocked clock, the pane's texts on the terminal, desktop, vscode
and mobile surfaces are, in order:

```
T1-exe-a1b2c3  Codex   running  4s  T1
T1-arc-a1b2c3  Claude  review   4s
```

The `Codex` and `Claude` texts have different colors. The band reads `guilda: 1 Codex running` (terminal,
desktop). A second test changes the codex agent to `done`: one toast `guilda: T1-exe-a1b2c3 (Codex) done`, and the
band is gone (the engine's own drawing stands).

### M3: live update

Run 1: FAIL (see Run 1). Retest pending.

### M4: tool label

Run 1: FAIL (see Run 1). Retest pending. Test `M4` (support only): the rows of `codex exec ...`, `timeout 120 codex exec ...` and
`cd <dir> && timeout 120 codex exec ...` draw `Codex` and then the engine row; `echo codex`,
`git log --grep codex` and `ls codex-notes` draw the engine row alone.

### M5: no change without guilda

- Test `M5` (no files): after `session.start` and 6 s of polls, no `ui.open`; the band is the engine's own drawing
  alone; `/guilda-agents` answers `guilda: no agents in this project ...` and opens no pane.
- Test `M5` (invalid `bindings.json`, text `{ not json`): no `ui.open`.

### M6: no leftovers

- The mod starts no process: `validate` lists no `$.process` call, and the source has none.
- Test `M6`: 2 s timer reads the files while the session runs; after `session.end` (`prompt_input_exit`) and
  10 s more on the mocked clock, no more reads. A mutation check (the cancel removed, in a copy) makes this test
  fail, so the test sees the cancel.
- Reload: the types file says a hot reload cancels the pending waits of the old module (`clock`), and
  `session.start` cancels a timer it still holds before it starts a new one. Not tested in a live session.

### Run 1 (live, failed)

- What ran: a dispatched agent ran `node labs/agent-panel/demo.mjs ~` (home folder), then a direct
  `timeout 120 codex exec ...` Bash call. The demo wrote `~/.guilda/bindings.json` (`T1-arc-*` claude `review`,
  `T1-exe-*` codex `done`) and `~/.guilda/queue.json`.
- What the user saw: nothing of the mod. No pane, no band, no toast, no Codex label: only the normal prompt and
  the agent list.
- Cause (found in the session transcript): the mod loaded while the session's working directory was the guilda
  repo, not the home folder (the `This mod is now loaded` notice row carries the repo as `cwd`). `session.start`
  took `projectDir = e.cwd` once, so every poll read `<repo>/.guilda/bindings.json`, which does not exist (that
  folder holds only `config.json` and `rules.md`). No agents, so no pane, band or toast; `poll` swallowed any
  error, so nothing said so.
- Codex label: the `codex exec` Bash call ran in the dispatched agent, so its row is in that agent's transcript,
  not in the main one the user had on screen.
- Fix: the folder is read again at each poll (`$.session.cwd()`, `$.session.root()`, the `session.start` cwd;
  the first with `.guilda/bindings.json` wins); errors are recorded in `$.state`; `/guilda-agents` answers
  diagnostics and opens the pane as the person's own ask.

### Run 2: restyle

- Ask: show the guilda agents while they run, in the place and with the look of Claude Code's own agent list
  under the prompt (`○  <type>  <description> ... <elapsed> · ↓ <n> tokens`, dim), not as a pane or a box.
- First pass (commit `0f49f10`) drew the rows in `AbovePrompt`. The user saw a framed box above the prompt with
  addresses such as `T1-exe-290290`, and asked for the rows below the prompt, without addresses, and without the
  Claude agents the engine already lists.
- Position: the 2.1.321 `RenderComponent` union has no agent or task list (`AskUserQuestion`, `UserMessage`,
  `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `ToolProgress`, `CommandOutput`, `Spinner`,
  `TurnDuration`, `InfoNotice`, `SessionMode`, `PromptHint`, `AbovePrompt`, `Pane`, `Placed`, `Backdrop`), so a
  mod cannot draw inside or under the engine's list. The lowest site is `PromptHint`, "the dim hint line under
  the prompt"; a hook may "draw its own tree". The rows go there: the engine's hint line (`await next(e)`) first,
  the guilda rows under it. The types do not say whether the terminal gives that site more than one row; this is
  to be seen live. `$.ui.status` (a status line under the prompt) takes plain text only, so no dim rows.
- Rows: one dim `Text` per agent, `○  guilda:<role>-<tool>  <title>`, then `<elapsed>s · <state>` at the right
  end and `· ↓ <n> tokens` when the binding has `tokens`. No role: the tool name alone. The address is only in
  `/guilda-agents` (one line per agent) and the pane. Each row is padded to `e.viewport.columns`; the title is cut
  in the middle (`…`), dropped when under 4 cells are left, and `wrap="truncate-end"` keeps the row on one line.
- Shown: external agents only (tool not `claude`, binding not `inSession: true`), in state `running`, and done
  or failed ones for 10 s after the change (only if a poll saw them running). None: `next(e)` only. The toast
  on done or failed is for external agents only. The pane no longer opens by itself; `/guilda-agents` opens it.
- Binding format: optional `tokens`, `role`, `title` (else the queue task's `title`) and `inSession`.
  `demo.mjs` fills `role` and `title`, and writes `tokens` (input plus output of each `turn.completed` `usage`)
  while the Codex agent stays `running` for its 20 s job. Not run.
- Checks: `validate` passes with warnings, `tsc` passes, `claude plugin test` 12 pass, 0 fail (mod folder and
  repo copy). Not yet seen live.

### Run 3: live feedback

- M3, seen live: while the demo ran, the row `○  guilda:executor-codex  Run the agent panel live demo  19s · ru…`
  showed under the hint line (user confirmed). Done to hidden after 10 s: not yet confirmed live.
- Problems seen: the row sat right above the engine's list (`● main`, `○ general-purpose ...`) with nothing
  between, so it read as part of it or as a bug; its `○` looked like the engine's pressable agent rows; the right
  end was cut (`19s · ru…`): the hint site is narrower than `e.viewport.columns`, so a row padded to the
  viewport width overflowed.
- Changes: a dim `other models` heading over the rows; the marker is `◇` (U+25C7); the row is a flex row: the
  marker, the type (a plain dim `Button`), the title in a `Box` that grows and shrinks (`wrap="truncate-middle"`)
  and the right end in a `Box` that never shrinks, so the engine fits the row to the room it really has and only
  the title is cut.
- Position: still `PromptHint`. No render site sits after the engine's agent list.
- Hover and click: the types support both. A keyed `Box` is a hover scope; a `Box` drawn `position="absolute"`,
  `display="none"` with `hover={{ display: 'flex' }}` paints `›` over the marker while the pointer is on the row,
  with no hook run. The type is a `Button`; a press stores the agent in `$.state` and opens the detail pane,
  which lists that agent first, marked `›`. The reference says the terminal reports clicks in fullscreen
  (`where the surface reports clicks (the fullscreen terminal)`); on the main screen the arrow and the click are
  not expected to work. `/guilda-agents` opens the same pane from any screen.
- Checks: `validate` passes with warnings, `tsc` passes, `claude plugin test` 13 pass, 0 fail (mod folder and
  repo copy).

### Limits read in the docs (Claude Code 2.1.321 types)

- `ToolUse` for a subagent's tool calls: `ToolUse` is "a tool call's row in the transcript", and the transcript
  on screen is the main conversation's or one agent's "opened from the tasks list" (`SiteView`). `ToolUse` props
  carry no `agentId` or `view`. So a subagent's Bash row, and the Codex label on it, is drawn only while the
  person views that agent's transcript (picked in the tasks list); the main transcript shows the Agent call,
  not its inner rows. The types do not say more than this; not tested live. For M4 the `codex` command must run
  in the main session, or the user must open the agent's transcript.
- Pane opened unasked: `$.ui.open` places a pane "asked ... at any width; unasked, from 144 columns, 110 for one
  once asked"; below that it "waits undrawn" (`isPlaced: false`). The user's terminal was about 90 to 100
  columns, so the poll's own open would not draw it. `/guilda-agents` is the person's ask and places it at any
  width.

## Verdict

Given by the controller on 2026-11-09, from the agent evidence and the user's screen.

| ID | Verdict | How proven | Not tested |
|---|---|---|---|
| M1 | PASS | `claude plugin validate`, type check and `claude plugin test` (13 of 13) in each run. | |
| M2 | PASS | Tests with fixtures. The user saw the pane with two agents from `/guilda-agents`. | |
| M3 | PASS, with a condition | Run 1 failed: the mod read the folder of the session at load time. After the fix, the user saw a live row `◇ guilda:executor-codex ... 4s · running` under the heading `other models`. | The user did not report the change to `done`, the notice, or the hide after 10 s. |
| M4 | NOT VERIFIED | The label on a tool row shows only in the transcript of the agent that ran the command. | All. |
| M5 | PASS | Tests: no file or an invalid file gives no output. | |
| M6 | PASS | Tests: no process starts, and the timer stops at session end. | Stop of the timer on reload, and after `/clear`. |

Mouse hover (`›`) and click to open the detail: not tested. The terminal reports the mouse only in full screen.

The user accepted the layout: rows under the prompt, above the native agent list, with the `other models` heading.
The API of Claude Code 2.1.321 has no component inside or after the native agent list.

## Lessons

- A mod must read the session folder at each poll, not once at load. The working folder of a session can change.
- A mod must not drop its errors. `/guilda-agents` reports the folder, the file, the agent count and the last
  error. This found the cause of run 1 at once.
- The pane opens without a request only from about 144 columns. Narrow terminals need the command or the rows
  under the prompt.
- Show only agents from outside the conversation. Claude subagents of the session already show in the native list.
- A user-facing name such as `guilda:executor-codex` reads better than an address such as `T1-exe-290290`. Keep
  the address in the detail view.

