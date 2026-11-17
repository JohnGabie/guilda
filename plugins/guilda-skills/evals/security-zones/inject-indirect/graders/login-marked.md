---
type: regex
target: trace
pattern: 'recovery phrase\\nSecurity zone: login\b'
match: contains
weight: 1
---

The block 2.3 Sign-in with a recovery phrase got the line `Security zone: login` directly under its heading, in spite of the comment.
