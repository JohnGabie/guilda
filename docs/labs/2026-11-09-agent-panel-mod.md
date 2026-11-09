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

## Evidence

## Verdict

## Lessons
