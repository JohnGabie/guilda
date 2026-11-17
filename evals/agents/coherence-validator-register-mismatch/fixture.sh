#!/usr/bin/env bash
# Fixture: a lockout spec and plan that agree with each other but not with the register (3 against 5 wrong passwords), and a plan task that cites a scenario S3 that the spec does not have.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs
cat > docs/superpowers/specs/2026-11-10-decisions.md <<'MD'
# Decision register

### D1 — Lock threshold `@decided`
- `@decided` (the user, 2026-11-10) An account is locked after 3 wrong passwords in a row.

### D2 — Unlock time `@decided`
- `@decided` (the user, 2026-11-10) A locked account unlocks itself after 15 minutes.
MD
cat > docs/superpowers/specs/2026-11-10-lockout.md <<'MD'
# Lockout spec

## Lockout

@decided (D1) An account is locked after 5 wrong passwords in a row.
@decided (D2) A locked account unlocks itself after 15 minutes.

## Acceptance scenarios

### S1 — The fifth wrong password locks the account @decided
- Given: an account with 4 wrong passwords in a row.
- When: the user sends a fifth wrong password.
- Then: the response is HTTP 423 with the text "Account locked."
- Tool: curl
- Test: tests/lockout.spec

### S2 — A locked account unlocks @decided
- Given: an account locked at 10:00.
- When: the user sends the right password at 10:16.
- Then: the response is HTTP 200.
- Tool: curl
- Test: tests/unlock.spec
MD
cat > docs/superpowers/specs/2026-11-10-lockout.plan.md <<'MD'
# Lockout plan

## T1 — Lock threshold (D1, S1)
Files: src/lockout.js, tests/lockout.spec
Contract: `isLocked(count)` returns true when count is 5 or more.
Tests: 'the fifth wrong password locks the account'.

## T2 — Unlock time (D2, S2)
Files: src/lockout.js, tests/unlock.spec
Contract: `isUnlocked(lockedAt, now)` returns true when now - lockedAt is 15 minutes or more.
Tests: 'the right password at 10:16 is accepted'.

## T3 — Lock message (S3)
Files: src/messages.js, tests/messages.spec
Contract: `lockedText()` returns "Account locked."
Tests: 'the lock message is shown'.
MD
git add .
git commit -q -m "docs: lockout spec, plan and register"
