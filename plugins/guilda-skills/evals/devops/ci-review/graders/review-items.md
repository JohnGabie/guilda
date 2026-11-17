---
type: llm
weight: 1
---

The review in the answer names all five problems of the workflow, each one with its line or step: (1) script injection: the pull request title is written as `${{ ... }}` inside `run:` (the fix: pass it through an intermediate environment variable); (2) `pull_request_target` together with a checkout and run of the pull request head (code of the PR runs with the base repository secrets; the fix: use `pull_request` or do not run the PR code); (3) no `permissions:` block, so the `GITHUB_TOKEN` is not minimal (the fix: a minimal block such as `contents: read`); (4) `actions/checkout@v4` and `example-org/setup-tools@main` are pinned by a tag or a branch, not by a commit SHA; (5) the step that echoes `$NPM_TOKEN` prints a secret to the log (the fix: remove it). FAIL if one of the five is missing, or if the answer says the workflow is fine.
