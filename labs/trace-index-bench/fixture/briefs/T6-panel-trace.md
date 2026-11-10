ID / title: T6 — Agent panel: trace status
Goal: The agent panel mod shows the agents from outside the conversation and a mark when a brief has a suspect link.
Context: Read D20 (panel rows, marker, label), D21 (status for any model) and D24 (the mod is the interface).
  The panel takes the place of the `status` command for the user: `status` is an internal script (D24), so the user
  sees the state only in the panel. Tier: journeyman.
Uses: D20@ad8f214b, D21@c4eb1708, D24@fe32cbd4
Out of scope: the queue journal (T2); messages (T5).
Files it may touch: `mods/guilda-panel/panel.mjs`, `tests/panel.test.mjs`
Contract / interfaces: each row has the marker `◇`, the label `guilda:<role>-<tool>` and the task title; a suspect
  link adds a `!` mark to the row of its task.
Tests that must pass: `tests/panel.test.mjs`; command `npm test`
Acceptance: a Codex run shows as one row with `◇` (D20, mod, by the user).
Suggested tier: journeyman
Risk area: none
Deletion rules: none
Dependencies: T2, T5
