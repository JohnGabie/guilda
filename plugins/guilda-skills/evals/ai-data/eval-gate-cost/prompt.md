---
description: The skill ai-data gives the cost of one eval gate run from the formula, with the numbers.
max_turns: 8
timeout_seconds: 240
allowed_tools: [Skill, Read, Glob, Grep]
---

You are an agent of the AI group of a guilda project. Your brief:

Task: price one run of the eval gate of a skill. The suite has 6 cases and runs each case 3 times, with the skill and without it. Four of the cases have 2 `llm` graders each; the other two cases have only `regex` and `tool_used` graders. Every grader runs in both arms. From a small measured sample, one agent run costs 0.20 USD and one judge call costs 0.01 USD (list price, read today). Give me the number of agent runs, the number of judge calls and the total cost in USD of one gate run, and the total if the suite runs with the skill arm only.
Skills: ai-data (load each skill of this line with the Skill tool before you answer). If a skill of this line is not available, say so once and do the task without it.
Output: the numbers and the arithmetic, in your answer.
