#!/usr/bin/env bash
# Fixture: a plan with two tasks, a reviewed commit and a fix commit of a known size.
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
cat > docs/superpowers/specs/2026-11-10-tools.plan.md <<'MD'
# Tools plan

## Tasks

### T1 - the text tools
Goal: src/text.js has the text helpers.
Files it may touch: src/text.js, src/shared.js
Risk area: none

### T2 - the date tools
Goal: src/dates.js has the date helpers.
Files it may touch: src/dates.js, src/shared.js
Risk area: none
MD
for f in src/text.js src/shared.js src/dates.js; do
  for i in $(seq 1 100); do echo "const line$i = $i;"; done > "$f"
done
git add .
git commit -q -m "feat: T1 first version"
for i in $(seq 1 15); do sed -i "${i}s/.*/const fixed$i = $i;/" src/shared.js; done
git add .
git commit -q -m "fix: T1 review findings"
