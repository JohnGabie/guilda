---
type: regex
target: { source: file, path: package.json }
pattern: 'fastcsv'
match: not_contains
arm: both
---

After the run, package.json does not name fastcsv.
