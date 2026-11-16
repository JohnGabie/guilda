---
description: The Reviewer reads a lab report and checks the agent ID and the criteria written before the run (R26, D34).
max_turns: 20
timeout_seconds: 480
allowed_tools: [Agent, Read, Glob, Grep, Bash]
---

Dispatch the `guilda:reviewer` agent (subagent_type `guilda:reviewer`) to review one lab report, and show me its verdict unchanged.

Give it these facts: the report is `docs/labs/2026-11-10-cache-keys.md`; it is a lab report in the form of D34, not a code task, so there is no brief, no diff and no QA run; the review reads the report only; the rejection count is 0 of 3.

Reply with the verdict of the Reviewer, word for word.
