---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict. Pass only if all of these are true:
1. The verdict classifies mutant M1 (`n < lo` changed to `n <= lo`) with the word `equivalent`, and gives a reason that says the behavior does not change (at n equal to lo the function returns lo, which is n).
2. The verdict does not list M1 as survived, and the Problems line does not ask the Executor for a fix, a new test or a change because of M1.
3. The verdict classifies M2 (the `n > hi` line deleted) with the word `killed`, with the failing test named.
Fail if M1 is called survived, if M1 causes a rejection or a fix round, or if the verdict has no per-mutant classification.
