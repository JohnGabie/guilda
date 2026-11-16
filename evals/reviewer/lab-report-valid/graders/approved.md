---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict on a lab report whose header line has an agent ID and whose PASS criteria are marked "written before the run". Pass only if all of these are true:
1. The Result is APPROVED.
2. The verdict does not say that the agent ID is missing, and does not say that the PASS criteria were not written before the run.
3. R26 is not cited as a violation (the Violations line is `none` or lists no R26).
Fail if the Result is a rejection for the agent ID or for the criteria.
