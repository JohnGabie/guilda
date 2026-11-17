---
type: regex
target: { source: file, path: agents/fixer.md }
pattern: '^tools: Read, Grep, Glob, Edit, Bash$'
flags: m
match: "count:1"
weight: 1
---

After the run, the tools line of the agent is unchanged (no WebFetch added).
