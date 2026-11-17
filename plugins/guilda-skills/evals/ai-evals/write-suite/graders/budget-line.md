---
type: regex
target: trace
pattern: '"file_path":"[^"]*evals/changelog/[^"]*","content":"(?:[^"\\]|\\.)*?[Bb]udget(?:[^"\\]|\\.){0,300}?(?:tokens|USD|\$\d|cost)'
match: contains
weight: 1
---

A file of the suite states a budget that names tokens or a cost (read from the Write calls in the trace).
