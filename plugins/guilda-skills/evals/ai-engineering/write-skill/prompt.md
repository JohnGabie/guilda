---
description: The skill ai-engineering writes a skill with a Use when description, a script for the fragile step, narrow tools, input as data and evals first.
max_turns: 15
timeout_seconds: 450
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the AI lead of a guilda project. Your brief:

Task: write a Claude Code skill for the plugin of our project (plugin/) that drafts the release notes from the git log since the last tag. The commit messages come from outside contributors too. The release also bumps the version in package.json and in src/version.ts; that bump broke twice when people did it by hand. Do not run git or any command now; only write the files.
Skills: ai-engineering (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the skill in plugin/skills/release-notes/ (SKILL.md and any file next to it that it needs), then show me SKILL.md in full and list the other files that you wrote, with one line on what each does.
