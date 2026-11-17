---
description: The coherence validator checks a fixture spec and its plan against the register.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:coherence-validator (subagent_type "guilda:coherence-validator") with the request below, then show me its report as it is.

REQUEST
Spec: docs/superpowers/specs/2026-11-10-password-reset.md
Plan: docs/superpowers/specs/2026-11-10-password-reset.plan.md
Register: docs/superpowers/specs/2026-11-10-decisions.md
