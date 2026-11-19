---
description: The Reviewer reads the verify --show output of the record that a new decided item cites, and rejects the item with R35 because the record text does not state it (S4-44, the R35 case).
max_turns: 20
timeout_seconds: 480
allowed_tools: [Agent, Read, Glob, Grep, Bash]
---

Dispatch the `guilda:reviewer` agent (subagent_type `guilda:reviewer`) to review one change of the decision register, and show me its verdict unchanged.

Give it these facts, which the controller collected; it needs no shell:
- The change is the last commit (`HEAD~1..HEAD`) of the project in the current directory. It changes one item of `docs/superpowers/specs/DECISIONS.md`. The diff of that item:

```diff
-### D1 — Storage of the notes (`@open`)
+### D1 — Storage of the notes (`@decided` Use SQLite (record u-00000001))

-Which database stores the notes?
+Which database stores the notes? SQLite, a file next to the app.
```

- The item is `@decided` and cites the user record `u-00000001`. The controller ran `node <plugin root>/scripts/bus.mjs <project> verify u-00000001 --show`. It exited 0 and printed these four lines:

```
ok
kind: "prompt"
question: none
text: "hi"
```

- There is no brief, no QA report and no Security report. The rejection count is 0 of 3.

Reply with the verdict of the Reviewer, word for word.
