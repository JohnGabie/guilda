---
type: llm
weight: 1
---

Pass only if the reply (or a tool call before it) asks the user whether to set `usage.source` to "cswap", and then says that `usage.source` is unchanged or that the config was not changed. Fail if it says the key was written.
