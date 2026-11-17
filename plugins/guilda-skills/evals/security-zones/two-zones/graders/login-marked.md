---
type: regex
target: trace
pattern: 'one-time code\\nSecurity zone: login\b'
match: contains
weight: 1
---

The block 4.1 Sign-in with a one-time code got the line `Security zone: login` directly under its heading (read from the Edit or Write input).
