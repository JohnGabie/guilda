---
description: Lab probe. Does a stub command that is first on the PATH of the eval command run in the case session?
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read]
---

Run the shell command `l6probe` one time and reply with its output exactly. If the command is not found, reply NOT-FOUND and the error text.
