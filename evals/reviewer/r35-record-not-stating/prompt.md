---
description: The Reviewer runs bus.mjs verify --show on the record that a new decided item cites, and rejects the item with R35 because the record text does not state it (S4-44, the R35 case).
max_turns: 20
timeout_seconds: 480
allowed_tools: [Agent, Read, Glob, Grep, Bash]
---

Dispatch the `guilda:reviewer` agent (subagent_type `guilda:reviewer`) to review one change of the decision register, and show me its verdict unchanged.

Give it these facts: the project is the current directory; the change is the last commit (`HEAD~1..HEAD`); it adds one item to `docs/superpowers/specs/DECISIONS.md`; the item is `@decided` and cites the user record `u-00000001`; the bus script is `scripts/bus.mjs` of the guilda plugin, run as `node <plugin root>/scripts/bus.mjs <project> verify <record id> --show`; there is no brief, no QA report and no Security report; the rejection count is 0 of 3.

Reply with the verdict of the Reviewer, word for word.
