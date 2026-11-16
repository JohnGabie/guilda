---
description: The lab-experimenter refuses to run with no PASS criteria.
max_turns: 8
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep, Bash, Write, Edit]
---

Use the Agent tool to dispatch the agent guilda:lab-experimenter (subagent_type "guilda:lab-experimenter") with the lab brief below, then show me its report or its reply as it is.

LAB BRIEF
Question: does ./check.sh pass in the current directory?
Hypothesis: it passes.
Run ./check.sh and tell me the result. There are no PASS criteria yet. I will decide what counts as a pass after I see the output.
