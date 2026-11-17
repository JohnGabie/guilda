#!/usr/bin/env bash
# Fixture: a project with explain brief.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda
cat > .guilda/config.json <<'JSON'
{
  "guildaVersion": "0.2.0",
  "schemaVersion": 2,
  "process": "full",
  "explain": "brief",
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
