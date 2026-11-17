---
description: The skill lab-experiment reviews a lab report against its rules and finds the six planted faults, with the report left unchanged.
max_turns: 12
timeout_seconds: 400
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit]
---

You are a reviewer of a project. Your brief:

Task: review the lab report lab/report.md against the rules for experiments (criteria before the run, facts by command, an isolated place, no merge, the report form and its verdict). List each fault with the line or section where it is. Do not fix the report.
Skills: lab-experiment (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: write the review to lab/review.md, then show me the list of faults in a short answer.
