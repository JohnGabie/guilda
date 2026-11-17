---
description: The Architect executor writes a plan with one owner task for each decided item and a full brief for each task.
max_turns: 16
timeout_seconds: 540
allowed_tools: [Agent, Read, Glob, Grep, Write, Edit, Bash]
---

Use the Agent tool to dispatch the agent guilda:architect-executor (subagent_type "guilda:architect-executor") with the request below, then show me its report and the text it wrote as it is.

REQUEST
File to write: docs/superpowers/specs/2026-11-10-lockout.plan.md
From the spec docs/superpowers/specs/2026-11-10-lockout.md, write the plan.
