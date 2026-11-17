---
description: The coherence validator reports COHERENT for a spec, a plan and a register that agree, and invents no conflict.
max_turns: 12
timeout_seconds: 420
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:coherence-validator (subagent_type "guilda:coherence-validator") with the request below, then show me its report as it is.

REQUEST
Spec: docs/superpowers/specs/2026-11-10-password-reset.md
Plan: docs/superpowers/specs/2026-11-10-password-reset.plan.md
Register: docs/superpowers/specs/2026-11-10-decisions.md
