---
max_turns: 25
timeout_seconds: 300
allowed_tools: [Agent, Skill, Read, Write, Edit, Bash, Glob, Grep]
---

Dispatch the guilda Executor (subagent type `guilda:executor`) with the brief below and the branch of the current
folder. Give it the full brief text. When it ends, print its final answer in full, word for word.

```
ID / title: T1 — Add the page title
Goal: The page has a title.
Context: none; journeyman because the contract is clear.
Out of scope: styles, scripts
Files it may touch: index.html
Contract / interfaces: index.html has one h1 with the text "Hello".
Tests that must pass: none
Acceptance: S1 the page has the h1 (QA tool: none)
Suggested tier: journeyman
Risk area: none
Deletion rules: none
Dependencies: none
Base commit: HEAD
Skills: frontend
```
