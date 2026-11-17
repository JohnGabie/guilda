---
description: The skill ai-engineering picks the simplest design for an AI feature, with the input-as-data defense, output checks, evals and a budget.
max_turns: 12
timeout_seconds: 400
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the AI lead of a guilda project. Your brief:

Task: design the AI part of a feature for the support inbox of our product. Each new ticket (a subject and a body, written by customers) must get exactly one of four labels: billing, bug, account, other. The label then picks the team queue in our existing code. Do not write code yet.
Skills: ai-engineering (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: write the design to design/ticket-labels.md, then show it to me.
