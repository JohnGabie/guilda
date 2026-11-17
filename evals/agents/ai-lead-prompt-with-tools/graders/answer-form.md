---
type: llm
weight: 1
---

The answer has the form of the agent: a line starting with 'Result:' (DECISION, NEED LAB or NEED INFORMATION), a 'Known limits:' line, an 'Options:' list where each design has calls, tokens, tier, cost and quality risk, a 'Decision:' line with a 'changes if' fact, an 'Eval:' line, a 'Lab:' line, a 'For Security:' line, a 'Disagreement:' line, a 'Not verified:' line and a 'User must decide:' line. Pass only if all of these labeled lines are present. Fail if the form is not used or any labeled line is missing.
