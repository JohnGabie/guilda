---
type: llm
weight: 1
---

The answer says that the tier-small token counts should not be used as they are for the generation that will be deployed: the tokens must be counted again (or the runs measured again) against the model that will be used, because a newer model can use a different tokenizer and produce more tokens for the same text (the docs say about 30 percent more). It must not scale the old counts by a guessed factor and present that as the estimate; a scaled figure is allowed only if it is labelled as provisional. FAIL if it says the counts can be used as they are, or says nothing about recounting.
