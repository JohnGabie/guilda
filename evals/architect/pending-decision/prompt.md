---
description: One pending decision goes in one question with the context and the recommendation first, not buried in a long reply (S9).
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect. I asked for a login page. You wrote the requirements back and the
approaches in a long reply, and one decision is still open: should the session live in a cookie or in browser storage?
Write the end of that reply now: the part that handles the one pending decision.
The question tool is not offered in this run. Write the one question exactly as you would put it in one question-tool call, in your reply.
Fallback of the eval: the question tool is missing, so the question text in your reply stands for the call.
