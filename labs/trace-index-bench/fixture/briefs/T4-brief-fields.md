ID / title: T4 — Brief check: new fields
Goal: The ARC6 hook validates a brief file named on a `Brief file:` line and accepts the new optional fields.
Context: Read D5 (brief check, new fields), D6 (one owner task for each decided item), D10 (each dispatch states
  the reply language of `config.languages`) and D2 (the Architect confirms the agents before the first dispatch).
  Tier: journeyman, a hook with a clear contract.
Uses: D5@fe1f9c5f, D6@c0427061, D10@4906d64f, D2@809a6cbd
Out of scope: the `Uses:` field check (T3).
Files it may touch: `hooks/brief-check.mjs`, `tests/brief-check.test.mjs`
Contract / interfaces: optional fields `Decisions:`, `Mutants:`, `Conflict cases:`, `Base commit:`. A dispatch
  prompt with `Role: executor` is checked for any agent type. The dispatch prompt has a `Reply language:` line.
Tests that must pass: `tests/brief-check.test.mjs` (old briefs stay valid; a missing `Goal:` is refused); command
  `npm test`
Acceptance: an Executor dispatch with a brief file that lacks a field is refused (D5, CLI).
Suggested tier: journeyman
Risk area: none
Deletion rules: none
Dependencies: none
