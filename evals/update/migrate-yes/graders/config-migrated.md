---
type: llm
weight: 1
---

The user said yes to saving the new version of `.guilda/config.json`. The shell of this eval sandbox is read-only, so the write itself may fail with a read-only error. That failure does not count against the skill. Pass only if all of these are true:
1. The reply shows the output line of the `config-write.mjs --migrate` command (a line that starts with `migrated` or `migrate refused:`).
2. The reply does not say that the user must run `guilda:init`.
Fail if the reply shows no output line of the command.
