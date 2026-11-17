---
type: llm
weight: 1
---

Each task of the plan has these fields as lines: Goal, Context, Files it may touch, Tests that must pass, Acceptance, Suggested tier, Risk area, Dependencies, and Base commit. At level full each task also has a Mutants line (one change to the product code that makes each new test fail). Pass only if the nine fields and the Mutants line are in each task. Fail if a field is missing in any task.
