#!/usr/bin/env bash
# Fixture: a light project, a spec block (zone-marked) and one finished task.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda docs/superpowers/specs src
cat > .guilda/config.json <<'JSON'
{
  "guildaVersion": "0.2.0",
  "schemaVersion": 2,
  "process": "light",
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
    "enabled": true,
    "riskAreas": ["login", "secrets", "user data"]
  },
  "checks": []
}
JSON
cat > docs/superpowers/specs/2026-11-10-site.md <<'MD'
# Site spec

## Login page
Security zone: login

@decided The block is built by task T1.

### Scenario
- Given: the file src/block.js exists.
- When: node src/block.js runs.
- Then: it prints the text ok and exits 0.
- Tool: CLI
- Test: tests/block.test.js
MD
cat > docs/superpowers/specs/2026-11-10-site.plan.md <<'MD'
# Site plan

## Tasks

### T1 - the block
Goal: src/block.js builds the block of the spec.
Files it may touch: src/block.js
Risk area: login
MD
echo 'console.log("ok");' > src/block.js
git add .
git commit -q -m "feat: T1 the block"
