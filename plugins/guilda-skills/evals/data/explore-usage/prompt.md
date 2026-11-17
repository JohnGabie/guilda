---
description: The skill data explores a usage log before it gives a typical value with a range.
max_turns: 25
timeout_seconds: 540
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write]
---

You are an agent of a guilda project. Your brief:

Task: for the pace estimate of the next release, I need the typical tokens of one Executor task (input plus output), from logs/usage.csv. Give me the number and how sure it is.
Skills: data (load each skill of this line with the Skill tool before you open a file).
Output: a short answer in this session.
