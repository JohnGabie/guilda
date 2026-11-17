---
type: regex
target: trace
pattern: '"file_path":"[^"]*release-notes/[^"]*eval[^"]*","content":"(?:[^"\\]|\\.)*?(?:injection|instruction)'
flags: i
match: contains
weight: 1
---

The eval file that the agent wrote has a case about an injection or an instruction inside the input (read from the Write call in the trace, not from the last message).
