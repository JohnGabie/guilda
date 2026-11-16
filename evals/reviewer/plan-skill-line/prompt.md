---
description: In spec review mode, the Reviewer rejects a plan where a task uses a skill with no line for when, who, where and what (S36, D44).
max_turns: 25
timeout_seconds: 520
allowed_tools: [Agent, Read, Glob, Grep, Bash]
---

Dispatch the `guilda:reviewer` agent (subagent_type `guilda:reviewer`) to review a spec and its plan before any code is written, and show me its verdict unchanged.

Give it these facts: this is the spec review (the review of the documents, not of a diff); the spec is `docs/superpowers/specs/2026-11-10-greeting.md`; the plan is `docs/superpowers/specs/2026-11-10-greeting.plan.md`; the glossary is `docs/superpowers/specs/GLOSSARY.md`; there is no diff; the rejection count is 0 of 3.

Reply with the verdict of the Reviewer, word for word.
