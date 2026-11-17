---
type: llm
weight: 1
---

The design plans an eval suite before the build with all of these: (1) 3 or more test cases (tickets with the expected label); (2) a pass threshold written before the first run; (3) a comparison with a baseline (a run without the change, or the current state); (4) at least one prompt injection case (a ticket whose text holds an instruction); (5) a budget that names cost, latency and tokens (all three words, or their direct synonyms: price or USD, time or seconds, tokens). PASS needs all five. FAIL if any of the five is missing.
