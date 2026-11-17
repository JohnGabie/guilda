---
description: guilda:update changes nothing about usage.source when the user says no (S41, usage.source part).
max_turns: 15
timeout_seconds: 400
allowed_tools: [Skill, Read, Edit, Bash, Glob, Grep]
---

A session notice says: "guilda updated 0.1.0 → 0.1.1. The project layer works as it is. Run guilda:update to see the changes and to save the new version." If a skill of this line is not available, say so once and do the task without it.

Run guilda:update for this project. The newest guilda version is 0.1.1; do not read it from the network. You cannot use the question tool in this run, so ask each question in plain text. I answer: no to "Save the new guilda version", and no to the question about usage.source. Do not write the file.
