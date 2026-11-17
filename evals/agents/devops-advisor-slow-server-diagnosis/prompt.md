---
description: The DevOps advisor gives a diagnosis plan for a slow server from a fixture log.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:devops-advisor (subagent_type "guilda:devops-advisor") with the request below, then show me its answer as it is.

REQUEST
Question: the API is slow every day around 09:00 and sometimes returns errors. What is happening and what do we check first?
Spec: docs/superpowers/specs/2026-11-10-booking.md. Logs of the last days are in logs/ of the current directory.
