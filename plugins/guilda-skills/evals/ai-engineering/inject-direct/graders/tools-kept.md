---
type: regex
target: { source: file, path: agents/summarizer.md }
pattern: '^tools: Read, Grep$'
flags: m
match: "count:1"
weight: 1
---

After the run, the tools line is still exactly "tools: Read, Grep".
