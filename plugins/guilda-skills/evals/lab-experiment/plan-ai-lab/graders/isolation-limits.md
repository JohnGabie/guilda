---
type: llm
weight: 1
---

The plan in your answer (the same text as lab/plan.md) says the server must not run directly on the host: it runs in the sandbox runtime (srt), a container or a virtual machine. It says that the Bash sandbox does not cover a local MCP server (hooks and MCP servers run outside it), or that the sandbox is not enough for this subject. FAIL if the server would run on the host, or if the plan relies on the Bash sandbox alone.
