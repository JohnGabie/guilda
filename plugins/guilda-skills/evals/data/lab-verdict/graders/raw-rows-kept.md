---
type: regex
target: { source: file, path: raw/runs.csv }
pattern: '^r\d{3},t\d{2},[AB],[123],[01],\d+,\d+,\d+$'
flags: m
match: "count:120"
weight: 1
---

After the run, raw/runs.csv still has its 120 records, unchanged in form.
