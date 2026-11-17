#!/usr/bin/env bash
# Fixture: an approval spec that uses a new term, and a glossary with one existing term.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda docs/superpowers/specs src
cat > .guilda/config.json <<'JSON'
{
  "guildaVersion": "0.2.0",
  "schemaVersion": 2,
  "process": "full",
  "explain": "full",
  "languages": { "replies": "en", "docs": "en" },
  "tiers": { "master": "opus", "journeyman": "sonnet", "apprentice": "haiku" },
  "writing": { "free": [], "exceptions": [] },
  "security": { "enabled": false, "riskAreas": [] },
  "checks": []
}
JSON
printf "export function resetLink(user, now) { return { token: 'x', sentAt: now }; }\n" > src/reset.js
cat > docs/superpowers/specs/GLOSSARY.md <<'MD'
# Glossary

## Invoice
A bill that a supplier sends to the company. Forbidden synonyms: bill, receipt.
MD
cat > docs/superpowers/specs/2026-11-10-invoices-approval.md <<'MD'
# Invoice approval spec

## Approval

@decided (the user, 2026-11-10) An invoice over 5000 euros goes through an approval chain: first the team lead, then the finance manager.
@decided (the user, 2026-11-10) An invoice at 5000 euros or less needs only the team lead.
@decided (the user, 2026-11-10) Each step of the approval chain must answer within 3 working days, or the invoice goes to the next level.

## Acceptance scenarios

MD
git add .
git commit -q -m "docs: the invoice approval spec"
