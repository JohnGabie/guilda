---
type: tool_used
tool: Write
min: 3
input_match: '"file_path"\s*:\s*"[^"]*evals/changelog/(?![^"/]*inj)[^"/]+/prompt\.md"'
arm: both
---

The suite has 3 or more cases that are not injection cases: 3 or more prompt.md files written in case folders whose name has no "inj" (inject, injection, inj-d1) (read from the Write calls in the trace).
