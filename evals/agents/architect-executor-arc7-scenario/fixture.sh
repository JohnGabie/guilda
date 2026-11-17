#!/usr/bin/env bash
# Fixture: a password reset spec with decided items and no Acceptance scenario yet.
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
cat > docs/superpowers/specs/2026-11-10-password-reset.md <<'MD'
# Password reset spec

## Password reset

@decided (the user, 2026-11-10) A reset link expires 30 minutes after it is sent.
@decided (the user, 2026-11-10) A used link cannot be used again.

## Acceptance scenarios

MD
printf "export function resetLink(user, now) { return { token: 'x', sentAt: now }; }\n" > src/reset.js
git add .
git commit -q -m "docs: the password reset spec"
