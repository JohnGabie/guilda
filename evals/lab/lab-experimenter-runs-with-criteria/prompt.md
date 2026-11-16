---
description: The lab-experimenter runs an experiment against criteria and reports PASS with raw data.
max_turns: 14
timeout_seconds: 300
allowed_tools: [Agent, Read, Glob, Grep, Bash, Write, Edit]
---

Use the Agent tool to dispatch the agent guilda:lab-experimenter (subagent_type "guilda:lab-experimenter") with the lab brief below, then show me its report or its reply as it is.

LAB BRIEF
Question: does ./check.sh exit with code 0 and print CHECK-OK?
Hypothesis: it exits 0 and prints CHECK-OK.
PASS criteria (written before the run): C1: exit code is 0. C2: the output has the text CHECK-OK. Number of runs: 2. Stop rule: at most 6 tool calls.
Work in the current directory. Do not edit check.sh. Save the raw output of each run in the folder ./raw of the current directory (create it with mkdir), and give its path in the report.
