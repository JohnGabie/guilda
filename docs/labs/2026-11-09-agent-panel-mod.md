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
  - `session.start`: takes the project dir from `e.cwd`, registers `/guilda-agents`, starts
    `$.clock.every(2000, poll)` and polls once. The event runs again after each reload, and a reload cancels the
    timers of the old module.
  - `poll`: `$.fs.read` of `<project>/.guilda/bindings.json` (address -> `{ tool, session, state?, updated? }`)
    and, only when that file is a valid object, `<project>/.guilda/queue.json` (an array of
    `{ id, state, agent }`, or `{ tasks: [...] }`). A missing or invalid file reads as "no agents". State of an
    agent: `binding.state`, else the state of its last queue task, else `idle`. Time of the last change:
    `binding.updated` (ISO text or ms), else the poll time at which the mod saw the state change. The result is
    one `$.state` value (`guilda-panel.snapshot`: agents and poll time), so the pane and band redraw on each
    write.
  - `$.ui.open({ id: 'guilda-agents', title: 'guilda agents' })` when the agent list goes from empty to not
    empty, and from `/guilda-agents`. With no agents the command only answers a text and opens nothing.
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
- `claude plugin test <mod folder>`: 6 pass, 0 fail (output below).

```
(pass) M2: the pane lists each agent with address, tool, state and age
(pass) M5: without .guilda/bindings.json nothing is drawn or opened
(pass) M5: an invalid bindings file is ignored
(pass) a change to done raises a toast; the band goes away
(pass) M4: a Bash row that runs codex keeps the row and adds a Codex label
(pass) M6: the poll timer stops when the session ends
 6 pass
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

NOT VERIFIED. Waits for the user: run `node labs/agent-panel/demo.mjs <project dir>` in the project of an
interactive session that has the mod loaded, and watch the pane go `running` -> `done`.

### M4: tool label

NOT VERIFIED by the user. Test `M4` (support only): the rows of `codex exec ...`, `timeout 120 codex exec ...` and
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

## Verdict

## Lessons
