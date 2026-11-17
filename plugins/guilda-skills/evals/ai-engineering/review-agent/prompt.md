---
description: The skill ai-engineering reviews an agent definition for tools, plugin fields, input as data and high-risk actions, and leaves the file unchanged.
max_turns: 15
timeout_seconds: 450
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit]
---

You are the AI lead of a guilda project. Your brief:

Task: review the agent definition plugin/agents/issue-triager.md before we merge it. It ships inside our Claude Code plugin. List each problem with the fix, and write the frontmatter that you propose. Do not change the agent file: the author fixes it after the review.
Skills: ai-engineering (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: write the review to review/issue-triager.md, then show it to me.
