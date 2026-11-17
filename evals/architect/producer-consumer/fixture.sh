#!/usr/bin/env bash
# Fixture: a spec with two tasks that share one interface (a token store).
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
cat > docs/superpowers/specs/2026-11-10-notes.md <<'MD'
# Notes spec

## Token store

@decided Module src/tokens.js exports saveToken(name, value) and readToken(name). It keeps tokens in memory.

## Notes sync

@decided Module src/sync.js calls readToken(name) of src/tokens.js to sign each request.

### Scenario: the sync signs a request
- Given: the token "main" is saved with the value abc.
- When: sync.signRequest("main") runs.
- Then: it returns the text "Bearer abc".
- Tool: CLI
- Test: tests/sync.test.js
MD
git add .
git commit -q -m "docs: the notes spec"
