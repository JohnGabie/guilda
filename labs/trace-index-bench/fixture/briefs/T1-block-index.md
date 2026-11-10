ID / title: T1 — Block index builder
Goal: Write a script that builds `.guilda/trace/index.json` from the `### D<n> — ` headers of the specs, and an
  internal `show <ID>` command that prints one block by its line range.
Context: Read `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md` D27 (design) and D24 (internal commands).
  The commands `show`, `watch`, `tick`, `send` and `status` are internal scripts (D24); agents run them and the
  user never types them, so this task writes no user help for them. Tier: journeyman, logic with a clear contract.
Uses: D27@9354e208, D24@fe32cbd4, D11@32e078f1
Out of scope: the Reviewer gate (T3), the panel (T6), the formatter ignore entry (D11 is done by `guilda:init`).
Files it may touch: `scripts/trace-index.mjs`, `scripts/lib/trace.mjs`, `tests/trace-index.test.mjs`
Contract / interfaces: `index.json` = `{ blocks: { <ID>: { hash, file, start, end, title, citedBy[] } } }`.
  Hash = SHA-256 of the title without the status tag plus the body, white space collapsed, first 8 hex characters.
  `node scripts/trace-index.mjs show <ID>` prints only lines `start..end` of the block.
Tests that must pass: `tests/trace-index.test.mjs` (status change gives no new hash; one comma gives a new hash;
  white space gives no new hash); command `npm test`
Acceptance: index of the 0.2 spec in under 1 s (D27); `show D14` prints only D14 (CLI).
Suggested tier: journeyman
Risk area: none
Deletion rules: none
Dependencies: none
