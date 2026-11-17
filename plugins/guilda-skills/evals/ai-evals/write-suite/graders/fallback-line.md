---
type: regex
target: trace
pattern: '"file_path":"[^"]*evals/changelog/[^"]*prompt\.md","content":"(?:[^"\\]|\\.)*?not available'
match: contains
weight: 1
---

A prompt.md of the suite tells the session what to do when the skill is not available (the words "not available"), so that a run where the plugin did not load is visible (read from the Write calls in the trace).
