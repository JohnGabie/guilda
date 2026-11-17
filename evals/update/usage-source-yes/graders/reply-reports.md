---
type: llm
weight: 1
---

The user answered no to saving the new guilda version and yes to setting `usage.source`. Pass only if all of these are true:
1. The reply says that `usage.source` was set to "cswap" in `.guilda/config.json`.
2. The reply says that `guildaVersion` was not saved or was left as it was.
Fail if the reply says that `usage.source` was not set, or that `guildaVersion` was changed.
