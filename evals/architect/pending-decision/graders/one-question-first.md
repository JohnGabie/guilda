---
type: llm
weight: 1
---

The reply puts the one pending decision as a single question that starts with its context and a recommendation, before any other text about the decision, then lists the options (cookie, browser storage). Pass only if all are true: 1. exactly one decision is asked; 2. the context comes before the options; 3. a recommendation of one option is stated; 4. the decision is not left as a loose remark inside a long paragraph. Fail if the reply asks several decisions or gives no recommendation.
