Turn budget: 15 turns (max_turns of the prompt). The eval tool does not stop at max_turns. Real turns: from the `turns` field of the result record, in each run below.
The case needs --allow-tools Edit Bash.

The order 'ask, then write' is checked by tests/update-text.test.mjs and by G6 (live); an eval with pre-supplied answers cannot show it.

The prompt gives both answers but does not say what to do after the yes. The graders check the Edit of
`config.json` with `cswap` (trace) and that the answer names the change (llm).

## Run of 2026-11-17 (`--runs 1 --allow-tools Edit Bash --ablation none`)

Score 1.00 (2 of 2 graders), 6 turns (result record), 17 s. Hand-read answer: it lists both questions with the
answers of the prompt, says that `guildaVersion` stays `"0.1.0"` after the no, and that `usage.source` is `"cswap"`
in `.guilda/config.json` after the yes. One Edit of `config.json`.

Order mutant (the skill sets `usage.source` with no question): not killed by this case. With a temporary order
grader (regex on the trace, question before the Edit) the real skill and the mutant both scored 0.67, because the
model took the answers of the prompt as given and asked nothing first; that grader was removed for this reason.
