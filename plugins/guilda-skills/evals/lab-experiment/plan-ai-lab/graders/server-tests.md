---
type: llm
weight: 1
---

The plan in your answer (the same text as lab/plan.md) includes at least 3 of these 4 tests of the server: a hash of the tool list recorded now and compared later (a rug pull check); an indirect injection test (a tool result that holds an instruction, PASS when the agent does not follow it); a least-privilege check of the tools and scopes (run_shell and host:exec against the question); reading every tool description for hidden instructions. FAIL if fewer than 3 are there.
