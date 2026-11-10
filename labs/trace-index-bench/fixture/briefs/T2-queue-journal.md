ID / title: T2 — Queue journal and dispatch event
Goal: Write the append-only queue journal and the derived state file of D14, and a dispatch event that records the
  `Uses:` line of the brief (D27).
Context: Read D14 (queue files, transitions, one writer), D27 (dispatch event records `Uses:`) and D18 (one store
  in `.guilda/`, git ignores it). Tier: master, cross-cutting state.
Uses: D14@6eb3acef, D27@9354e208, D18@66d86d74
Out of scope: leases and heartbeats of workers (T5); the panel (T6).
Files it may touch: `scripts/queue.mjs`, `scripts/lib/queue.mjs`, `tests/queue.test.mjs`
Contract / interfaces: `.guilda/queue/journal.jsonl`, one JSON event for each line; only the orchestrator writes it
  (the Architect until 0.3.0). `.guilda/queue/state.json` is derived, written by temp file and rename. Event
  `dispatch` = `{ type, task, attempt, agent, uses: "<the Uses: line>" }`.
Tests that must pass: `tests/queue.test.mjs` (replay skips a partial last line; state is rebuilt from the journal);
  command `npm test`
Acceptance: after a restart, replay gives the same `state.json` (D14 recovery, CLI).
Suggested tier: master
Risk area: none
Deletion rules: none
Dependencies: none
