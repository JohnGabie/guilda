Turn budget: 15 turns (max_turns of the prompt). The eval tool does not stop at max_turns. Real turns: from the `turns` field of the result record, in each run below.
The case needs --allow-tools Edit Bash.

## Run of 2026-11-17 (`--runs 1 --allow-tools Edit Bash --ablation none`)

Score 1.00 (3 of 3 graders), 5 turns (result record), 17 s. Hand-read answer: it lists both questions in plain text,
"Save the new guilda version in .guilda/config.json?" and "Set usage.source to "cswap" in .guilda/config.json? ...",
with the answer no to each, and says that `.guilda/config.json` is unchanged. No Edit and no Bash call.

Mutant (the skill sets `usage.source` with no question): score 1.00, 5 turns. The model still listed the question
and followed the no of the prompt, so the mutant survives this case.
