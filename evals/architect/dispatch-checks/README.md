# Case notes

Scenario: S32 of the guilda 0.3.0 spec (the Architect runs the checks before a dispatch, D27, D14).

Turn budget, written before the first scored run: 20 turns in the main session (the skill, the reads of the config,
the plan and the brief, `doctor.mjs`, `trace.mjs check`, `queue.mjs sync`, the read of the change, `queue.mjs dispatch`,
one Agent call and the reply), 40 at most (`max_turns`). The eval tool does not stop at `max_turns`, so each run report
gives the real turns, from `node scripts/check-turn-budget.mjs dispatch-checks=20 <trace>`.

The working folder and `TMPDIR` are read-only for Bash in the eval sandbox, so `trace.mjs check` and each `queue.mjs`
command exit 2 with an `io-error`. The graders read the calls in the trace, not their output. The prompt says to go on
after a write error and gives the address of a T1 run, because `queue.mjs dispatch` cannot write it.

The order graders are regexes on the trace: a `"command"` field with the script call, then a later `"name":"Agent"`
tool use. The skill text in a tool result has no `"command"` field, so it does not match.

## Run of 2026-11-17 (`--runs 1 --scaffold --allow-tools Bash`, ablation with-without)

With the skill: score 0.80 (4 of 5), 10 turns (result record; budget 20, ok), 69 s. Hand-read answer: it loaded the
skill, read the config, the plan, the brief and the queue (T1 `ready`, T2 `pending`), ran `doctor.mjs`, read D1 with
`trace.mjs show D1`, then ran `trace.mjs check` and `queue.mjs sync` (both exit 2, read-only folder) before one Agent
call of `guilda:executor` for T1 with the line `Address: T1-exe-0a1b`. It did not run `queue.mjs dispatch`, because
`sync` could not take the lock. No T2 dispatch. The R32 hook refused two of its Bash calls first (no `--session`, then
a wrong one); the third call used the ID of the context line. `read-change` failed: the check output never came, so the
reply names no `Why:` line.

Without the skill: score 0.40 (2 of 5), 5 turns, 45 s. Hand-read answer: no skill; it read the queue and the files,
tried its own hash in node, ran no `trace.mjs check` and no `queue.mjs sync`, and dispatched a `general-purpose` agent
for T1. It says that the last commit added a Why line to D1, but that it could not confirm the pin; the judge failed it.

No mutant run in this round (the sync step after the dispatch): the order graders are regexes on the trace, and the
without arm shows that a trace with no `sync` call before the Agent call fails them.
