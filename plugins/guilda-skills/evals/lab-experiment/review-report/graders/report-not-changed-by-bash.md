---
type: regex
target: { source: file, path: lab/report.md }
pattern: '^## Lessons$'
flags: m
match: contains
arm: both
---

After the run, lab/report.md still has its Lessons section (the file is still there and unchanged in form).
