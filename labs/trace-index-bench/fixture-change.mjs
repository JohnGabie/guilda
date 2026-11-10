// Applies the fixed lab changes to the spec copy and to brief T2. Run from the fixture root. Lab setup helper.
import fs from 'node:fs';
const S = 'docs/superpowers/specs/2026-11-09-guilda-0.2-design.md';
let t = fs.readFileSync(S, 'utf8');
const rep = (a, b) => { if (!t.includes(a)) throw new Error('missing: ' + a); t = t.replace(a, b); };
// 1. text change, D24 (cited by briefs T1, T6)
rep("- `@proposed` `watch`, `tick`, `send` and `status` are internal scripts. Agents and the orchestrator run them. The\n  user does not need to type them.",
    "- `@proposed` `watch`, `tick` and `send` are internal scripts. Agents and the orchestrator run them. The\n  user does not need to type them. `status` stays a user command (D21): the user types it to see the state.");
// 2. text change, D10 (cited by briefs T3, T4)
rep("If the model of a tier is not available, use one tier lower.", "If the model of a tier is not available, use one tier higher.");
// 3. text change, D17 (cited by brief T5)
rep("**Mailbox.** One append-only JSONL file for each code in `.guilda/bus/`.", "**Mailbox.** One SQLite table in `.guilda/bus.db` for all codes.");
// 4, 5. status-only changes, D14 and D20
rep("### D14 — Agent queue in code `@proposed`", "### D14 — Agent queue in code `@decided`");
rep("### D20 — Agent panel as a terminal mod `@proposed`", "### D20 — Agent panel as a terminal mod `@decided`");
// 6. white-space change, D9 (line wrap moved, double space)
rep("- `@proposed` The plan has a producer/consumer table. Each interaction between tasks is one row. Each row names\n  the task that writes the join test (#8).",
    "- `@proposed` The plan has a producer/consumer table.  Each interaction between tasks is one row.\n  Each row names the task that writes the join test (#8).");
// 7. text change in an uncited block, D13
rep("It deletes it after `cleanupPeriodDays`, 30 days by\n  default.", "It deletes it after `cleanupPeriodDays`, 14 days by\n  default.");
fs.writeFileSync(S, t);
// 8. unknown ID in brief T2
const B = 'docs/superpowers/briefs/T2-queue-journal.md';
let b = fs.readFileSync(B, 'utf8');
b = b.replace(/^(Uses: .*)$/m, '$1, D99@1a2b3c4d');
fs.writeFileSync(B, b);
