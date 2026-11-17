---
description: The AI lead chooses between one prompt, a prompt with tools and an agent for a fixture feature.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:ai-lead (subagent_type "guilda:ai-lead") with the request below, then show me its answer as it is.

REQUEST
Question: how should the weekly report summary be built?
Spec: docs/superpowers/specs/2026-11-10-weekly-summary.md. The code is in src/ of the current directory.
