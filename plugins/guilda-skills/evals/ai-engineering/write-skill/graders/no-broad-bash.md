---
type: regex
target: { source: file, path: plugin/skills/release-notes/SKILL.md }
pattern: '^allowed-tools:[^\n]*\bBash\b(?!\()'
flags: m
match: not_contains
weight: 1
---

The skill does not grant itself Bash without a command pattern in allowed-tools.
