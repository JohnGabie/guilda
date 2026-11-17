#!/usr/bin/env bash
# Fixture for the case ci-review: a workflow with five security problems.
set -eu
mkdir -p .github/workflows
cat > .github/workflows/ci.yml <<'EOT'
name: ci
on:
  pull_request_target:
    types: [opened, synchronize]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: example-org/setup-tools@main
      - name: Show the change
        run: echo "Building PR titled ${{ github.event.pull_request.title }}"
      - name: Test
        run: npm ci && npm test
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Debug the token
        run: echo "token is $NPM_TOKEN"
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
EOT
