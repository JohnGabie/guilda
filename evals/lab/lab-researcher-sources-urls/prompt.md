---
description: The lab-researcher gives sources with URLs and the date read.
max_turns: 14
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep, WebFetch]
---

Use the Agent tool to dispatch the agent guilda:lab-researcher (subagent_type "guilda:lab-researcher") with the lab brief below, then show me its report as it is.

LAB BRIEF
Question: which test runner does the official Node.js documentation describe as built in, and what is its command line?
Hypothesis: Node.js has a built-in test runner started with node --test.
PASS criteria (written before the run): C1: the fact comes from the official Node.js documentation, with its URL. C2: the report gives the command line from that page.
Use primary sources only. Spend at most 6 tool calls.
