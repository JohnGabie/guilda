Turn budget: 15 turns (max_turns of the prompt). The eval tool does not stop at max_turns. Real turns: from the `turns` field of the result record, in each run below.
The case needs --allow-tools Edit Bash.

The prompt gives both answers but does not say what to do after the yes. The grader `asks-before-edit` (regex on the
trace) passes only if an assistant text line asks about `usage.source` (a `?`) before the Edit of `config.json`.

## Run of 2026-11-17 (`--runs 1 --allow-tools Edit Bash --ablation none`)

Score 0.67 (2 of 3 graders), 7 turns (result record), 24 s. Hand-read answer: it says that `guildaVersion` stays
`"0.1.0"` after the no, and that it added `"usage": { "source": "cswap" }` after the yes. The trace has no question
text before the Edit: the model took the answers of the prompt as given and asked nothing, so `asks-before-edit`
fails. The case is below the 0.8 threshold.

Mutant (the skill sets `usage.source` with no question): score 0.67, `asks-before-edit` fails, 8 turns. The mutant
and the real skill give the same score, so this run does not tell them apart.
