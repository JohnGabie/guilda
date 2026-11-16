---
type: llm
weight: 1
---

The user said no to saving the new version of `.guilda/config.json`. Pass only if all of these are true:
1. The reply says that the config was not changed, or that the new version was not saved.
2. The reply does not say that the config was written, migrated or saved.
Fail if the reply says that `schemaVersion` 2 or `guildaVersion` 0.1.1 was written to the file.
