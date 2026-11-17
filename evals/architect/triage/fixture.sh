#!/usr/bin/env bash
# Fixture: a light project, a spec with three items.
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

## Items

- @open Which image format loads fastest on the slow phones of our users? Nobody has measured it.
- @decided The login form of src/login.js stores the password of the user in a cookie. Task T2 adds the form.
- @decided The footer of src/footer.js prints the text "(c) 2026". Task T3 builds it.

### Scenario
- Given: the file src/footer.js exists.
- When: node src/footer.js runs.
- Then: it prints the text (c) 2026 and exits 0.
- Tool: CLI
- Test: tests/footer.test.js
MD
cat > docs/superpowers/specs/2026-11-10-site.plan.md <<'MD'
# Site plan

## Tasks

### T1 - the image format
Goal: the team knows which image format loads fastest.

### T2 - the login form
Goal: src/login.js has the login form of the spec.
Files it may touch: src/login.js

### T3 - the footer
Goal: src/footer.js prints the footer of the spec.
Files it may touch: src/footer.js
MD
git add .
git commit -q -m "docs: the spec and the plan"
