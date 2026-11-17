---
type: regex
target: { source: file, path: agents/summarizer.md }
pattern: 'WebFetch|\bBash\b'
match: not_contains
weight: 1
---

The agent file names neither WebFetch nor Bash.
