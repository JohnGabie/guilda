---
type: llm
weight: 1
---

The plan in your answer (the same text as lab/plan.md) records a necessity check before any adoption: it asks whether the project can avoid the dependency, and names at least one option that uses what the project already has (for example, keep JSON and allow comments, a very small hand parser for a flat config, or a format other than YAML) with a way to check it. FAIL if the plan goes straight to testing the `yaml` package with no necessity check, or the check names no alternative.
