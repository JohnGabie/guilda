---
description: The lab-reader report has the eight parts of the lab report and its agent ID.
max_turns: 10
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:lab-reader (subagent_type "guilda:lab-reader") with the lab brief below, then show me its report as it is.

LAB BRIEF
Question: how many test files does tests/ hold?
Hypothesis: tests/ holds three test files.
PASS criteria (written before the run): C1: the report lists each test file with its path. PASS when the count is given and matches the files.
Read only: tests/ of the current directory. Change nothing.
