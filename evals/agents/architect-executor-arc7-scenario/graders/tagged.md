---
type: llm
weight: 1
---

The scenario carries one of the tags @decided, @proposed or @open, and each value that the spec does not give (for example the exact error text or the QA tool) is either marked @open or @proposed or listed as a guess or a question, and not presented as a decision of the user. Pass if the tag is present and the unstated values are marked as guesses, open or proposed. Fail if the scenario has no tag, or if it presents an invented value as decided by the user.
