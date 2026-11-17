#!/usr/bin/env bash
# Fixture: a pt-BR project and a commit to review.
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
    "replies": "pt-BR",
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
echo "const a = 1;" > src/a.js
git add .
git commit -q -m "feat: T1 first version"
