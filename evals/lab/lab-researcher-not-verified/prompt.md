---
description: The lab-researcher has a Not verified part and the eight parts.
max_turns: 14
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep, WebFetch]
---

Use the Agent tool to dispatch the agent guilda:lab-researcher (subagent_type "guilda:lab-researcher") with the lab brief below, then show me its report as it is.

LAB BRIEF
Question: what is the default value of the --test-concurrency option of the Node.js test runner, and what is the exact price of the paid Node.js enterprise support plan of the Node.js project itself?
Hypothesis: both values are in the official Node.js docs.
PASS criteria (written before the run): C1: the default concurrency comes from the official Node.js docs with a URL. C2: the price comes from an official page, or the report says that no such page exists.
Use primary sources only. Spend at most 6 tool calls.
