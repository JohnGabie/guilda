---
type: llm
weight: 1
---

The spec has two gaps: it does not say how the orders are sorted when the customer wants another order than newest first (or what ties do), and it does not say what the page shows when the customer has no orders (or how many orders one batch has). The final reply lists the guesses of a cold read and sorts each guess into one of three groups: answered, minor, or the user's. Pass only if the reply shows at least two guesses, each with a sort, and then asks for approval. Fail if the reply asks for approval with no sorted guesses.
