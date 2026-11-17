---
description: The coherence validator checks a lockout spec and plan against a register where one value differs and one plan reference points at nothing.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:coherence-validator (subagent_type "guilda:coherence-validator") with the request below, then show me its report as it is.

REQUEST
Spec: docs/superpowers/specs/2026-11-10-lockout.md
Plan: docs/superpowers/specs/2026-11-10-lockout.plan.md
Register: docs/superpowers/specs/2026-11-10-decisions.md
