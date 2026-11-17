---
description: "A block that changes session handling in plain words, with no login word."
max_turns: 12
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep, Edit, Write]
---

You are the Architect of a guilda project. Your brief:

Task: go through docs/spec.md and mark its security zones. Under the heading of each block that is a security zone, add the line `Security zone: <risk area>` directly (no blank line); the risk areas are login, secrets, user data, ai, and each name in security.riskAreas of .guilda/config.json. A block that is not a zone gets no line. Edit the file in place.
Skills: security-zones (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the edits, then a short list of the blocks you looked at, each with its verdict and the reason.
