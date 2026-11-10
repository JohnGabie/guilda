ID / title: T5 — Wave dispatch with leases
Goal: Dispatch the ready tasks of a wave with a concurrency limit, and let workers send their signals and messages.
Context: Read D9 (waves, producer/consumer table, timeouts), D14 (transitions, leases, stalled), D22 (pace of work)
  and D17 (addresses and mailboxes). Workers write their messages to one append-only JSONL mailbox file for each
  address code in `.guilda/bus/` (D17). Tier: master, concurrency.
Uses: D9@86eb1bfe, D14@6eb3acef, D22@e9403870, D17@d4f8d134
Out of scope: the journal format (T2); the panel (T6).
Files it may touch: `scripts/wave.mjs`, `scripts/lib/bus.mjs`, `tests/wave.test.mjs`
Contract / interfaces: address code `T<n>-<role>-<4 hex>`; mailbox `.guilda/bus/<code>.jsonl`; message
  `{ id, from, to, task, type, text, replyTo }`. Signals in `.guilda/queue/signals/<task>/<attempt>/`.
Tests that must pass: `tests/wave.test.mjs` (no more than the limit run at once; `stalled` never dispatches again
  by itself); command `npm test`
Acceptance: a wave of 3 ready tasks with limit 2 starts 2, then 1 (D9, CLI).
Suggested tier: master
Risk area: none
Deletion rules: none
Dependencies: T2
