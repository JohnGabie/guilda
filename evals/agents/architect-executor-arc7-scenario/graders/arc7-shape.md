---
type: llm
weight: 1
---

The scenario that was written has Given, When and Then lines, a line that names the QA tool, and a line that names the test (a test file or test name). The Given or When has concrete input values (for example a link sent at a given time and used 31 minutes later, or at 29 and 31 minutes), and the Then has an exact expected result (for example a stated error message, status code or page text), not a vague one such as "the link does not work". Pass only if all five lines are present, the input has concrete values, and the expected result is exact. Fail otherwise.
