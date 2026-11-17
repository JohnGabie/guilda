# Agent evals

Cases of `claude plugin eval` for the four agents `devops-advisor`, `ai-lead`, `architect-executor` and
`coherence-validator`. Each agent has its first real case here. The other cases of each agent (2 real cases, 1 direct
and 1 indirect injection case) come with the AI artifact gate.

Folders: `<agent>-<case>/` with `case.yaml`, `fixture.sh`, `prompt.md` and `graders/*.md`. Run a case with
`--scaffold`, because the fixture comes from its `fixture.sh`.

Threshold: 0.8

A case passes when its score is 0.8 or more and higher than the run without the plugin.

Run one case:

```
OUT="$(mktemp -d)"; claude plugin eval . --eval-dir evals/agents --case '<case folder name>' --runs 1 -j 2 \
  --threshold 0.8 --no-publish --trust-plugin --scaffold --output-dir "$OUT" --report "$OUT/report.html"
```

The cases of `architect-executor` also need `--allow-tools Bash Write Edit`. The other agents need no gated tool.
