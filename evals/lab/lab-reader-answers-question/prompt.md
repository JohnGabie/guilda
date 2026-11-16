---
description: The lab-reader answers a question about a fixture project with path and line evidence.
max_turns: 10
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:lab-reader (subagent_type "guilda:lab-reader") with the lab brief below, then show me its report as it is.

LAB BRIEF
Question: what does src/math.js export, and which tests cover it?
Hypothesis: src/math.js exports one function and the tests cover it.
PASS criteria (written before the run): C1: the report names each export of src/math.js with path:line. C2: the report names the tests that cover it, or says that none do.
Read only: src/ and tests/ of the current directory. Change nothing.
