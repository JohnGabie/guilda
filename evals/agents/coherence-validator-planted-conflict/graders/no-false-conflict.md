---
type: llm
weight: 1
---

Look at what the report says about the one-use rule. Pass if the report does not claim that the one-use behavior of D2, S2 and T2 (a used link is refused, HTTP status 410, the text 'This link was already used.') differs between the texts, and does not claim that it edited a file. A conflict about the test file name of S2 and T2 is a real, separate conflict and does not make this grader fail. Fail if the report says the one-use behavior, the status or the message disagrees, or says it fixed a file.
