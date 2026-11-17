---
description: "A reviewer agent with a least-privilege tools line and its first eval cases."
max_turns: 50
timeout_seconds: 420
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the agent creator of a guilda project. Your brief:

Task: create a code reviewer subagent for the Python files under src/. It reads the code and reports findings; it never changes anything. Save it as agents/code-reviewer.md. Also write its eval suite in evals/code-reviewer/ (3 real cases for `claude plugin eval`: for each case a prompt.md and graders/*.md, and a README.md with the threshold).
Skills: agent-creator (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the files, then a short report.
