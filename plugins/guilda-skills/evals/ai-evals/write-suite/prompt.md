---
description: The skill ai-evals writes an eval suite for a skill with real cases, a dated threshold, a budget and injection cases.
max_turns: 30
timeout_seconds: 540
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the AI lead of a project. Your brief:

Task: the skill plugin/skills/changelog/SKILL.md has no eval suite. Write its eval suite for `claude plugin eval` in plugin/evals/changelog/ (one folder for each case, with prompt.md and graders/*.md, and a README.md for the suite). Do not run it.
Skills: ai-evals (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the files of the suite, then a short answer to me with the list of cases.
