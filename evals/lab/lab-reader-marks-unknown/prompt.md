---
description: The lab-reader marks what the files cannot answer as not verified.
max_turns: 10
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep]
---

Use the Agent tool to dispatch the agent guilda:lab-reader (subagent_type "guilda:lab-reader") with the lab brief below, then show me its report as it is.

LAB BRIEF
Question: what is the line coverage percent of the tests in this project?
Hypothesis: the coverage is above 80 percent.
PASS criteria (written before the run): C1: the coverage percent comes from a coverage report in the files. PASS when it is 80 or more.
Read only: the current directory. Change nothing. You have no shell, so you cannot run the tests.
