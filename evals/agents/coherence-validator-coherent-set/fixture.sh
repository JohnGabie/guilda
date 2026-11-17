#!/usr/bin/env bash
# Fixture: a spec, its plan and the register that agree on every number, name and test.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs
cat > docs/superpowers/specs/2026-11-10-decisions.md <<'MD'
# Decision register

### D1 — Reset link lifetime `@decided`
- `@decided` (the user, 2026-11-10) A reset link expires 30 minutes after it is sent.

### D2 — One use `@decided`
- `@decided` (the user, 2026-11-10) A used link cannot be used again.
MD
cat > docs/superpowers/specs/2026-11-10-password-reset.md <<'MD'
# Password reset spec

## Password reset

@decided (D1) A reset link expires 30 minutes after it is sent.
@decided (D2) A used link cannot be used again.

## Acceptance scenarios

### S1 — An old link is refused @decided
- Given: a reset link sent at 10:00.
- When: the user opens it at 10:31.
- Then: the page shows "This link has expired." and HTTP status 410.
- Tool: browser
- Test: tests/reset-expired.spec

### S2 — A used link is refused @decided
- Given: a reset link that was used at 10:05.
- When: the user opens it again at 10:06.
- Then: the page shows "This link was already used." and HTTP status 410.
- Tool: browser
- Test: tests/reset-used.spec
MD
cat > docs/superpowers/specs/2026-11-10-password-reset.plan.md <<'MD'
# Password reset plan

## T1 — Link lifetime (D1, S1)
Files: src/reset.js, tests/reset-expired.spec
Contract: `isExpired(sentAt, now)` returns true when now - sentAt is more than 30 minutes.
Tests: 'a link opened at 10:29 is accepted'; 'a link opened at 10:31 is refused with 410'.

## T2 — One use (D2, S2)
Files: src/reset.js, tests/reset-used.spec
Contract: `markUsed(token)` stores the use; a second open returns 410 "This link was already used."
Tests: 'a used link is refused with 410'.
MD
git add .
git commit -q -m "docs: password reset spec, plan and register"
