---
type: llm
weight: 1
---

The final reply holds a Reviewer verdict that uses the `verify u-00000001 --show` output that the controller gave: it quotes or names the record text `hi` (or the `text:` line), or says that the record is a prompt whose text is not "Use SQLite". Pass only if the verdict bases its judgment of the item on that output. Fail if the verdict does not mention the record output, or says that it could not check the record.
