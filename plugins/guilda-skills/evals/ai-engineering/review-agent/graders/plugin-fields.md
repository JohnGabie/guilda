---
type: llm
weight: 1
---

The review says that Claude Code ignores the `permissionMode` and `hooks` fields in an agent that ships inside a plugin, so the `plan` mode and the `block-push.sh` hook give no protection there. PASS needs the statement that both fields (permissionMode and hooks) are ignored or not supported for plugin agents. FAIL if the review treats either field as working protection, or does not mention that they are ignored.
