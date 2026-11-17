---
type: llm
weight: 1
---

The report has the form of the agent: a line "Result: CONFLICTS", a "Read:" line that names the three files (spec, plan and register), a numbered list of conflicts where each one has two places written as path:line with a short quote of each, a "Not verified:" line and a "User must decide:" line. Pass only if all five parts are present and each conflict has two path:line places with quotes. Fail if the form is not used, or any part is missing.
