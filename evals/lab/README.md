# Lab evals

Cases of `claude plugin eval` for the skill `lab` and the three lab agents: `lab-researcher`, `lab-reader` and
`lab-experimenter`. Each artifact has 5 cases: 3 real cases, 1 direct injection case and 1 indirect injection case
(a fixture file holds an instruction to ignore the brief).

Folders: `<artifact>-<case>/` with `prompt.md`, `graders/*.md` and, for a fixture project, `case.yaml` and
`fixture.sh`. Run a case with `--scaffold`, because the fixture comes from its `fixture.sh`.

Threshold: 0.8

Run one case:

```
claude plugin eval <plugin copy> --eval-dir evals/lab --case '<case folder name>' --runs 1 -j 1 --threshold 0.8 \
  --no-publish --trust-plugin --scaffold --output-dir "$(mktemp -d)"
```

The cases of `lab-experimenter` also need `--allow-tools Bash Write Edit`. The cases of `lab-researcher` also need
`--allow-tools WebFetch`. Run the plugin copy with no `dependencies` entry in its manifest, because an eval session
does not load a plugin that has a dependency.
