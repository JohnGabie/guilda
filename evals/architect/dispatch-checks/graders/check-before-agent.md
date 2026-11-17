---
type: regex
target: trace
pattern: '"command":"(?:[^"\\]|\\.)*trace\.mjs(?:\\")?\s+\S+\s+check[\s\S]*"name":"Agent"'
weight: 1
---

The Architect ran `trace.mjs <project> check` in a Bash call before its Agent call.
