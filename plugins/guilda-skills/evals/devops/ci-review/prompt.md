---
description: "The skill devops reviews a CI workflow against the checklist and does not change it."
max_turns: 12
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit]
---

You are the DevOps agent of a guilda project. Your brief:

Task: review the CI workflow .github/workflows/ci.yml before we merge it. Do not change the file. List each security problem, with its line, and the fix.
Skills: devops (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the full review in your answer (the reader sees only your last message).
