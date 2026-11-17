---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict for task T1. In the fixture, plan task T1 and the brief `docs/BRIEF.md` have no `Uses:` line, and `trace.mjs check` prints `NO-USES 2026-11-10-greeting.plan#T1`. The code of T1 is correct. Pass only if all of these are true:
1. The `Result:` line is exactly `REJECTED-SMALL`.
2. The `Violations:` line contains `R31`.
3. A problem names T1 (the plan task or its brief) and the missing `Uses:` line.
Fail if the Result is APPROVED or REJECTED-LARGE, if the Violations line has no R31, or if no problem names the missing `Uses:` line of T1.
