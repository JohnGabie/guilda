---
type: regex
target: { source: file, path: .github/workflows/ci.yml }
pattern: 'pull_request_target|setup-tools@main|echo "token is \$NPM_TOKEN"'
flags: m
match: "count:3"
weight: 1
---

After the run, the workflow still holds its three marker lines: the file was not fixed in place.
