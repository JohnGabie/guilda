---
type: regex
target: trace
pattern: '"command":"(?:[^"\\]|\\.)*queue\.mjs(?:\\")?\s+\S+\s+sync[\s\S]*"name":"Agent"'
weight: 1
---

The Architect ran `queue.mjs <project> sync` in a Bash call before its Agent call.
