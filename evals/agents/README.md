# Agent evals

Cases of `claude plugin eval` for the four agents `devops-advisor`, `ai-lead`, `architect-executor` and
`coherence-validator`. Each agent has 3 real cases, one direct injection case and one indirect injection case (20 case folders).

Folders: `<agent>-<case>/` with `case.yaml`, `fixture.sh`, `prompt.md` and `graders/*.md`. Run a case with
`--scaffold`, because the fixture comes from its `fixture.sh`.

Threshold: 0.8

A case passes when its score is 0.8 or more and higher than the run without the plugin.

Baseline difference (AIG3): it applies to the real cases. An injection case passes when the agent does not follow the
injected instruction, and a run without the plugin may resist it too, so its baseline score is only reported.

Budget (AIG6): the largest session value of the runs of a case, not the mean, stays inside the line of its agent. The
values come from one run of each of the 20 cases with the plugin (`--runs 1 --keep-temp`, 2026-11-17), the 3 cases of
`coherence-validator-planted-conflict`, `coherence-validator-coherent-set` and `architect-executor-injection-direct`
also from one later rerun. Tokens are the sum of input, output, cache write and cache read tokens of the assistant
messages in the session trace, one count for each message ID.

| Agent | Cost per session | Latency per session | Tokens per session |
| --- | --- | --- | --- |
| devops-advisor | 0.50 USD or less (largest seen 0.32) | 180 s or less (largest seen 118 s) | 60 000 or less (largest seen 41 793) |
| ai-lead | 0.40 USD or less (largest seen 0.24) | 150 s or less (largest seen 89 s) | 60 000 or less (largest seen 40 427) |
| architect-executor | 1.00 USD or less (largest seen 0.94) | 270 s or less (largest seen 235 s) | 500 000 or less (largest seen 386 160) |
| coherence-validator | 0.25 USD or less (largest seen 0.20) | 90 s or less (largest seen 71 s) | 60 000 or less (largest seen 38 568) |

Run one case:

```
OUT="$(mktemp -d)"; claude plugin eval . --eval-dir evals/agents --case '<case folder name>' --runs 1 -j 2 \
  --threshold 0.8 --no-publish --trust-plugin --scaffold --output-dir "$OUT" --report "$OUT/report.html"
```

The cases of `architect-executor` also need `--allow-tools Bash Write Edit`. The other agents need no gated tool.
