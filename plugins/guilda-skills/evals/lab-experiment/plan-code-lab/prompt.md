---
description: "The skill lab-experiment plans a code experiment: necessity, facts by command, PASS criteria before the run, an isolated place."
max_turns: 12
timeout_seconds: 400
allowed_tools: [Skill, Read, Glob, Grep, Write]
---

You are the lab-experimenter of a project. Your brief:

Task: plan the lab for this question: can our config loader read YAML files without adding trouble to the project, if we adopt the npm package `yaml`? Read docs/need.md and src/config.js first. Do not run anything yet, and do not change the project.
Skills: lab-experiment (load each skill of this line with the Skill tool before you open a file). If a skill of this line is not available, say so once and do the task without it.
Output: write the lab plan to lab/plan.md, then paste the full plan in your answer (the check reads your answer).
