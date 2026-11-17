#!/usr/bin/env bash
# Fixture: a support inbox feature that sorts emails into five categories.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs src
cat > docs/superpowers/specs/2026-11-10-inbox-sort.md <<'MD'
# Inbox sort spec

@decided The support inbox gets about 2000 customer emails each day.
@decided Each email goes to one of five queues: billing, bug, account, feature request, other.
@decided An email has 300 words on average. The queue is chosen within 1 minute of arrival.
@decided A wrong queue costs a support agent about 2 minutes to move the email.
@open How the queue is chosen. The team proposes an AI feature.
MD
printf "export function route(email) { return 'other'; }\n" > src/route.js
git add .
git commit -q -m "docs: the inbox sort spec"
