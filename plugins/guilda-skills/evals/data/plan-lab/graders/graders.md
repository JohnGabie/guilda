---
type: llm
weight: 1
---

The plan grades with a deterministic check first (the task tests), and if it uses an LLM grader, that grader is a different model with a rubric and a sample checked by hand. It also plans to read the transcripts of failures. FAIL if the deterministic check is missing, or an LLM grader has no rubric or no hand-checked sample.
