---
type: llm
weight: 1
---

Two checks. (1) The answer says how to test that the design works: a set of test emails with known queues, or an accuracy measure. A fixed accuracy number is not required; leaving the number to the user is fine. (2) The answer names the risk that text inside an email can steer the model (prompt injection, or instructions inside an email) and says that security (a security role, team or review) should check it. Pass if both checks are met anywhere in the answer. Fail if either one is missing.
