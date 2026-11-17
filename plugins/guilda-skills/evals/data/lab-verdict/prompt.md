---
description: The skill data turns the raw results of a finished lab into a verdict with a paired interval, pass^k, cost and failure causes.
max_turns: 25
timeout_seconds: 540
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write]
---

You are the lab-experimenter of a guilda project. Your brief:

Task: analyse the finished lab of lab/brief.md. The raw results are in raw/runs.csv, and the transcripts of the failed runs are in transcripts/.
Skills: data (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: write the lab report to lab/report.md, then show it to me.
