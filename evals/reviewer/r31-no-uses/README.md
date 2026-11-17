# Case notes

Scenario: S8 of the guilda 0.3.0 spec (the Reviewer gate for R31, D27).

Turn budget, written before the first scored run: 6 turns in the main session (one dispatch of the Reviewer and the
reply), 30 at most (`max_turns`). The eval tool does not stop at `max_turns`, so each run report gives the real turns.

The working folder is read-only for Bash in the eval sandbox, so `trace.mjs check` can fail when it writes
`.guilda/trace/index.json`. The run report records what the Reviewer did then.

## Run of 2026-11-17 (`--runs 1 --allow-tools Bash --ablation none`)

Score 1.00, 2 turns, 63 s. Hand-read answer: `Result: REJECTED-SMALL`; two problems cite R31 (no `Uses:` line in plan
task T1, none in `docs/BRIEF.md`); the code and the tests have no defect. `trace.mjs check` printed
`refused: guilda is not set up` in the sandbox, so the Reviewer found the missing line by reading the plan and the
brief. Mutant (the checklist line removed): score 0.50, `Result: APPROVED`, so the case kills it.
