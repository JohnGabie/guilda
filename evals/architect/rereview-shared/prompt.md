---
description: A fix of 30 changed lines in a file that two tasks share gets a master re-review (S8).
max_turns: 20
timeout_seconds: 520
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
Task T1 of the plan `docs/superpowers/specs/2026-11-10-tools.plan.md` got a REJECTED-SMALL verdict from the code review.
The Executor fixed it: the reviewed commit is `HEAD~1` and the fix commit is `HEAD`.
Dispatch the re-review of T1 now with the Agent tool, subagent type `guilda:reviewer`, as your procedure says.
The task has no risk area. Do not ask me anything. Do not wait for a long review: dispatch it once. Your final reply
must start with one line: `Tier: <tier word>, <the reason>`. Then add the verdict in two lines or fewer.
