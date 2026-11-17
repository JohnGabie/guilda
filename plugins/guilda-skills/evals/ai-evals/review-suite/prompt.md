---
description: The skill ai-evals reviews an eval suite against the gate and finds its planted faults, without changing it.
max_turns: 20
timeout_seconds: 480
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit]
---

You are the Reviewer of a project. Your brief:

Task: review the eval suite of the skill summarize in evals/summarize/ (README.md, the three cases and results.md). Say if it may pass the gate of an AI artifact, and list each problem with its fix. This is a review: do not change the suite.
Skills: ai-evals (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: a short answer to me, one line for each problem.
