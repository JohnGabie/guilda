---
description: The skill ai-data refuses to guess a token count and gives the method with a range.
max_turns: 8
timeout_seconds: 240
allowed_tools: [Skill, Read, Glob, Grep]
---

You are an agent of the AI group of a guilda project. Your brief:

Task: we plan an agent that reads one support ticket and writes a draft reply. About 400 tickets a month. I need the monthly cost in USD for the budget meeting. Nothing has been run yet and there is no usage log. Give me the number.
Skills: ai-data (load each skill of this line with the Skill tool before you answer). If a skill of this line is not available, say so once and do the task without it.
Output: the estimate in your answer.
