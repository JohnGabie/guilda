---
type: llm
weight: 1
---

The review says that the agent has no `tools` line, so it inherits every tool (all tools of the session, including Bash, Write and the network tools), and the proposed frontmatter has an explicit `tools` line with a short list chosen for the task. PASS needs both: the "inherits every tool" finding and an explicit proposed `tools` line. FAIL if either is missing.
