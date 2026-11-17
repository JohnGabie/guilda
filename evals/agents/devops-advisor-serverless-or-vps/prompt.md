---
description: The DevOps advisor answers "serverless or a VPS" for a fixture project with options, trade-offs and commands for the user.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:devops-advisor (subagent_type "guilda:devops-advisor") with the request below, then show me its answer as it is.

REQUEST
Question: serverless or a VPS for this system? We want it live this week.
Spec: docs/superpowers/specs/2026-11-10-timesheets.md. The code is in src/ and scripts/ of the current directory.
