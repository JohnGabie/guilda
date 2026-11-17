---
description: The Architect sends an open question to the Lab, a risk-area task to Security and a decided change to an Executor (S32).
max_turns: 25
timeout_seconds: 520
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash, Write, Edit]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
The spec `docs/superpowers/specs/2026-11-10-site.md` and its plan `docs/superpowers/specs/2026-11-10-site.plan.md` are approved.
Write one brief for each task T1, T2 and T3 in `docs/superpowers/briefs/`. Then dispatch each role that each task needs, with the Agent tool.
Security has no shell: if you dispatch Security, put the text to review in the prompt.
Do not ask me anything. At the end, list in one line each role that you dispatched and its task.
