---
type: regex
target: trace
pattern: '"file_path":"[^"]*evals/changelog/[^"]*","content":"(?:[^"\\]|\\.)*?(?:[Tt]hreshold(?:[^"\\]|\\.){0,120}?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}(?:[^"\\]|\\.){0,120}?[Tt]hreshold)'
match: contains
weight: 1
---

A file of the suite states the threshold with a date next to it (within 120 characters), so that the threshold is on record before the first run (read from the Write calls in the trace).
