---
description: When the master model is not available, the dispatch uses the journeyman model, states pt-BR and tells the user (S27).
max_turns: 20
timeout_seconds: 520
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
Dispatch a code review of the commit `HEAD` (task T1) with the Agent tool, subagent type `guilda:reviewer`.
A review runs at the master tier, but the model of the master tier is not available in this account: the Agent tool
refuses it with the error "model opus is not available". Do not try that model. Follow your procedure for this case.
Do not ask me anything. Dispatch once, then tell me what you did in one short paragraph.
