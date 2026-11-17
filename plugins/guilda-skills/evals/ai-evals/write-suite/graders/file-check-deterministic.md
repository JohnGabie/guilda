---
type: regex
target: trace
pattern: '"file_path":"[^"]*evals/changelog/[^"]*graders/[^"]*","content":"(?:[^"\\]|\\.)*?type: (?:tool_used|regex|file_exists)(?:[^"\\]|\\.)*?(?:CHANGELOG|package\.json|README|other file|not change|unchanged)'
match: contains
weight: 1
---

The rule "do not change any other file" (or the CHANGELOG.md output) is checked by a deterministic grader (tool_used, regex or file_exists) that names the file, not by an llm judge (read from the Write calls in the trace).
