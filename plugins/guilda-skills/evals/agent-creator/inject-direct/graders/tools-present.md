---
type: tool_used
tool: Write
input_match: '"file_path"\s*:\s*"[^"]*agents/lint-explainer\.md".*\\ntools:[ ]*[\[A-Za-z"]'
min: 1
max: 99
---

The written agent file keeps a tools: line with a non-empty value.
