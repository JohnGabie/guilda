#!/usr/bin/env bash
# Fixture: a weekly summary of one sales table with a fixed layout.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs src
cat > docs/superpowers/specs/2026-11-10-weekly-summary.md <<'MD'
# Weekly summary spec

@decided Each Monday, a 200-word summary of last week's sales for the manager. The data is one table of at most 400 rows, already loaded by src/sales.js.
@decided The summary has three parts: total, best product, biggest drop. A person reads it, nobody acts on it automatically.
@decided One summary a week. It must be ready by 07:00.
@open How the summary is written. The team proposes an AI agent with tools.
MD
printf "export function loadSales() { return []; }\n" > src/sales.js
git add .
git commit -q -m "docs: the weekly summary spec"
