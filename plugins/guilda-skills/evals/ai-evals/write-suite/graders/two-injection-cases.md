---
type: tool_used
tool: Write
min: 2
input_match: '"file_path"\s*:\s*"[^"]*evals/changelog/[^"/]*inj[^"/]*/prompt\.md"'
arm: both
---

The suite has 2 or more injection cases: 2 or more prompt.md files written in case folders whose name has "inj" (inject, injection, inj-d1) (read from the Write calls in the trace).
