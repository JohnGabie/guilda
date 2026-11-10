# guilda backlog — 0.3.0 to 0.5.0

Status: backlog. Each item points to its entry in the [decision register](2026-11-09-guilda-decisions.md). Each
release gets its own spec before its build, in the form of the [0.2.0 spec](2026-11-09-guilda-0.2.0.md).

Labs are part of the development process (register, release plan). Each release spec lists the labs that gate its
parts. The plan runs each lab as a task, in a dispatched agent (R26), before the task that builds the part that it
gates. A lab with NO-GO or MORE DATA stops that part, and the part goes to the user.

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
| D35 | Token use per task, per block, per build, in tokens, USD and BRL | `@decided` |
| D32 | Name an agent, and the system finds the facts | `@proposed` |
| D24 | The mod part: the mod is the interface, the `guilda:init` progress pane, the detail command | `@proposed` |

Dependency notes:

- D20 before 0.4.0 reads the queue journal (D14). The binding table of D17 comes with 0.4.0.
- D32 needs D13, D14 and D27. Until 0.5.0 the Architect collects the facts.
- D35 needs D13 for the counts and the data skill of D25 (0.2.0) for the analysis.

Labs that gate parts of 0.3.0:

| Lab | Gates |
|---|---|
| D14 queue (failure cases: a writer dies in an append, a worker dies with no signal, a late `done`, two writers, heartbeats from Codex and subagents, an atomic `rename`) | the queue journal, state and signals |
| D20 panel (not verified in `lab/agent-panel`: the hide after `done`, hover and click, the label on a tool row) | the agent panel mod |

Before the build also: the open items of D12 and D13. The larger trace-index lab (D27) runs before 1.0.

## 0.4.0 — the Architect outside the main session

| ID | Item | Status |
|---|---|---|
| D31 | The Architect as its own agent | `@decided` |
| D17 | Agent addresses, binding table, file mailbox, router, reply contract, the internal `send` script (D24) | `@proposed` |
| D18 | Agent life cycle: no agent left running | `@proposed`, not approved for the build |
| D33 | Click a reference, open the right place | `@proposed` |
| — | Codex adapter (lab `external-agent`) | conditional GO |
| D49 | Mention an agent in the main session to talk to it directly | `@decided`; the release with D31 is `@proposed` |

Labs that gate parts of 0.4.0:

| Lab | Gates |
|---|---|
| D31 larger lab (more runs, a second scenario, a run long enough to compact) and the sender check | the Architect as its own agent |
| D18 failure cases (two messages at the same time, a timeout, a failed child, Codex as the sender, an interactive session, SIGKILL) | the agent life cycle and the bus |
| D33 links (MORE DATA: a click on D14 opens the right line in 3 of 3 tries) | the preferred link form |
| D49 mention routing (can a mod route a prompt to a named agent) | the mention of an agent |

E2 runs before address reuse. Glossary changes: the `architect` line (D31) and the new `address` line.

Risk: a link (D33) can come from injected text. A link opens only a file inside the project folder.

## 0.5.0 — supervisor and pace

| ID | Item | Status |
|---|---|---|
| D15 | Supervisor (working names: foreman, orchestrator), the internal `watch` and `tick` scripts (D24) | `@open`, the name `@decided` (U4) |
| D22 | The pace, with the `cswap` fork plan | `@proposed` with `@decided` items |
| D16 | The Security Lead and the red team limits | `@replaced` in part, the rest `@proposed` |
| D37 | The Security Lead is an agent that decides | `@decided` |
| D28 | The `red-team` and `blue-team` skills, the blocking hook, the Security Executor (a separate agent definition with restricted tools, D1, D43) | `@decided` |
| D38 | Resume after a usage limit, only in the same project | `@decided` |
| D47 | The guild council (Cúpula da Guilda), its Judge and its council group | `@decided`; the release "0.5.0 or later" is `@proposed` |
| D48 | User presence: away mode | `@decided`; the release with D14 and the supervisor is `@proposed` |

Labs that gate parts of 0.5.0:

| Lab | Gates |
|---|---|
| D15 (the `Stop` hook in interactive and `-p` mode, `/loop` while idle, the token cost of a tick, `Stop` hooks in `codex exec`) | the supervisor |
| D38 (the trigger mechanism and its limits) | the resume after a usage limit |
| D47 (one council with the council skill against one without) | the council skill |
| D48 with D46 and D39 (an agent that gets no answer for hours; a hook that refuses a read of the away file) | away mode |
| The labs of the [scenario catalog](2026-11-09-orchestrator-scenarios.md) gap closure (SC-G3, SC-G4, SC-G5, SC-G6, SC-G7, SC-G8, SC-G13, SC-G18, SC-G19) | the supervisor mechanisms |

Before the build also: the open level rule of D16.

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
