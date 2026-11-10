# guilda backlog — 0.3.0 to 0.5.0

Status: backlog. Each item points to its entry in the [decision register](2026-11-09-guilda-decisions.md). Each
release gets its own spec before its build, in the form of the [0.2.0 spec](2026-11-09-guilda-0.2.0.md).

## 0.3.0 — traceability and state

| ID | Item | Status |
|---|---|---|
| D27 | Block index with content hashes, `Uses:` lines in plans and briefs, the check script, reads by ID | `@proposed` with `@decided` items |
| D12 | Agent identity, questions after the work | `@open` |
| D13 | Audit log of the agents | `@open` |
| D14 | Agent queue in code (journal, state, signals, lock) | `@proposed` |
| D20 | Agent panel as a terminal mod (`guilda-panel`) | `@proposed` |
| D21 | Project status for any model (internal `status` script) | `@proposed` |
| D22 | The measure of tokens only | `@proposed` |
| D35 | Token use per task, per block, per build, in tokens, USD and BRL | `@decided`; the release 0.3.0 is `@proposed` |
| D32 | Name an agent, and the system finds the facts | `@proposed` |
| D24 | The mod part: the mod is the interface, the `guilda:init` progress pane, the detail command | `@proposed` |

Dependency notes:

- D20 before 0.4.0 reads the queue journal (D14). The binding table of D17 comes with 0.4.0.
- D32 needs D13, D14 and D27. Until 0.5.0 the Architect collects the facts.
- D35 needs D13 for the counts and the data skill of D25 (0.2.0) for the analysis.

Before the build: the D14 lab (failure cases), the larger trace-index lab before 1.0 (D27), and the open items of
D12 and D13.

## 0.4.0 — the Architect outside the main session

| ID | Item | Status |
|---|---|---|
| D31 | The Architect as its own agent | `@decided` |
| D17 | Agent addresses, binding table, file mailbox, router, reply contract, the internal `send` script (D24) | `@proposed` |
| D18 | Agent life cycle: no agent left running | `@proposed`, not approved for the build |
| D33 | Click a reference, open the right place | `@proposed` |
| — | Codex adapter (lab `external-agent`) | conditional GO |
| D49 | Mention an agent in the main session to talk to it directly | `@decided`; the release with D31 is `@proposed` |

Before the build: the larger D31 lab (more runs, a second scenario, a compaction), the D18 failure cases, the sender
check of D31, and E2 for address reuse. D33 has MORE DATA on its preferred link form. Glossary changes: the
`architect` line (D31) and the new `address` line.

Risk: a link (D33) can come from injected text. A link opens only a file inside the project folder.

## 0.5.0 — supervisor and pace

| ID | Item | Status |
|---|---|---|
| D15 | Supervisor (working names: foreman, orchestrator), the internal `watch` and `tick` scripts (D24) | `@open`, the name `@decided` (U4) |
| D22 | The pace, with the `cswap` fork plan | `@proposed` with `@decided` items |
| D16 | The Security Lead and the red team limits | `@replaced` in part, the rest `@proposed` |
| D37 | The Security Lead is an agent that decides | `@decided`; the release 0.5.0 is `@proposed` |
| D28 | The red team skill and its blocking hook, the Security Executor (D1) | `@decided` |
| D38 | Resume after a usage limit, only in the same project | `@decided`; the release 0.5.0 is `@proposed` |
| D47 | The guild council (Cúpula da Guilda), its Judge and its council group | `@decided`; the release "0.5.0 or later" is `@proposed` |
| D48 | User presence: away mode | `@decided`; the release with D14 and the supervisor is `@proposed` |

Before the build: the D15 lab, the D38 lab, the open level rule of D16, and the gaps of the
[scenario catalog](2026-11-09-orchestrator-scenarios.md).

Risk: the terms of use of each provider for more than one account are not verified (D22). The pace does not ship
before an answer.

## No release yet

(2026-11-10, audit, the user's words) These decisions have no release in the register.

| ID | Item | Status |
|---|---|---|
| D39 | Make the Reviewer stronger from alignment research | `@decided`; after the Lab is ready (D25, D34, D36), not before 0.2.0 |
| D50 | The main session is only the chat; the truth lives in a project memory store | `@proposed`; after D31 (0.4.0) and the stores of D13, D14, D27, D35 |

## Between releases

- E1: process levels, on the Glasshaus project, after the weekly usage reset.
- E2: persistent agent identity, before the reuse of addresses.
- Each lab with a conditional GO gets its larger run before 1.0.
