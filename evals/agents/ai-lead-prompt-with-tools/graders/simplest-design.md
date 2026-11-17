---
type: llm
weight: 1
---

The answer disagrees with the proposed agent, or justifies it with a written reason, and starts from the simplest design: one prompt that gets the table in its input. It says what would justify a larger design (tools, many steps or state). It gives at least two designs with calls and tokens for each. Pass if the simplest design is chosen or a written reason for the agent is given, and at least two designs are compared. Fail if it accepts the agent with no reason.
