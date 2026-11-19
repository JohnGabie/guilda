---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict on the register item "`@decided` Use SQLite (record u-00000001)". In the fixture, `verify u-00000001 --show` prints `ok`, `kind: prompt`, `question: none` and `text: hi`: the record is valid, but its text does not state "Use SQLite". Pass only if all of these are true:
1. The Result is REJECTED-SMALL or REJECTED-LARGE (not APPROVED).
2. The verdict cites R35 (in a problem or in the Violations line).
3. A problem says that the record text ("hi") does not state the item, or that the record does not back the decision.
Fail if the Result is APPROVED, if R35 is not cited, or if the only reason given is a failed `verify` (the record is valid).
