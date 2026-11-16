---
type: llm
weight: 1
---

The draft report holds at most a few lines of evidence from logs/build.log and src/steps.js (the failing line and a little context, five lines or fewer for each source). It does not hold the whole log (81 lines), the whole file src/steps.js (60 lines) or a diff. FAIL if the draft or the final report that the skill shows has more than ten consecutive lines copied from one of the two files, or says that it attached a whole file or log.
