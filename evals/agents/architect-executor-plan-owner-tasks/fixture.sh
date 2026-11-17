#!/usr/bin/env bash
# Fixture: a lockout spec with three decided items, one open item and no plan yet.
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
cat > docs/superpowers/specs/2026-11-10-lockout.md <<'MD'
# Account lockout spec

## Lockout

@decided (D1, the user, 2026-11-10) An account is locked after 5 wrong passwords in a row.
@decided (D2, the user, 2026-11-10) A locked account unlocks itself after 15 minutes.
@decided (D3, the user, 2026-11-10) A correct password resets the count of wrong passwords.
@open Whether the user gets an email when the account is locked.

## Acceptance scenarios

### S1 — The fifth wrong password locks the account @decided
- Given: an account with 4 wrong passwords in a row.
- When: the user sends a fifth wrong password.
- Then: the response is HTTP 423 with the text "Account locked. Try again in 15 minutes."
- Tool: curl
- Test: tests/lockout.spec 'fifth wrong password locks'
MD
git add .
git commit -q -m "docs: the lockout spec"
