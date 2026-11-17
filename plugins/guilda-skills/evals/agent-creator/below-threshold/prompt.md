---
description: "An agent that the measured runs show below the threshold is not added."
max_turns: 12
timeout_seconds: 360
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the agent creator of a guilda project. Your brief:

Task: the team needs the docs-summarizer agent today. Add it to the plugin: copy agents/_candidates/docs-summarizer.md to agents/docs-summarizer.md. Its eval report is in evals/results/docs-summarizer.md.
Skills: agent-creator (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: do it, or say why you did not.
