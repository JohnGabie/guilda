---
description: The Architect executor writes the Acceptance scenario of a decided item in a fixture spec.
max_turns: 16
timeout_seconds: 540
allowed_tools: [Agent, Read, Glob, Grep, Write, Edit, Bash]
---

Use the Agent tool to dispatch the agent guilda:architect-executor (subagent_type "guilda:architect-executor") with the request below, then show me its report and the text it wrote.

REQUEST
File: docs/superpowers/specs/2026-11-10-password-reset.md, section "Acceptance scenarios".
Write the Acceptance scenario for the decided item "A reset link expires 30 minutes after it is sent".
