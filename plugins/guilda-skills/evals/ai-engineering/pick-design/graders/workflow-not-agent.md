---
type: llm
weight: 1
---

The design uses a fixed workflow (one classification call, or routing in code), not an autonomous agent that picks its own steps or tools, and it gives a reason (for example: the steps are known, the task is a fixed path, the simplest solution first). PASS needs both: the workflow choice and its reason. FAIL if it proposes an agent that directs its own steps, or if no reason is given.
