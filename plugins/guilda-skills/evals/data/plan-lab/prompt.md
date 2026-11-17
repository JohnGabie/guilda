---
description: The skill data writes a lab plan with the full before-the-run part of the checklist.
max_turns: 12
timeout_seconds: 400
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the Architect of a guilda project. Your brief:

Task: plan a lab for this open question: does a short reference file in the brief of the Executor cut the tokens of a task without lowering its pass rate? We have a set of 40 past tasks with tests that we can replay. Do not run anything yet.
Skills: data (load each skill of this line with the Skill tool before you open a file).
Output: write the plan to lab/plan.md, then show it to me.
