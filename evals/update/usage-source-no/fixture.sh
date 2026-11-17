#!/usr/bin/env bash
# Fixture: a project with a guilda config in the 0.2.0 form (schemaVersion 2, no usage key), guildaVersion behind the plugin.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda
cat > .guilda/config.json <<'JSON'
{
  "guildaVersion": "0.1.0",
  "schemaVersion": 2,
  "languages": { "replies": "en", "docs": "en" },
  "process": "light",
  "explain": "brief",
  "writing": { "free": [], "exceptions": [] },
  "security": { "enabled": false, "riskAreas": [] },
  "checks": [],
  "scan": { "ignore": [] },
  "tiers": { "master": "opus", "journeyman": "sonnet", "apprentice": "haiku" }
}
JSON
git add -A
git commit -q -m "fixture"
