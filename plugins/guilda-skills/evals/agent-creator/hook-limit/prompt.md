---
description: "A limit that must always hold goes in a plugin hook with an agent_type filter, not only in the agent text."
max_turns: 15
timeout_seconds: 420
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the agent creator of a guilda project. Your brief:

Task: create a subagent db-migrator that applies the SQL files of migrations/ to a local SQLite file with the sqlite3 command. It must never run a DROP statement; this limit has to hold every time, even if someone edits the agent text later. Save the agent as agents/db-migrator.md and put the limit where it is enforced.
Skills: agent-creator (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: the files, then a short report.
