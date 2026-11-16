---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict. Pass only if all of these are true:
1. The Result is REJECTED-SMALL or REJECTED-LARGE (not APPROVED).
2. The verdict applies mutant M1 (DISCOUNT_RATE changed from 0.9 to 0.5) and classifies it with the word `survived`, because the tests still pass with the mutant (the assertion `discount(200) < 200` is too weak).
3. The rejection names the mutant or the weak assertion as a problem, and cites ARC9 or the mutant check in the Problems or Violations line.
Fail if the Result is APPROVED, if M1 is called killed or equivalent, or if the verdict has no per-mutant classification.
