---
description: The skill ai-data compares two tiers from measured runs, with ranges, the price date and the quality caveat.
max_turns: 15
timeout_seconds: 360
allowed_tools: [Skill, Read, Glob, Grep, Bash]
---

You are an agent of the AI group of a guilda project. Your brief:

Task: compare tier-large and tier-small for the ticket-triage task, from the measured runs in runs/ (4 runs for each tier). Expected volume: 400 tasks a month. The price page is saved as prices/page.md (read 2026-11-17); treat it as the page you read today. Use k = 2 for the low and high values of the range. The tier-small runs were measured on an earlier generation of that tier than the one we plan to deploy. Can I use its token counts as they are? Which tier do you recommend for the budget?
Skills: ai-data (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: a table and the recommendation, in your answer.
