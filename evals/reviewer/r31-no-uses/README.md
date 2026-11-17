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

## Run of 2026-11-17, second (`--runs 1 --allow-tools Bash --ablation none`), command form `trace.mjs <project> check`

The grader `trace-check-project` (regex on the trace) checks that the Reviewer ran `trace.mjs <project> check`.

Score 1.00 (3 of 3 graders), 2 turns (result record), 97 s. Hand-read answer: `Result: REJECTED-SMALL`; two problems
cite R31 (no `Uses:` line in `docs/BRIEF.md`, none in plan task T1, and T2 has one, so the plan is not `LEGACY`); the
code meets the brief. The Reviewer ran `node <plugin root>/scripts/trace.mjs <project> check`: exit 2,
`io-error: ENOENT ... mkdir '.guilda/trace'`, because the sandbox folder is read-only. It then ran
`trace.mjs <project> show D1` and read the plan and the brief. No mutant run in this round: the text change is the
command form only, and the earlier mutant still applies.
