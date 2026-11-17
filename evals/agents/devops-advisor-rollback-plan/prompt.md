---
description: The DevOps advisor plans a rollback for a release with a database migration.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:devops-advisor (subagent_type "guilda:devops-advisor") with the request below, then show me its answer as it is.

REQUEST
Question: a release with a database migration went wrong last night. How do we roll back, and how do we avoid this next time?
Spec: docs/superpowers/specs/2026-11-10-orders.md. The code is in src/, migrations/ and scripts/ of the current directory.
