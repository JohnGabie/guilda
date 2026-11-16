---
description: guilda:update offers the --migrate write and changes nothing when the user says no (S43).
max_turns: 15
timeout_seconds: 400
allowed_tools: [Skill, Read, Bash, Glob, Grep]
---

A session notice says: "guilda updated 0.1.0 → 0.1.1. The project layer works as it is. Run guilda:update to see the changes and to save the new version."

Run guilda:update for this project. The newest guilda version is 0.1.1; do not read it from the network. When you offer to save the new version of .guilda/config.json, I say no. Do not write the file.
