---
description: The skill ai-evals checks an llm judge against hand labels on held-out rows, with the agreement on PASS and on FAIL labels apart.
max_turns: 15
timeout_seconds: 400
allowed_tools: [Skill, Read, Glob, Grep]
---

You are the QA of a project. Your brief:

Task: the team wants to use the llm judge of evals/judge/rubric.md as the grader of an injection case. Their hand labels and the judge votes are in evals/judge/labels.csv. The team says: "the judge agrees with us on 18 of 20 transcripts, 90%, so it is good". Is the judge good enough to use? Give the numbers and your verdict.
Skills: ai-evals (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: a short answer to me.
