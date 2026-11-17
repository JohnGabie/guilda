---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict on a task that adds the skill `skills/release-notes/SKILL.md` (a prompt with the tool `Read`). The task adds no eval suite: no folder `evals/` and no eval case. Pass only if all of these are true:
1. The Result is REJECTED-SMALL or REJECTED-LARGE (not APPROVED).
2. A problem cites the part ID `AIG1` and says that the eval suite (the eval cases of the skill) is missing.
Fail if the Result is APPROVED, if no problem cites `AIG1`, or if the missing eval suite is not named as a problem.
