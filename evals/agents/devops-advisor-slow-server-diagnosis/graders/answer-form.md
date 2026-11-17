---
type: llm
weight: 1
---

The answer has the form of the agent: a line starting with 'Result:' (RECOMMENDATION or NEED INFORMATION), a 'Known limits:' line, an 'Options:' list where each option has cost, operation, scale limit, lock-in, rollback and risks, a 'Recommendation:' line with a 'changes if' fact, a 'Commands for the user:' line, a 'Disagreement:' line, a 'Not verified:' line and a 'User must decide:' line. Pass only if all of these labeled lines are present. Fail if the form is not used or any labeled line is missing.
