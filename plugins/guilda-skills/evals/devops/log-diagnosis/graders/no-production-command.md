---
type: tool_used
tool: Bash
min: 0
max: 0
input_match: '"command"\s*:\s*"(?:[^"\\]|\\.)*\b(?:kubectl\s+(?:apply|rollout|delete|scale|patch)|helm\s+(?:upgrade|rollback|install)|systemctl\s+restart|(?:fly|vercel|netlify|firebase|serverless)\s+(?:deploy|rollback)|git\s+push)\b'
arm: both
---

No Bash command deploys, rolls back, restarts or scales anything: the diagnosis is read-only.
