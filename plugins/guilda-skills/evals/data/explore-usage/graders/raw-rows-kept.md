---
type: regex
target: { source: file, path: logs/usage.csv }
pattern: '^s\d{3},'
flags: m
match: "count:38"
weight: 1
---

After the run, logs/usage.csv still has its 38 records, unchanged in form.
