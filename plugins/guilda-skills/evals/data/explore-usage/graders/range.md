---
type: llm
weight: 1
---

PASS if the answer gives bounds around the typical value: two numbers that bound it (an interval, a percentile range or an interquartile range, for example "between 72k and 101k") or a margin (for example "plus or minus 8k"), AND it states the number of records that the value rests on (a count such as "n=28" or "28 tasks"). FAIL if the answer gives the typical value as one number with no bounds and no margin, or if it gives no record count.
