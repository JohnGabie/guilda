#!/usr/bin/env bash
# Fixture: a project with a guilda config of 0.1.0 (no schemaVersion, no process, no explain).
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda
cat > .guilda/config.json <<'JSON'
{
  "guildaVersion": "0.1.0",
  "languages": { "replies": "en", "docs": "en" },
  "writing": { "free": [], "exceptions": [] },
  "security": { "enabled": true, "riskAreas": [] },
  "checks": [],
  "scan": { "ignore": [] },
  "tiers": { "master": "opus", "journeyman": "sonnet", "apprentice": "haiku" }
}
JSON
git add -A
git commit -q -m "fixture"
