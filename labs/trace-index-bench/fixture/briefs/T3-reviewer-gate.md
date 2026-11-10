ID / title: T3 — Reviewer gate for suspect links
Goal: The Reviewer runs the trace check. A brief with a suspect link that nobody acknowledged gets a rejection.
Context: Read D8 (Reviewer checklist and tiers), D27 (check, suspect link, acknowledge), D5 (brief fields) and D10
  (role fixes). If the master model is not available for the Reviewer, use the ARC4 fallback of D10: one tier
  lower, and tell the user. Tier: master, the Reviewer gate is cross-cutting.
Uses: D8@347ba44b, D27@9354e208, D5@fe1f9c5f, D10@4906d64f
Out of scope: the index builder (T1); new brief fields (T4).
Files it may touch: `agents/reviewer.md`, `scripts/trace-check.mjs`, `tests/trace-check.test.mjs`
Contract / interfaces: `node scripts/trace-check.mjs` prints `SUSPECT`, `UNKNOWN` and `NO-OWNER` lines; exit 1 on a
  suspect or an unknown ID. The verdict cites the suspect `ID@hash` and shows the block then and now.
Tests that must pass: `tests/trace-check.test.mjs` (5 suspects found; unknown ID is an error; empty after
  acknowledge); command `npm test`
Acceptance: a brief with an unacknowledged suspect link gets `REJECTED-SMALL` (D27, CLI).
Suggested tier: master
Risk area: none
Deletion rules: none
Dependencies: T1, T4
