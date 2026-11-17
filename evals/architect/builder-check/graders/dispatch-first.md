---
type: llm
weight: 1
---

The reply has three parts in this order: a line that says an agent read the spec cold (a fresh agent or subagent), a list of guesses with a sort for each, and a request for approval of the spec. Pass if the approval request is the last part and the line about the cold read comes first. Fail if the approval request comes before the guesses, or if no agent is named as the cold reader.
