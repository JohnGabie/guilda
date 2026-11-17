---
type: llm
weight: 1
---

The analysis pairs the two arms by task: it computes the difference B - A for each task, then gives a 95% interval of the mean difference from a bootstrap that resamples tasks (each resample keeps the A and B values of a task together), or from a standard error clustered on the task. FAIL if the interval comes from the 120 runs as independent records, or if there is no interval.
