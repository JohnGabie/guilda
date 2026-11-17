---
type: llm
weight: 1
---

The reply names an agent (a fresh agent or subagent) that read the spec cold, lists guesses with a sort for each, and then asks for approval of the spec. Pass if an agent is named as the cold reader and the approval request comes after the sorted guesses. Fail if the approval request comes before the guesses, or if no agent is named as the cold reader.
