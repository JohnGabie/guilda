---
description: Before the Architect asks for approval of a spec, it dispatches a fresh agent for a cold read and sorts each guess into answered, minor or the user's (S23).
max_turns: 25
timeout_seconds: 540
allowed_tools: [Agent, Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
The spec `docs/superpowers/specs/2026-11-10-orders.md` is written. Your procedure is at the approval step.
Do the steps that your procedure puts before you ask the user to approve the spec. The question tool is not offered in this run:
write the approval request as text at the end of your reply. Do not edit any file. Do not ask me anything else.
Your final reply has three parts in this order: one line that says who read the spec cold, the guesses with their sorts, the approval request.
