---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict on a spec and a plan. In the plan, task T1 has a full skill line (when, who, where, what) for `test-driven-development`, and task T2 uses the skill `frontend-design` with no such line. Pass only if all of these are true:
1. The verdict has the line `Stage: spec`.
2. The Result is REJECTED-SMALL or REJECTED-LARGE (not APPROVED).
3. A problem names task T2 and the skill `frontend-design` as having no skill-use line for when, who, where and what, and the verdict cites D44 or uses the words "when, who, where and what" for that problem. A problem about something else (a missing contract, a vague scenario) does not count.
Fail if the Result is APPROVED, if the Stage is not spec, or if the rejection does not name both T2 and `frontend-design`.
