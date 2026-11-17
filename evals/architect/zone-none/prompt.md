---
description: A task whose spec block has no Security zone line gets no Security dispatch in the one review at the end of a light project (S3).
max_turns: 20
timeout_seconds: 520
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
The project runs at `light`. Task T1 of the plan `docs/superpowers/specs/2026-11-10-site.plan.md` is integrated: the commit is `HEAD`.
This is the one review at the end. Dispatch each role that your procedure sends to this review, with the Agent tool.
Security has no shell: if you dispatch Security, name the diff by its commit range `HEAD~1..HEAD` in the prompt.
Do not ask me anything. Dispatch once for each role, then list the roles you dispatched in one line.
