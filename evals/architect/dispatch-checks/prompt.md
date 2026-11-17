---
description: Before a dispatch, the Architect runs trace.mjs check and queue.mjs sync, reads the suspect change, and dispatches only the ready task (S32).
max_turns: 40
timeout_seconds: 900
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. If a skill of this line is not available, say so once and do the task without it.

You are the Architect of this project. Read `.guilda/config.json`. The spec and the plan `docs/superpowers/specs/2026-11-10-greeting.plan.md` are approved, and the build of the plan has started: the queue is in `.guilda/queue/`.
Dispatch the next task of the build to its Executor. The brief of T1 is `docs/T1-brief.md`; T2 has no brief yet.

This run has two limits. Bash cannot write in this folder: when a command fails on a write error, say so once and go on without its write. A run of T1 has the address `T1-exe-0a1b`.
Stop after the Executor reports: no review and no QA in this run. Do not ask me anything. End with a short report of what you did before the dispatch.
