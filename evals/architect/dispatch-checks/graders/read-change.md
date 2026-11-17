---
type: llm
weight: 1
---

In the fixture, plan task T1 cites `D1@0941709c`. A later commit added the line `- Why: the page greets the user after a login.` to block D1, so the link of T1 to D1 is suspect. T1 is `ready`; T2 is `pending` because it depends on T1. Pass only if the final reply says both of these:
1. The link of T1 to D1 is suspect (or changed), and the change is the added `Why:` line of D1. A reply that says it could not read the change, or that names no change, fails.
2. It dispatched T1 only, and not T2.
