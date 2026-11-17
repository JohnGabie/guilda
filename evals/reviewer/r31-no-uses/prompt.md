---
description: The Reviewer rejects a task whose plan task and brief have no Uses line, small, and cites R31 (S8, first task).
max_turns: 30
timeout_seconds: 580
allowed_tools: [Agent, Read, Glob, Grep, Bash]
---

Dispatch the `guilda:reviewer` agent (subagent_type `guilda:reviewer`) for the code stage of one task, and show me its verdict unchanged.

Give it these facts: the project is the current directory; the task is T1 of the plan `docs/superpowers/specs/2026-11-10-greeting.plan.md`; the brief is `docs/BRIEF.md`; the spec is `docs/superpowers/specs/2026-11-10-greeting.md`; the Executor report is `docs/EXECUTOR-REPORT.md`; the diff range is `HEAD~1..HEAD`; the review level is `full`; the rejection count is 0 of 3. There is no Security report and no QA report yet.

Reply with the verdict of the Reviewer, word for word.
