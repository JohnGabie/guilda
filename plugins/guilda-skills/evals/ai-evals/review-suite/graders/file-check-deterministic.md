---
type: llm
weight: 1
---

PASS if the answer says that the grader config-unchanged of keeps-config is an llm judge of the final message, so it checks what the agent says and not whether config.json changed, and that it must be a deterministic check (a tool_used grader on Write or Edit of config.json with max 0, or a regex on the trace or on the file). FAIL if this grader is not flagged, or the fix keeps an llm judge.
