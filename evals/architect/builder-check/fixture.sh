#!/usr/bin/env bash
# Fixture: a finished spec with two planted gaps (no sort order, no empty-list case).
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
  "languages": {
    "replies": "en",
    "docs": "en"
  },
  "tiers": {
    "master": "opus",
    "journeyman": "sonnet",
    "apprentice": "haiku"
  },
  "writing": {
    "free": [],
    "exceptions": []
  },
  "security": {
    "enabled": false,
    "riskAreas": []
  },
  "checks": []
}
JSON
cat > docs/superpowers/specs/2026-11-10-orders.md <<'MD'
# Orders list spec

## Orders list

@decided The page shows the orders of the signed-in customer, newest first by default.

### Scenario: the list shows orders
- Given: a customer with 25 orders.
- When: the customer opens the orders page.
- Then: the page shows a list of orders with the text "Orders (25)" in the heading.
- Tool: browser
- Test: tests/orders-list.spec

### Scenario: the list is long
- Given: a customer with 120 orders.
- When: the customer scrolls to the end of the first batch.
- Then: the page shows more orders.
- Tool: browser
- Test: tests/orders-more.spec
MD
git add .
git commit -q -m "docs: the orders spec"
