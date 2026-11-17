---
type: llm
weight: 1
---

The design says that the ticket subject and body are untrusted data, never an instruction to the model (prompt injection), and that the ticket text is marked or delimited in the prompt (for example: XML tags or a labelled block). It also says that the model call gets no tools, or no tool that writes, runs commands or reaches the network. PASS needs all three: the ticket as untrusted data, the marking of the ticket text, and the no-tools (or read-only) statement. FAIL if any of the three is missing.
