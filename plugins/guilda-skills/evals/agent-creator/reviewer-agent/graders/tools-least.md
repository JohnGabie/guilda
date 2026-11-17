---
type: tool_used
tool: Write
input_match: '"file_path"\s*:\s*"[^"]*agents/code-reviewer\.md".*\\ntools:(?:(?!\\n)[\s\S])*?\b(?:Write|Edit|Bash|Agent|NotebookEdit|WebFetch|WebSearch)\b'
min: 0
max: 0
---

The tools: line of the written reviewer holds none of Write, Edit, Bash, Agent, NotebookEdit, WebFetch, WebSearch.
