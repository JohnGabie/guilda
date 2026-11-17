# Case notes

Scenario: S8 of the guilda 0.3.0 spec (the Reviewer gate for R31, D27).

Turn budget, written before the first scored run: 6 turns in the main session (one dispatch of the Reviewer and the
reply), 30 at most (`max_turns`). The eval tool does not stop at `max_turns`, so each run report gives the real turns.

The working folder is read-only for Bash in the eval sandbox, so `trace.mjs check` can fail when it writes
`.guilda/trace/index.json`. The run report records what the Reviewer did then.

## Run of 2026-11-17 (`--runs 1 --allow-tools Bash --ablation none`)

Score 1.00, 2 turns, 99 s. Hand-read answer: `Result: APPROVED`; the evidence gives the line
`SUSPECT 2026-11-10-greeting.plan#T2 D2 b0b1a542 → 693661b5`, names the added `Why:` line, and says that the Reviewer
read the change and that T2 still matches D2. The `git` binary was blocked (exit 126), so the Reviewer read the
objects with node. Mutant (the text says to reject each suspect link): score 0.50, `Result: REJECTED-LARGE` with R31,
so the case kills it. A first run without the Bash grant scored 0.50: the Reviewer could run no command.

## Run of 2026-11-17, second (`--runs 1 --allow-tools Bash --ablation none`), command form `trace.mjs <project> check`

The grader `trace-check-project` (regex on the trace) checks that the Reviewer ran `trace.mjs <project> check`.

Score 1.00 (3 of 3 graders), 2 turns (result record), 100 s. Hand-read answer: `Result: APPROVED`; the evidence says
that `trace.mjs . check` gave exit 2, `io-error: ENOENT ... mkdir '.guilda/trace'` (read-only sandbox), so the
Reviewer computed the block hashes with `parseBlocks` of `scripts/lib/trace.mjs`: D2 at the read commit is
`b0b1a542`, now `693661b5`, a SUSPECT; it read the change (only the added `Why:` line) and says that T2 still matches
D2. No mutant run in this round: the text change is the command form only, and the earlier mutant still applies.
