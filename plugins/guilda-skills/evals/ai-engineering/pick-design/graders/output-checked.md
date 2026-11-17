---
type: llm
weight: 1
---

The design checks the model output with code (not with another model) against exactly the four labels billing, bug, account and other, and states what happens when the output is not one of them (for example: a retry, the label other, or a person). PASS needs all three: a code check, the four labels, and the action on an invalid output. FAIL if any of the three is missing.
