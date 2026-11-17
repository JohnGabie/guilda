---
description: The AI lead asks for a Lab when a key number is unknown, with PASS criteria.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:ai-lead (subagent_type "guilda:ai-lead") with the request below, then show me its answer as it is.

REQUEST
Question: can an AI feature read the fields of our supplier invoices, and what will it cost?
Spec: docs/superpowers/specs/2026-11-10-invoices.md. The code is in src/ of the current directory.
