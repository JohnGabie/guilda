# guilda — decision register

Status: register of the decisions after 0.1.0. Release specs: [0.1.1](2026-11-09-guilda-0.1.1.md),
[0.2.0](2026-11-09-guilda-0.2.0.md), [backlog 0.3.0 to 0.5.0](2026-11-09-guilda-backlog.md).
Sources: issues #1 to #13 of this repository, the evidence that they cite, the user's decisions of 2026-11-09, and
the lab reports on the `lab/*` branches. Git keeps the earlier single file `2026-11-09-guilda-0.2-design.md`.

Tags (ARC2): `@decided` = the user approved it. `@proposed` = the Architect's proposal, not approved yet.
`@open` = a question for the user. `@replaced` = a later decision replaced it; the entry names the later decision.

Each entry has: status, release, who decided and when, the decision, the items with their own tags,
`Replaced by:` when it applies, and the labs. The status of an entry is the tag of its heading in the earlier file.
An item inside the entry keeps its own tag. A `@proposed` item inside a `@decided` entry still needs approval.

## Release plan `@decided`

The user decided on 2026-11-09. One theme for each release. Each release works alone, and the next one builds on
it. Semver rules of `RELEASING.md`, with the 0.x rule below.

| Release | Theme | Scope |
|---|---|---|
| 0.1.1 | fixes | D4, the first item of D11, the README note of D2, the CHANGELOG parser that reads both formats |
| 0.2.0 | process | D1, D2, D3, D5 to D10, the second item of D11, D19, D23 to D26, D28 to D30, D34 `@proposed`, D36, the plan file name and its R4 hook (D27) |
| 0.3.0 | traceability and state | D27 block index with the `Uses:` lines and the check, D12, D13, D14, D20, D21, the measure of D22, D35 `@proposed`, D32, the mod part of D24 |
| 0.4.0 | the Architect outside the main session | D31, D17, D18, D33, the Codex adapter (lab `external-agent`) |
| 0.5.0 | foreman and pace | D15, the pace of D22 with the `cswap` fork plan, D16 and D37 `@proposed` with the red team of D28, D38 `@proposed` |

- `@decided` While the major number is 0, a core rule that changes meaning raises the minor number. The CHANGELOG
  entry tells projects to run `guilda:init` again. `RELEASING.md` says this.
- `@decided` (2026-11-09) The CHANGELOG format changes in two steps, so that `guilda:update` of 0.1.0 can still
  read the changes. 0.1.1 ships the parser that reads both formats and keeps the old format in its CHANGELOG. The
  "Keep a Changelog" format reaches `main` only with 0.2.0. A 0.1.0 install updates to 0.1.1 first.
- `@decided` E1 and E2 run between releases. Each lab with a conditional GO gets its larger run before 1.0.
- `@decided` (2026-11-09) Open source practice on GitHub: one milestone for each release with its issues, a short
  `ROADMAP.md`, the CHANGELOG in the "Keep a Changelog" form, and a GitHub release with notes for each tag. The
  register stays the source of the decisions.
- `@proposed` (2026-11-10, the split) D34 goes to 0.2.0, D35 to 0.3.0, D37 and D38 to 0.5.0. The plan of the
  controller set these releases. The user confirms them. A cell with `@proposed` in the table above is one of them.
- `@decided` D36 is in 0.2.0: the user put all domain skills of D25, D28, D29 and D36 in 0.2.0 (D28).

## Builder check of 2026-11-09 `@decided`

A fresh agent read the spec cold and listed 12 guesses. 0.1.1 can be built as written. Settled by the Architect:

- `@decided` An agent "from outside the conversation" (D20) is any agent that is not in the native agent list of
  the session. A Claude Code agent that the router resumes (`claude -p`) is one. This reading stays.
- `@replaced` "The 0.2.0 panel shows routed Claude Code agents, and Codex agents come with 0.3.0." Replaced by: the
  release plan. The panel (D20) is in 0.3.0. The router and the Codex adapter are in 0.4.0.
- `@replaced` "The release plan missed D17 and D18 for Claude Code in 0.2.0." Replaced by: the release plan. D17 and
  D18 are in 0.4.0.
- `@decided` The Architect writes the state transition table of the queue (D14) in the plan: who sets each state,
  and when.
- `@decided` `.guilda/.gitignore` lists each new runtime file (queue, bindings, bus, logs, audit, reports). Git does
  not ignore the whole `.guilda/` folder, because `config.json` and `rules.md` are committed.
- `@decided` 0.2.0 defines the lab report format (D34), with the agent ID of the agent that ran the lab.
- `@decided` The target of a field report (D3) is a config value, with this repository as the default.

## Decisions

### D1 — Process levels

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #2, #13 · Values by experiment E1.

`.guilda/config.json` gets a field `process`. Until E1 runs, guilda has two levels, `light` and `full`.
A level changes the gates and the review cycle, never a law. `guilda:init` always asks for the level.

- `@replaced` The four-level table (`sketch`, `light`, `standard`, `full`). Replaced by: the item "two levels until
  E1" below. The table stays a starting point for E1 only.
- `@decided` The levels are not decided on paper. They enter a release only after E1 runs on real work at each level.
- `@decided` The review cycle and the QA cycle depend on the level. At `full`: for each task. At `light`: one time,
  at the end of the integration. The Reviewer reads the level from `.guilda/config.json`. The rules that change
  meaning are R24 and R11 (see the 0.2.0 spec).
- Correction (2026-11-10): the earlier text cited R22 for "QA for each task". R22 is QA in two phases. The level
  does not change R22: QA at `light` still runs both phases, one time at the end.
- `@decided` Until E1 runs, guilda has two levels: `light` and `full`. E1 runs on the Glasshaus project after the
  weekly usage reset of the user's accounts. The way to run E1 is decided then.
- `@decided` The laws (R4, R18, R19, ARC6) run at each level.
- `@decided` (#2 finding 8) `light`: all checks run one time, at the end. `full` keeps every check, and uses the
  wait time: while the Reviewer and QA check task N, an Executor starts task N+1 or another independent part.
- `@decided` No default level. `guilda:init` asks: a prototype or personal project, or a product. It writes `light`
  or `full` from the answer.
- `@decided` (the user, after the cold review) The Architect marks the security zones in the spec. A zone is each
  block that touches a risk area: login, secrets, user data, and the areas of `config.security.riskAreas`. A task in
  a marked zone gets a Security review at each level. At `light`, that review is part of the one review at the end.
- `@proposed` A domain skill (D28) helps the Architect find the zones.
- `@decided` A Security Executor (the Executor with the red team or blue team skills, D28) stays an option in any
  project. Release: 0.5.0, with the `red-team` skill.
- `@proposed` (2026-11-10) Security tests in 0.2.0, before the `red-team` skill. The Security role reviews each
  security zone. The injection tests of an AI artifact use the injection test set of `ai-evals` (D29).
- `@open` The release of the `blue-team` skill: 0.2.0 with the other domain skills, or 0.5.0 with `red-team`.

### D2 — Activation check

Status: `@decided` · Release: README note in 0.1.1, the rest in 0.2.0 · The user, 2026-11-09 · Issues: #2, #11.

A hook cannot warn when the plugin did not load, so the warning comes from a file that loads without the plugin.

- `@proposed` `guilda:init` adds a short block to the project `CLAUDE.md`: "This project uses guilda. If no
  `guilda:*` agent exists in this session, stop and tell the user that guilda is off."
- `@proposed` (reclassified 2026-11-10, D24) `doctor` is an internal script, not a skill. It reports: plugin loaded,
  hooks live, `guilda:*` agents present, project files present, version. Each item is PASS, FAIL or UNKNOWN with its
  evidence. The activation check shows its result. From 0.3.0 the mod (D20) also shows it.
- `@proposed` The README says that a project-scope install loads only when Claude Code starts in that project folder.
- `@proposed` The Architect confirms that the `guilda:*` agents exist before the first dispatch of a session.
- Risk (2026-11-10): the dependency of D28 can stop the load of guilda. The activation check must detect that case.
- `@decided` (2026-11-10, the user, U3) The 0.2.0 `guilda:init` and the activation check detect a project layer of
  0.1.x and tell the user to run `guilda:init` again. This works from any earlier version.

### D3 — Field report skill `guilda:report`

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issue: #12.

The user runs `/guilda:report`. A subagent collects the evidence and drafts a field report in the format of #2 and
#11. The skill asks the user for their own text, shows the final report, and sends it only after the user approves.

- `@replaced` The skill name `guilda:feedback`. Replaced by: `@decided` (2026-11-09) the name `guilda:report`. The
  save folder is `.guilda/reports/`, not `.guilda/feedback/`, so that the folder has the skill name.
- `@decided` A report has a type: improvement, bug, feature idea, or other. The type sets the label of the issue.
- `@decided` Safety, required:
  - This repository is public. Anonymize by default: replace project names, routes, domain terms, paths, people and
    business data with generic terms. The user can turn this off for one report.
  - Run the R19 scan on the final text. A hit blocks the send.
  - No whole files, transcripts, logs or diffs in a report.
  - Show each issue and each comment in full. Send only after the user says yes (R12).
  - Without `gh`, without a login, or on an error: save the report in `.guilda/reports/` and send nothing.
- `@proposed` (risk, 2026-11-10) The anonymization by a model is not reliable, and the R19 scan does not find a
  domain name or a business term. So the skill shows each field of the report alone, and the user approves each
  field before the send.
- `@proposed` This repository gets one label and one issue template for each report type.
- `@proposed` (2026-11-10) The scan and the send are one internal script, `scripts/report-send.mjs` (D24). It runs
  the R19 scan on the final text, then sends with `gh`, or saves the report in `.guilda/reports/`.
- `@proposed` The glossary adds the term `field report` (see Glossary proposals).

### D4 — QA report parser

Status: `@decided` · Release: 0.1.1 · The user, 2026-11-09 · Issue: #6.

A scenario line at column 0 with a colon (`1. Login works: PASSED - ...`) ends the `Scenarios` section, so a valid
report is rejected (`scripts/lib/formats.mjs`). The fix: a line ends the section only if it is not a scenario line.
An unindented continuation line stays in its scenario.

### D5 — Brief check and brief fields

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #2, #5, #13.

- `@proposed` The ARC6 hook also validates a brief file. For a prompt with a `Brief file: <path>` line, the hook
  checks the text of that file.
- `@proposed` The hook also checks a dispatch of another agent type when the prompt has a `Role: executor` line.
- `@proposed` New brief fields: `Decisions:`, `Mutants:`, `Conflict cases:` (#5) and `Base commit:` (#13). They are
  optional in 0.2, so that existing briefs stay valid.
- `@open` Is the field `Base commit:` required, or optional?
- `@decided` (2026-11-10, the user, U6) `Base commit:` is a required brief field in 0.2.0. The ARC6 hook refuses a brief
  without it. This changes the brief format (CHANGELOG "Changed"); briefs written for 0.1.0 need the field.

### D6 — Concrete specs

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #2, #4, #5.

- `@proposed` ARC7, ARC8 and ARC10 as written in #5: exact scenarios, one owner task for each `@decided` item, and
  a glossary entry for each new term. The EF-system project used them as project rules, with evidence of value.
  Texts in the 0.2.0 spec.
- `@proposed` A builder check before approval (#4): a fresh subagent reads the spec cold and lists its guesses. The
  Architect sorts them into three groups: answered already, minor, the user's.
- `@proposed` A ruling that changes behavior enters the spec in the same step, before the Executor continues. The
  ledger only points to it (#2 finding 4).
- `@proposed` Rule IDs and decision IDs are unique in a project.
- `@proposed` `guilda:init` writes a skeleton `GLOSSARY.md`.

### D7 — Mutants

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #2, #5, #10, #11.

- `@decided` ARC9 (#5): each new test has one named mutant of the product code that makes the test fail. Required at
  `full`. The Architect's choice at `light`. Text (`@proposed`) in the 0.2.0 spec.
- `@decided` Classification (#10): the Reviewer classifies each mutant as killed, survived (weak test) or equivalent
  (with the reason). An equivalent mutant is noted and does not go to a fix round. A kill counts only if the failing
  assertion targets the mutant.

### D8 — Reviewer

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #10, #13.

- `@proposed` Checklist additions from #10: no secret in a client cache, the URL, storage or logs; anchored
  assertions; fixtures with a record that each filter must reject; no generated artifacts in the diff; the exit code
  in the Executor report.
- `@proposed` A spec review mode (#13), with its own checklist: testable scenarios, tags, contracts, owners. Its
  verdict has the line `Stage: spec`. It does not count toward the R11 rejection limit.
- `@proposed` The Reviewer can ask the Architect a question about the spec. The Architect answers with facts and never
  argues for a verdict. The verdict stays with the Reviewer (R7). The ledger records each question and each answer.
- `@decided` (#2 finding 12) A re-review of a small fix can run at the journeyman tier. Small means: about 50 changed
  lines or fewer, no risk area, no shared code. The first review and the final review stay at the master tier.

### D9 — Parallel waves

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #7, #8, #9.

Text rules in the Architect procedure, with no new script in 0.2.0:

- `@proposed` The plan has a producer/consumer table. Each interaction between tasks is one row. Each row names the
  task that writes the join test (#8).
- `@proposed` A foundation-fix path (#8). A task that finds a bug in a shared part that it does not own makes no
  local workaround. The Architect decides where the fix goes and the merge order.
- `@proposed` A shared-helper forecast before a wave (#9). A temporary copy carries the marker
  `guilda:consolidate <name>` in a code comment. The marker is text that a later task finds with grep, not a command
  (D24).
- `@proposed` The foundation task adds the ignore entries of each tool that it adds (#8).
- `@proposed` Each brief asks for a `timeout` on long commands and a commit for each green item (#7).

### D10 — Role fixes

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issues: #2, #13.

- `@proposed` Merges and conflicts go to `version-control`, after the user approves the merge (#2 finding 6).
- `@proposed` `QA: covered by review` when each Acceptance scenario names a check that the Reviewer already ran (#2
  finding 7).
- `@proposed` The Executor, QA and the Reviewer never publish or share anything outside the worktree (#2 finding 9).
- `@proposed` EXE2 becomes "show the new test failing against the old code" (#13 finding 5). Text in the 0.2.0 spec.
- `@proposed` Each dispatch states the reply language of `config.languages` (#13 finding 6).
- `@proposed` ARC4 fallback (#13 finding 4). If the model of a tier is not available, use one tier lower. Tell the
  user.

### D11 — `lint-rules` and formatters

Status: `@decided` · Release: first item 0.1.1, second item 0.2.0 · The user, 2026-11-09 · Issue: #13.

- `@proposed` `lint-rules` accepts a blank line after a rule title and between the `Rule:`, `Why:` and `Check:`
  lines.
- `@proposed` `guilda:init` detects a formatter in the project and proposes an ignore entry for `.guilda/`.

### D12 — Agent identity and questions after the work

Status: `@open` · Release: 0.3.0 · Proposed by the user, 2026-11-09.

Each agent gets an identifier, and each task records the identifier of its Executor. The Reviewer and the
Architect can then ask that Executor why it did something.

- Research (Claude Code docs on hooks and sub-agents, not verified live): the `PostToolUse` input of the Agent tool
  has `tool_response.agentId`, also for a background dispatch; `PreToolUse` does not. Hooks inside a subagent get
  `agent_id` and `agent_type`. `SendMessage` with the agent ID resumes a finished subagent. A subagent that the user
  stopped cannot be resumed.
- `@proposed` A `PostToolUse` hook on the Agent tool records the task ID and the agent ID. The task ID comes from
  the `ID / title:` line of the brief. The record goes to the queue journal (D14), the one owner of agent identity.
- `@proposed` The Reviewer writes its questions in a `Questions:` section of the verdict. The Architect sends each
  question to the Executor with `SendMessage`, and adds the answer to the review. The ledger keeps each question and
  each answer.
- `@open` Direct questions from the Reviewer to the Executor, without the Architect. Then the record is only in the
  transcripts.

### D13 — Audit log of the agents

Status: `@open` · Release: 0.3.0 · Proposed by the user, 2026-11-09.

A record of what each agent did: the tool calls, the files it changed, the commands it ran.

- Research (Claude Code docs, not verified live): Claude Code keeps the transcript of each subagent and deletes it
  after `cleanupPeriodDays`, 30 days by default. OpenTelemetry can export each tool call with `agent_id`.
- `@proposed` A `PostToolUse` hook writes one line for each tool call of a subagent to `.guilda/audit.jsonl`: the
  time, the agent ID, the task ID, the tool, and the changed file path or the first word of the command. No command
  text and no file content, so no secret enters the log (R19).
- `@proposed` On `SubagentStop`, the hook records the path of the agent transcript.
- `@open` Copy the transcripts of a task into the project before the 30 days end, or not.

### D14 — Agent queue in code

Status: `@proposed` · Release: 0.3.0 · Proposed by the user, 2026-11-09.

The flow must not live only in the context of one agent. The queue is the source of truth and the check of the
flow. A hook cannot start an agent, so the queue does not run the agents.

- `@decided` (2026-11-09) One writer. Only the foreman (D15) writes the queue. Until the foreman exists (0.5.0), the
  Architect writes it. Hooks and other agents never write it.
- `@decided` (2026-11-09) A state changes only on a signal from the agent: `running` when the agent says that it
  started, `review` when it delivers its report. The writer does not infer a start from a dispatch.
- `@replaced` The file `.guilda/queue.json` and the states that hooks set. Replaced by: the signal rule above and the
  file layout below.
- `@decided` (2026-11-09) Use the known patterns of job queues (lease, heartbeat, visibility timeout, retry,
  concurrency limit) and, if one fits, an existing tool.
- `@decided` The identity of each agent has one owner: the queue journal. The dispatch event records the address,
  the agent ID, the tool, the session and the `Uses:` line of the brief. Other files derive from it or point to it.
- `@proposed` Files:
  - `.guilda/queue/journal.jsonl`: append-only, with one writer.
  - `.guilda/queue/state.json`: derived, written by temp file and rename.
  - `.guilda/queue/signals/<task>/<attempt>/`: `started`, `heartbeat`, `done`, `failed`, each written by its worker.
  - `.guilda/queue/lock`: the process ID and the session of the writer.
- `@proposed` Transitions:

  | From | To | When |
  |---|---|---|
  | `pending` | `ready` | all dependencies are `done` |
  | `ready` | `dispatched` | a slot is free |
  | `dispatched` | `running` | the `started` signal |
  | `running` | `done` or `failed` | the signal |
  | `dispatched` or `running` | `stalled` | no `started` in the ack timeout, or no heartbeat in the lease timeout |
  | `stalled` | `running` | a new heartbeat |
  | `failed` or `stalled` | `ready` | a decision; the attempt number plus one |
  | any open state | `dead` | the attempts are used up |

- `@proposed` `stalled` never dispatches the task again by itself. A retry uses a new attempt ID and its own worktree
  or branch.
- `@proposed` Recovery after a restart: take the lock, replay the journal (skip a last partial line), turn new signal
  files into events, check the timeouts again.
- `@proposed` JSONL, not SQLite: `node:sqlite` is still experimental in Node 24.
- Research (SQS, Temporal, BullMQ, single writer, event sourcing; `nq`, task-spooler, GNU parallel, `node:sqlite`;
  Claude Code agent teams). Not used: task-spooler (it starts a server), the agent teams task list (many writers).
- `@open` Lab before the build. Cases: a writer dies in the middle of an append. A worker dies with no signal. A
  `done` signal comes after `stalled`. Two writers run at the same time. Codex and subagents send heartbeats. A
  `rename` is atomic.

### D15 — Foreman

Status: `@open` (the role name is `@decided`) · Release: 0.5.0 · The user, 2026-11-09.

The foreman runs the work that the Architect designed. It keeps the pace and the health of the flow, and does not
own the project. The earlier file and the scenario catalog use the working name `orchestrator` for this role.

- `@decided` (2026-11-09, the user) The role name is `foreman`. Glossary proposal below.
- `@proposed` The foreman comes after the Architect, not above it. The user talks to the Architect first, for the
  spec and the plan. Then the work goes to the foreman.
- `@proposed` The user talks only to the main session. The foreman runs in the background and does not talk to the
  user. Agents send their messages to the foreman. A decision of the user goes up through the main session (R12).
- `@proposed` The foreman routes each message to its address (D17), dispatches the next ready task (D14), and finds
  a stalled agent (#7). It does not write product code and does not review (R7, R12).
- `@proposed` It can run on another model. The queue, the addresses and the logs are files that any model can read.
- Research (Claude Code and Codex docs, not verified live): no official mechanism makes an idle session act without a
  process or a scheduled trigger. `/loop` ends with the session and expires after 7 days. A `Stop` hook acts only at
  the end of a turn. `SendMessage` gives an idle local session a new turn, but does not reach Codex.
- `@proposed` The foreman is a Claude Code session with `/loop`. Each tick runs the internal `tick` script. A `Stop`
  hook blocks the end of a turn while a task is ready.
- `@proposed` Sleep in code, wake the model only for an action (the user's idea). The internal `watch` script runs as
  a background command. It prints nothing while the flow is healthy. On a ready, stalled or failed task it prints one
  line and ends, and the end notice wakes the foreman.
- `@open` Lab before the build: the `Stop` hook in interactive and `-p` mode, `/loop` while idle, the token cost of a
  tick, `Stop` hooks in `codex exec`.
- `@decided` G5: after a restart of the session or the machine, only the user starts the foreman again. No hook
  starts it, and no hook asks. D38 adds a separate case for a usage-limit stop.
- `@decided` G10: the `cswap` fork also reads Codex usage, if it can. If a Codex run fails, the code records where
  and why it stopped. The foreman then resumes it, waits, gives it to a Claude Code agent, or queues it again.
- `@decided` G16: no reserved slots for the user's own side tasks. The foreman reads the usage percent and keeps the
  work going. The user has the final decision on the engineering of the project.
- `@decided` G18: the foreman can stop an agent, also a stalled one, to keep the pace. A stop without a safe save
  first is an extreme step, and for an extreme case the foreman talks to the Architect first.
- Scenario catalog: `2026-11-09-orchestrator-scenarios.md` (written before G18 and the final queue design; see its
  header note).
- `@decided` (2026-11-10, the user, U4) The role is named `supervisor`. This replaces the name `foreman`. "lead" is not
  a forbidden word, so the Security Lead keeps its name. Forbidden as names of this role: orchestrator, leader,
  foreman. Every "foreman" in the register and the backlog means `supervisor`.

### D16 — Security team

Status: `@replaced` in part · Release: 0.5.0 · Proposed by the user, 2026-11-09.

- `@replaced` The roles `red-team` and `blue-team`. Replaced by: D28, where they are domain skills of the Executor.
- `@proposed` `security-lead`: the current Security role. It points, never edits, and gives work to the attack and
  defense agents. D37 refines it: the Security Lead is an agent that decides with the Architect.
- `@proposed` Red team limits, as laws where a hook can check them:
  - Only the code of this project, in a local test environment.
  - Never an outside target: no host, address or service that the project does not own.
  - Never a real credential, no persistence, and no data copy out of the test environment.
  - Only for a task whose brief has a risk area, and only after the user approves.
- `@open` The level rule. The earlier text said "only at `standard` and `full`". `standard` does not exist until E1.

### D17 — Agent addresses and messages outside the runtime

Status: `@proposed` · Release: 0.4.0 · Proposed by the user, 2026-11-09.

Messages between agents do not depend on one runtime, so that agents of other tools and models can take part.

- `@proposed` Address: each dispatch gets a code, for example `T3-exe-7f2a` (task, role, short random part). The
  agent keeps that code for the life of the task.
- `@proposed` Binding table: a file maps each address to the agent that runs now (a Claude Code agent ID or the
  session of another tool). If an agent cannot resume, a new agent takes the address, with the ledger and the earlier
  transcript.
- `@proposed` Mailbox: one append-only JSONL file for each address in `.guilda/bus/`. A message has: ID, from, to,
  task, type, text, and the ID of the message that it answers.
- `@proposed` Router: it reads the mailbox and resumes the bound agent (`SendMessage` or `claude --resume` for Claude
  Code, an adapter for another tool). A busy agent gets its messages one at a time, in order.
- `@proposed` Reply contract: each message gets a reply to its sender. A `SubagentStop` hook checks the reply format
  and sends the agent back once (exit code 2).
- `@replaced` "0.2 builds the mailbox; adapters for other tools come with D15." Replaced by: the release plan. 0.4.0
  builds the format, the file mailbox, the Claude Code adapter and the Codex adapter.
- Known cost: each resume makes the context of the agent larger. E2 measures this.
- `@open` A local MCP server as the bus. Read the user's earlier local project that connects agents through MCP first.

### D18 — Agent life cycle: no agent left running

Status: `@proposed`, not approved for the build · Release: 0.4.0 · Asked by the user, 2026-11-09.

- `@proposed` An idle agent is a file, not a process. Between messages, the agent is its address and its session ID
  in `.guilda/`. A new message resumes that session.
- `@proposed` One store in `.guilda/` holds the queue (D14), the addresses, the binding table, the mailboxes and the
  audit log (D13). `.guilda/.gitignore` lists each runtime file.
- `@proposed` No daemon, no global install, no change to user settings. Adapters are off unless `config.json` turns
  them on.
- `@proposed` Each run of an external agent has a timeout. A clean-up at session start and end stops each process
  whose run is over. One command stops all agents of the project.
- `@proposed` A run of another tool starts as a background command of the Claude Code session, so the user sees it.
- `@proposed` No tool edits the process of another tool. Agents of other tools use the mailbox files.
- `@proposed` From the lab:
  - A routed turn starts with no tools.
  - A routed agent starts no background commands.
  - An `ack` message is stored and not delivered.
  - Codex runs with stdin from `/dev/null`.
  - The Codex adapter uses options that stop extra loads. A lab verifies them.
- Lab `lab/agent-bus` (`docs/labs/2026-11-09-agent-bus.md`): conditional, not approved for the build. Most checks ran
  one time and no failure case ran. Single run and resume PASS for Codex and Claude Code; one mailbox exchange PASS;
  session-end hook 6 of 6 in `claude -p`.
- `@open` Before the build: two messages at the same time, a timeout, a failed child, Codex as the sender, an
  interactive session, SIGKILL.

### D19 — Labs run in an agent

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09.

A lab, an experiment or a spike always runs in a dispatched agent, never in the controller session. The controller
writes the hypothesis and the PASS criteria, dispatches the agent with the lab brief, reads the report and gives the
verdict.

- `@proposed` A core rule with this text, cited by the Architect procedure, `guilda:lab` and the experiments. Its
  ID is R26, the next free core ID after R25. Text in the 0.2.0 spec.
- `@proposed` Check: gate. The Reviewer rejects a lab report that has no agent ID of the agent that ran it (D34).

### D20 — Agent panel as a terminal mod

Status: `@proposed` · Release: 0.3.0 · Proposed by the user, 2026-11-09.

A Claude Code mod shows the agents from outside the conversation. It is a second plugin, `guilda-panel`. A user
without the mod sees no change.

- `@proposed` The mod reads the queue journal (D14) on a timer. From 0.4.0 it also reads the binding table (D17).
- `@decided` Rows under the prompt with a dim heading `other models`: the marker `◇`, the label
  `guilda:<role>-<tool>` and the task title; on the right, the time, the state and the tokens.
- `@decided` Only agents from outside the conversation (builder check reading). The address shows only in the detail
  view.
- Lab `lab/agent-panel` (`docs/labs/2026-11-09-agent-panel-mod.md`): a conditional GO with one live view. The user saw
  one live row for one Codex agent and accepted the layout. Not verified: the hide after `done`, hover and click, the
  label on a tool row. Defect: the log command opened the oldest agent.
- Limits (mod docs of Claude Code 2.1.321): no mod component inside the native agent list; a pane opens without a
  request only in a wide terminal; a timer and file reads, no file watch.
- `@open` Whether one plugin can hold both command hooks and a mod module.

### D21 — Project status for any model

Status: `@proposed` · Release: 0.3.0 · Asked by the user, 2026-11-09.

- `@proposed` An internal `status` script reads `.guilda/` and prints tasks by state, running and stalled agents, and
  the last events. It starts no agent.
- `@proposed` Other tools run the script through a short instruction. Not verified: how Codex loads such instructions.

### D22 — Consumption and pace of work

Status: `@proposed` · Release: the measure in 0.3.0, the pace in 0.5.0 · Asked by the user, 2026-11-09 · Issue: #3.

The pace is the number of agents that run at the same time. It comes from the usage left on the accounts and the
hours that the user wants for the work.

- `@replaced` "D22 in 0.2.0 is only the measure of tokens." Replaced by: the release plan. The measure is in 0.3.0
  (with D35), and the pace is in 0.5.0.
- `@proposed` Measure (0.3.0): the logs (D13) record the tokens of each agent and each task.
- `@proposed` The code computes the pace and recommends a number of agents, with its assumptions and uncertainty. An
  automatic change needs a policy that the user turns on.
- `@decided` (#3) Tokens are not shown as an exact share of a subscription. The plan never switches accounts by itself.
- `@replaced` "A running agent is never stopped to meet a number." Replaced by: D15 G18.
- `@decided` The Architect sets the pace with the user in the plan of the feature. The foreman only executes the pace.
- `@decided` Near a limit, or under the pace, the foreman assesses the risk and asks the Architect one precise question
  with the facts, 2 or 3 options and its recommendation. The Architect decides.
- `@decided` The usage source is the user's fork of `cswap`, with a minimal command (for example `cswap pace --json`):
  for each account, the usage percent and the reset time of the 5-hour and the 7-day windows. guilda never uses
  `cswap list --json` and never runs `cswap switch`.
- `@decided` guilda keeps only these values, and never writes account data to a log or a report.
- `@decided` The goal: a constant flow that does not pass a limit and does not stand still.
- `@decided` Without `cswap`, or with `usage.source: "off"`, the function is off and guilda works as 0.1.0 does.
- `@proposed` The `cswap` fork plan: smart switching that keeps the usage of all accounts even.
- `@proposed` (reclassified 2026-11-10, D24) The pace talk is part of the plan step of the Architect, with the
  reference file `pace.md` (D30) and an internal script. There is no `guilda:pace` skill.
- `@proposed` The concurrency limit counts every agent: each role, each external tool, each side task (#11).
- `@proposed` Seven pace scenarios to specify (near a limit, a heavy start, under the pace, weekly limit, one early
  reset, uneven use, old data). Detail in the scenario catalog.
- `@open` A usage source for Codex accounts.
- `@open` Risk (2026-11-10): the terms of use of each provider for more than one account. Not verified. An answer is
  required before 0.5.0 ships the pace.

### D23 — Decisions go through the question tool

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09, after a decision at the end of long replies was not seen
five times.

- `@decided` The Architect asks each pending decision with the question tool of the host (`AskUserQuestion` in Claude
  Code), one decision at a time (ARC1).
- `@decided` A decision is never only in the text of a long reply, and never in the middle of a discussion.
- `@decided` A request for permission to continue is not a decision. The Architect asks the decision itself.
- `@decided` Each question carries its context: where, what, a concrete scenario, the effect of each option, the
  recommendation first (R13).
- `@decided` The Architect adapts the question to the level of the user, and asks again in simpler words when an answer
  shows that the user did not understand.
- `@proposed` A setting `explain: "brief" | "full"` in `.guilda/config.json`, asked by `guilda:init`.
- `@proposed` New text of ARC1 and R13. Text in the 0.2.0 spec.

### D24 — Few commands

Status: `@proposed` · Release: the commands part in 0.2.0, the mod part in 0.3.0 · The user, 2026-11-09: too many
commands make noise.

- `@proposed` (0.2.0) Internal scripts: `doctor` (D2) and `report-send` (D3). Agents run them. The user does not
  type them.
- `@proposed` (later releases) The other internal scripts come with their decisions. `status`: 0.3.0 (D21).
  `send`: 0.4.0 (D17). `watch`, `tick` and the pace script: 0.5.0 (D15, D22).
- `@proposed` (0.2.0) Skills only where a conversation with the user is needed: `architect`, `init`, `update`,
  `report`.
- `@proposed` (0.2.0) `guilda:lab` is a skill that the Architect loads to write a lab brief and dispatch the lab agent
  (D19). It is not a user command. Not verified: a frontmatter field that hides a skill from the user menu.
- `@proposed` (0.2.0) `guilda:consolidate <name>` is a code marker (D9), not a command.
- `@proposed` (0.3.0, moved: it depends on D20) The mod is the interface. In the area of the agents it shows the
  external agents, their work time, the pace, and a mark when a `doctor` check fails.
- `@proposed` (0.3.0, moved with the mod) `guilda:init` shows its progress in a mod pane. Its questions still go
  through the question tool (D23).
- `@open` (0.3.0) The detail command of the mod (`/guilda-agents`): keep it, or open the detail only by a click.

### D25 — Agent groups and the lab roles

Status: `@proposed` (with `@decided` items) · Release: 0.2.0 · Asked by the user, 2026-11-09.

- `@decided` Three groups of roles:
  - Engineering: the Architect, the Executor, the Reviewer, QA, Version Control, and the foreman (D15, 0.5.0).
  - Lab: `lab-researcher` (primary web sources), `lab-reader` (code, docs and local projects, changes nothing),
    `lab-experimenter` (tests a hypothesis against PASS criteria written before the run, D19).
  - Security: the Security Lead (D16, D37). The red team and blue team are skills of D28, not roles.
- `@replaced` "The Architect in the main session". Replaced by: D31 from 0.4.0. Until 0.3.x it stays true.
- `@replaced` "The three lab roles give one report form". Replaced by: D34.
- `@decided` The lab roles are internal. The Architect dispatches them (D24).
- `@open` The names of the three lab roles.
- `@proposed` A triage step before the brief of each task. An open question goes to the Lab first. A risk area goes
  to Security. A clear and decided change goes to Engineering. One task can use more than one group.
- `@proposed` The Architect records a lesson when an unused group would have stopped a problem. The lessons change
  the triage table in `.guilda/rules.md`.
- `@decided` (the user) A data skill for the Lab group, as a domain skill (D28). It turns data into information: it
  collects the raw data, explores it, and processes it into information that a person or an agent can use.
- `@decided` (the user) The data skill designs and runs experiments with the lab roles: the arms, a key written before
  the run, the number of runs, agents in parallel, the usage of each, and the analysis.
- `@decided` (the user) It is for any data, also the product and business data of a user project. Uses in guilda: a
  lab verdict, the account usage for the pace, patterns in the logs, the evidence of a field report, the history of a
  project.
- `@decided` (research: Kohavi et al. 2022, Anthropic on evals, tau-bench, Kapoor et al., Zheng et al., HELM, NIST,
  Wilson et al.) The data checklist:
  - Before the run: the hypothesis, the main metric, the guard metrics, the smallest effect worth acting on, the rule
    for GO, NO-GO or MORE DATA, and the number of questions and runs from a power estimate.
  - The same questions in both arms, a paired analysis, random order, isolated attempts.
  - The effect with a confidence interval (paired bootstrap by question). Median and mean together.
  - pass^k when consistency matters. Cost, tokens, turns and latency for each task.
  - A deterministic grader when possible. An LLM grader is a different model, with a rubric and a hand-checked sample.
  - Read the failure transcripts and classify each cause. Repeat a large effect or a one-case effect.
  - A section "does not apply to". Raw data unchanged with its source. Collection and analysis in separate scripts.
  - The verdict GO, NO-GO or MORE DATA, with the cost of a wrong call and whether it can be undone.

### D26 — Optional tool plugins: ios-on-linux

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09 · Issue: #1.

- `@decided` The `ios-on-linux` skill becomes its own plugin in the guilda marketplace. It is not a required
  dependency.
- `@decided` `guilda:init` or the Architect offers it only when the project has scenarios for a mobile app.
- `@proposed` The same pattern serves other QA tools later.
- `@proposed` Before an action that sends, deletes or buys on the phone, the skill asks the user.

### D27 — Traceability with content hashes

Status: `@proposed` (with `@decided` items) · Release: the plan file name and the R4 hook in 0.2.0, the rest in 0.3.0
· Proposed by the user, 2026-11-09.

Coherent links between specs, plans and agents, so that a change in a spec reaches the plan without a full read again.

- `@decided` (0.2.0, #2 finding 13) The plan of a feature can be a file next to its spec: `<feature>.plan.md`, in the
  same folder, with a link to the spec and back. The R4 hook accepts this exact name and still refuses other plan
  files. R4 changes meaning; text in the 0.2.0 spec.
- `@decided` (0.3.0, moved 2026-11-10: it needs the index) Each plan task cites the blocks it uses with a `Uses:`
  line, so that the block index ties the plan to the spec.
- `@decided` The link is to a whole block (a decision, a task, a scenario), never to a line. The ID of a block never
  changes. The hash is only an alarm: "this block changed since you read it". Any change raises it.
- `@decided` The earlier version stays visible. The index records the commit at which each brief read each block. For
  a suspect link, the Reviewer sees the block then and now, side by side.
- `@decided` Read by ID, not by file. The index maps each ID to its file and line range. An agent never reads a whole
  spec for one ID. Measured: the earlier single file was 740 lines (about 13,000 tokens); block D14 was about 900.
- `@decided` A cold Reviewer still checks the result. The hash only shows where to look.
- `@proposed` Design:
  - The section header is the anchor. A title slug is not an ID.
  - Hash: SHA-256 of the title without the status tag plus the body, white space collapsed, first 8 characters.
  - A generated index `.guilda/trace/index.json`, never edited by hand.
  - Citations as `Uses: D14@3f2a9c1b`.
  - A check script lists suspect, unknown and ownerless IDs. An acknowledge command writes the new hash.
- `@proposed` The check runs after a spec edit (warning only), in the Reviewer gate, and by the Architect before a
  dispatch.
- `@decided` Fixes from the lab: "suspect" means "look", not "broken"; the no-owner list counts only the IDs that the
  plan covers; `--allowedTools` did not stop read-only shell commands.
- Research (Doorstop, OpenFastTrace, sphinx-needs, StrictDoc): Doorstop already stores a parent fingerprint for each
  link. A git blob hash is too coarse. A vector index is not needed; grep finds a header in 0.04 s.
- Lab `lab/trace-index` (`docs/labs/2026-11-09-trace-index.md`): conditional GO. Change alarm: exactly the 5
  affected briefs, no false hit, under 0.15 s. 44 Haiku agents: 19 of 20 correct answers against 18 of 20, mean input
  tokens 18% lower (median 38%). One model, one spec. A larger lab runs before 1.0.

### D28 — A generic Executor with domain skills

Status: `@decided` · Release: 0.2.0 (the red team skill in 0.5.0 with D16) · The user, 2026-11-09.

Areas are knowledge, so they are skills, not agents.

- `@decided` One generic Executor. The brief names the domain skills that it loads (`Skills: frontend, blue-team`).
  The Reviewer loads the same skills. The Executor does not guess them.
- `@decided` Reviewer, QA and the Security Lead stay separate agents, because their independence matters (R7).
- `@decided` Red team: the Executor with a `red-team` skill for the method, plus an agent definition with restricted
  tools and a blocking hook for the limits. The text of a skill alone is not a safety control.
- `@decided` This replaces the red team and blue team roles of D16. D37 keeps the Security Lead as an agent.
- `@decided` Each domain skill comes from research of 20 or more sources, a curation that the user approves, and evals
  at the level of `skill-creator`.
- `@decided` (the user, after the cold review) All domain skills of D25, D28, D29 and D36 stay in 0.2.0. The work is
  measured in agent time. The user's time is the approval of each curation, grouped in one session.
- `@decided` `allowed-tools` in a skill only pre-approves tools. A plugin subagent ignores `hooks`, `mcpServers` and
  `permissionMode` in its frontmatter. So the red team limit is the `tools` list of its agent plus a blocking hook in
  `hooks/hooks.json` that filters on `agent_type`.
- `@decided` (2026-11-09) `skill-creator` is a required dependency (`skill-creator@claude-plugins-official`). Verified
  on Claude Code 2.1.321: with the official marketplace added, both load. Without it, guilda installs but does not
  load. The README install adds the official marketplace first.
- `@proposed` (risk, 2026-11-10) An activation test covers the install without the official marketplace. D2 must
  tell the user that guilda did not load.
- `@proposed` guilda can create a new domain skill and add it to the triage table (D25).
- `@proposed` Starting points for the curation: `anthropics/skills`, `trailofbits/skills` (CC-BY-SA-4.0, needs care).
  Each third-party skill is audited before use.
- Research (Claude Code docs, Anthropic posts, OpenAI agent guide, Cognition, arXiv 2601.04748, 2505.18286,
  2503.13657): skills specialize one agent; skill choice gets worse with many similar skills.
- `@decided` (2026-11-10, the user, U2) `skill-creator` (anthropics/skills) and `superpowers` (obra/superpowers) are
  both required dependencies of guilda. Without their marketplaces, guilda does not load, so: the README gives one
  install command that adds both marketplaces and then installs guilda; a clear warning says how to check that guilda
  loaded; `guilda:init` checks both dependencies. `superpowers` as a required dependency is new: the 0.1.0 design
  (6.6) only named it as a related plugin.
- `@decided` (2026-11-10, the user, U1) 0.2.0 ships the levels `light` and `full`; E1 sets their gates later. This
  replaces the D1 item "the levels enter a release only after E1 runs".
- `@decided` (2026-11-10, the user, U5) The `blue-team` skill comes in 0.5.0, with the `red-team` skill and the
  Security Lead.

### D29 — AI engineering, for guilda and for user projects

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09.

- `@decided` No fourth group. Domain skills `ai-engineering` and `ai-evals`, built on `skill-creator` and
  `plugin-dev`. AI security goes to the Security group: a knowledge file with OWASP LLM01 to LLM10, a risk area `ai`,
  and red team tests through the `red-team` skill (0.5.0). promptfoo is an optional tool (D26 pattern).
- `@proposed` (2026-11-10) The `red-team` skill comes in 0.5.0. Until then, the injection tests of the gate use the
  injection test set of `ai-evals`.
- `@decided` Gate for an AI artifact (prompt, skill, agent) in any project. The Reviewer requires: an eval suite with
  3 or more real cases, a threshold written before, and a positive difference against a run without the artifact;
  direct and indirect prompt injection tests; tools at least privilege; a budget for cost, latency and tokens. QA
  runs the suite and attaches the report.
- `@proposed` (risk, 2026-11-10) The gate has a cost: 3 or more cases, a baseline run and injection tests for each
  AI artifact. The plan states this cost. At `light`, the gate runs once, at the end.
- `@open` Lab: a sample prompt with a tool, the suite at 0.8 or more in 3 runs, and planted bad versions rejected.

### D30 — A lean Architect with reference files

Status: `@decided` · Release: 0.2.0 · The user, 2026-11-09: "we must do the split".

After a compaction Claude Code keeps only the first 5,000 tokens of each skill, so the end of a large Architect file
is lost. Measured: `skills/architect/SKILL.md` is 121 lines, about 2,000 tokens.

- `@decided` A core Architect skill of about 140 lines: the role, the ARC rules one line each, D23 in full, the
  procedure with pointers, the triage table (D25), the short level table, and "Does not".
- `@proposed` Reference files in `skills/architect/reference/`, read only when a step needs them: `spec.md`,
  `brief.md`, `waves.md`, `lab.md`, `verdicts.md`, `qa-tools.md`. `pace.md` comes with the pace in 0.5.0.
- `@proposed` The Architect reads a reference again at each use, because a compaction can drop it.
- `@open` Lab: 5 fixed situations, one file against the split, 3 runs each. PASS: at least as correct, 25% fewer
  tokens or more, the correct reference in 14 of 15 cases.

### D31 — The Architect as its own agent

Status: `@decided` · Release: 0.4.0 · Proposed by the user, 2026-11-09; approved for 0.4.0 by the user after the cold
review, 2026-11-09.

The main session is light: it talks to the user and routes. The Architect is an agent with its own context. After a
step it stops; the main session resumes it by ID.

- `@decided` Until 0.3.x the Architect runs in the main session. From 0.4.0 it runs as its own agent. This replaces
  the Architect entry of the glossary and the Engineering group of D25 from that release.
- `@decided` A question about the state of the product goes to the Architect, or to a file that it writes.
- `@decided` Other agents can talk to the Architect through its address (D17). The reply goes back to the sender.
- `@decided` Before the build: a sender check, 3 runs of the scenarios, and the live session with the user.
- `@proposed` A decision of the user counts only when it comes from a channel that the user named as their own in
  `.guilda/config.json`. From any other agent, an answer is advice, and the decision still waits for the user.
- Lab `lab/architect-agent`: conditional GO, one run. A subagent has no `AskUserQuestion`, and the relay works. A
  subagent can dispatch and resume a child. The main session was 70% smaller; total tokens about the same; at list
  price about 12% more.
- Lab `lab/external-agent`: conditional GO for the Codex adapter. Codex hooks deliver messages; an immediate wake
  works only by a paste into a tmux pane. 29 messages, none lost.
- `@open` The larger lab runs before 0.4.0: more runs, a second scenario, a run long enough to compact.

### D32 — Name an agent, and the system takes the responsibility

Status: `@proposed` · Release: 0.3.0 · Proposed by the user, 2026-11-09.

- `@proposed` The user can name an agent by role ("the Architect") or by role and address ("Executor T3-exe-7f2a").
- `@proposed` Each agent action is recorded (D13, D14, D27). A sentence such as "Executor X made a mistake in the
  login screen" leads to the task, the brief, its blocks, the commits, the review and the log lines.
- `@proposed` The Architect collects those facts, finds the cause, and proposes the fix with the owner of each step.
  From 0.5.0 the foreman (D15) collects the facts. A rule change goes to the Architect; a user decision goes to the
  user (R12).
- `@replaced` "the `orchestrator`, or the Architect until 0.3.0". Replaced by: the release plan. The foreman comes in 0.5.0.
- `@open` The form of an agent name in text, so that it can be found and linked (D33).

### D33 — Click a reference, open the right place

Status: `@proposed` · Release: 0.4.0 · Proposed by the user, 2026-11-09.

A click on a reference (a decision ID, a rule ID, a block, a file, an agent name) opens the right document at the
right place, in the tool that the user works with.

- `@proposed` The block index (D27) maps each ID to its file and line. A reference becomes a link to that place.
- `@decided` (the user) guilda detects the environment (kitty, Zed, VS Code, OpenIDEA) and the user can override the
  choice for each project. The user does not use VS Code.
- `@decided` (the user) The preferred forms are terminal hyperlinks (formats E, F, G of the lab). A click opens the
  file at the line in a light view. Evidence verdict (2026-11-10): MORE DATA. The links lab saw terminal hyperlinks
  (OSC 8) shown as raw text inside Claude Code.
- `@proposed` (risk, 2026-11-10) A link can come from text that an agent read, so injected text can carry a link. A
  link opens only a file inside the project folder. Any other target is shown as text.
- `@proposed` Not verified: kitty open actions can match `file://` with a line fragment and open `less +<line>`.
- Lab `lab/links` (`docs/labs/2026-11-09-links.md`): in kitty a plain Ctrl+click does nothing by default; a
  `file://` link opens the folder, not the line.
- `@open` A PASS in each place: a click on D14 opens the right line in 3 of 3 tries.

### D34 — Lab report format

Status: `@proposed` · Release: 0.2.0 `@proposed` · Written by the Architect, 2026-11-10, from the lab reports of 2026-11-09 and
the data checklist of D25.

Each lab, experiment or spike writes one report `docs/labs/<date>-<name>.md` on its lab branch, in this form:

1. Title `# Lab: <question>`, then one header line: date, branch, spec and decision IDs, the agent ID of the agent that
   ran it (D19), the model and the account note.
2. `## Hypothesis`: one paragraph.
3. `## PASS criteria (written before the run)`: a table of check IDs; the main metric, the guard metrics, the
   smallest effect worth acting on, the number of runs, and a stop rule for the token use.
4. `## Method`: the arms, the fixture, the key, the order, the isolation of each attempt.
5. `## Evidence`: one subsection for each check. The raw data path, the command, the commit and the date. Median and
   mean, an interval when there are runs.
6. `## Not verified`: each check that did not run, with the reason.
7. `## Verdict`: GO, conditional GO, NO-GO or MORE DATA; the cost of a wrong call; whether it can be undone; "does
   not apply to".
8. `## Lessons`: the changes to the spec that the lab suggests.

The controller writes its own verdict in the register (D19). The report verdict is the agent's.

### D35 — Measure token use at every level

Status: `@decided` · Release: 0.3.0 `@proposed` (with the measure of D22) · The user, 2026-11-09.

- `@decided` Measure the token use of each task, of each spec block (D27), and of a whole session or build.
- `@decided` At the end of a build (for example a release), guilda writes a record with the total tokens and the cost
  in US dollars and in Brazilian reals.
- `@proposed` The costs come from the current price of each model, read from the official source at the time of the
  record, never from memory. The record states the price date and the exchange rate.
- `@proposed` Sources: the token counts in the log (D13), the usage that agent runs report, and the `cswap` usage.
- `@proposed` The data skill (D25) turns the record into information: cost per task, per block, per release, trend.
- `@proposed` (2026-11-10) Release of each part: all of D35 in 0.3.0. The user confirms this.

### D36 — Two lab skills for experiments

Status: `@decided` · Release: 0.2.0 (domain skills; the user, D28) · The user, 2026-11-09.

The Lab group (D25) gets two domain skills (D28). They can be one skill if research shows that is better.

- `@decided` Code experiments: try a dependency, a library, a framework or a technology against a real question of a
  project, in an isolated place, with PASS criteria written before (D19, D34).
- `@decided` AI experiments: try a plugin, a skill, an MCP server, an agent setup or a model against a real question,
  with evals and the gate of D29.
- `@open` Research before the build: 20 or more sources and a curation that the user approves (D28).

### D37 — The Security Lead is an agent that decides

Status: `@decided` · Release: 0.5.0 `@proposed` (with D16) · The user, 2026-11-09. It refines D16 and D28.

- `@decided` The Security Lead makes many decisions, so it is an agent, not a skill.
- `@decided` It decides security questions together with the Architect.
- `@decided` It can use the Lab (D25) to answer a security question before the build.
- `@decided` With the foreman (D15), it can run many agents that attack or defend the project's own system (the red
  team and blue team skills of D28, with the limits of D16 as law).
- `@decided` The plan gets its own part for the Security Lead: its tools and its knowledge, chosen with research.

### D38 — Resume after a usage limit, only in the same project

Status: `@decided` · Release: 0.5.0 `@proposed` (with the foreman) · The user, 2026-11-09. It adds to D15 (G5) and D22.

- `@decided` G5 stays: after a restart of the machine or the session, only the user starts the work again.
- `@decided` When the work stops because the usage of the accounts ran out, a scheduled trigger reads the reset times
  from the `cswap` fork, waits for an account with usage left, and resumes the stopped work.
- `@decided` The trigger resumes only the project that asked for the work, in that folder, with its own queue (D14).
  Each trigger records the project path and the work ID, and refuses to run on a mismatch.
- `@open` The mechanism (cron, systemd timer, a Claude Code scheduled task) and its limits.
- `@decided` A lab runs before this code is written (D19).


### D39 — Make the Reviewer stronger from alignment research `@decided`

Release: after the Lab is ready (D25, D34, D36), not before 0.2.0. Decided by the user on 2026-11-10.

- `@decided` Goal: make the Reviewer, and guilda in general, stronger with rules taken from alignment research, each
  one checked in the Lab with tests and an experiment first.
- `@decided` Sources, kept in `docs/research/2026-11-10-alignment/`: a video on an OpenAI misalignment case (summary
  with timestamps, not the full transcript), the user's own theoretical report (not published; the analysis cites
  it), 21 related items of alignment.openai.com, and a close read of the report "damaging the task environment to
  trigger a reset".
- Two opposite failure modes from the sources: a Reviewer that is too strict (false rejections, endless rework, wrong
  incentives) and a grader that approves without a check or fakes success instead of an honest failure.
- `@decided` Order: first the Lab and its skills are ready, then the experiments, then the rules. Nothing is built
  from this research before that.
- `@open` Which rules to test. Candidates seen in the sources, not yet decided: an honest "blocked" result that is
  never punished; agent output treated as untrusted data by the Reviewer (no instructions hidden in file names); a
  destructive action blocked at once by a hook, not only seen later; a Reviewer calibrated between strictness and
  friction.

## Experiments
- `@decided` (2026-11-10, the user) The same study covers D46 (truth first in every role): research more sources and
  test in the Lab how to make agents report the truth, in particular the Reviewer and the graders.

### E1 — Process levels

Status: `@decided` (to run) · Between 0.2.0 and later releases · The user, 2026-11-09.
Run the same feature at each level of D1 on the Glasshaus project. Measure defects found before and after merge,
tokens, time and user interventions. Output: the gates of each level.

### E2 — Persistent agent identity

Status: `@decided` (to run) · Before the build of D17 reuse · The user, 2026-11-09.
Compare an address bound to the same agent across tasks with a fresh agent for each task. Use planted defects in
the tasks and between the tasks. Measure defects found, tokens, time and compactions. No claim of a gain before the
result.

## Glossary proposals

`@proposed` (2026-11-10) New lines for `core/glossary.md`. The user approves them with the merge of the release that
first uses each term.

| Term | Release | Proposed line |
|---|---|---|
| foreman | 0.2.0 (name decided by the user, D15) | `- **foreman**: the background role that runs the work that the Architect designed, keeps the pace and the health of the flow, and does not own the project. Forbidden: orchestrator, leader, lead.` |
| field report | 0.2.0 | `- **field report**: the output of guilda:report, a report from a project to the guilda repository, apart from the reports of the Executor and of QA. Forbidden: feedback, bug report.` |
| lab report | 0.2.0 | `- **lab report**: the fixed output of a lab, in the form of D34, with the agent ID of the agent that ran it. Forbidden: findings doc, spike notes.` |
| block | 0.3.0 | `- **block**: one part of a spec with a stable ID (a decision, a task, a scenario), the unit that a link and a hash cover. Forbidden: chunk, snippet.` |
| agent ID | 0.3.0 | `- **agent ID**: the identifier that the host gives one agent run, recorded in the queue journal. Forbidden: agent name, handle.` |
| address | 0.4.0 | `- **address**: the code of one dispatch (task, role, short random part) that stays the same when the agent behind it changes. Forbidden: mailbox name, agent ID.` |

- `@open` "lead" as a forbidden word for `foreman` conflicts with the role name "Security Lead" and with the verb
  "lead". The `ste-check` script matches the word in any case. Options: forbid "lead" only as a role name in text, or rename the
  Security Lead.
- `@proposed` (2026-11-10) The 0.2.0 spec, section 3b, has six more lines for 0.2.0. The terms: `process level`,
  `security zone`, `review unit`, `domain skill`, `triage`, `mutant`.
- `@proposed` The `architect` line changes in 0.4.0 (D31): the Architect runs as its own agent, not in the main
  session.

### D40 — Compatibility: a core plugin and extension plugins `@decided`

Release: 0.2.0 (the split and the core); the other practices as listed. Decided by the user on 2026-11-10, after a
web research (Fowler "Tolerant Reader"; Kubernetes deprecation policy; Claude Code plugin dependencies and manifest
docs; VS Code extension manifest `engines`).

- `@decided` Two plugins in the guilda marketplace. `guilda` is the core: the laws, the hooks and the activation
  check. It has no dependency and works without `guilda:init`. An extension plugin holds the full process (skills,
  agents) and requires `skill-creator` and `superpowers` (U2) with version ranges. So the laws never turn off when a
  dependency is missing or broken.
- `@decided` The core works with no `.guilda/config.json` or with an invalid one: safe defaults, all laws on, and one
  clear notice ("guilda without init: laws on, default process"). Found in 0.1.0: `scripts/hooks/pre-tool-use.mjs`
  returns early when the config is missing or invalid, so the R19 scan is off exactly when init failed. A law must
  fail closed. `@proposed` fix in 0.1.1.
- `@proposed` Tolerant reader: each reader of a guilda file (config, briefs, verdicts, CHANGELOG, queue) accepts the
  current and the earlier format, ignores unknown fields, and uses a default for a missing field.
- `@proposed` No change in place: a rule that changes meaning gets a new ID; the old ID is marked deprecated, points
  to the new one, and still works for one release. This would replace the in-place rewrites of R24, R11 and R13 in
  0.2.0, and remove the need to run `guilda:init` again for them.
- `@proposed` Each state file has a `schemaVersion`. `guilda:init` and `guilda:update` run migrations that are safe to
  run again.
- `@proposed` Dependencies with version ranges (for example `^2.0`), resolved by the `{name}--v{version}` tags.
- `@proposed` Compatibility tests: fixtures of each published version (config, briefs, CHANGELOG) and an update test
  from each published version. A test runs the laws in a project with no `.guilda/` folder.
- `@open` Not verified: whether the Claude Code plugin manifest has a minimum host version field. If not, guilda checks
  that a feature exists instead of a version number.

### D41 — An agent creator at the level of skill-creator `@decided`

Release: `@proposed` 0.2.0, with the AI engineering skills (D29). Decided by the user on 2026-11-10.

- `@decided` guilda needs an agent creator with the same quality as `skill-creator`: it creates or changes an agent
  (a subagent definition: role text, tools, model, limits), and it measures the agent with evals before the agent
  is used.
- `@proposed` The same loop as `skill-creator`: test cases written first, runs with and without the new agent, graded
  assertions, a viewer of the results, tokens and time of each run, and iterations until the threshold passes.
- `@proposed` It also checks what only an agent has: the tool list at least privilege (OWASP LLM06, D29), the model
  and its cost, the limits that must be laws (hooks in the plugin `hooks/hooks.json`, because a plugin agent ignores
  `hooks` in its frontmatter, D28), and that the output format passes the guilda format checks.
- `@open` Start point: the `agent-creator` agent of the official `plugin-dev` plugin (D29 research) is a generator
  with no eval loop. Build on it, or write a new skill. Research and a curation of sources (20 or more, approved by
  the user) come first, as for each research skill.

### D42 — DevOps: an advisor agent, a skill and a production lock `@decided`

Release: `@proposed` 0.2.0 for the skill; the agent and the lock with it. Decided by the user on 2026-11-10.

- `@decided` DevOps is in the Engineering group. It has its own agent that helps the Architect decide on deploy and
  infrastructure, for example "serverless or a VPS for this system?". This is like the Security Lead (D37): a role
  that decides is an agent; the knowledge is a skill.
- `@decided` A domain skill `devops`: CI/CD pipelines, infrastructure, diagnosis from server logs (with the data skill
  of D25).
- `@decided` An action in production (deploy, rollback, an infrastructure change) runs only through an agent with
  restricted tools, and a hook refuses it without the user's explicit approval (R12).

### D43 — Skills isolated by role group `@decided`

Release: `@proposed` 0.2.0. Decided by the user on 2026-11-10.

- `@decided` Each skill belongs to one role group (Engineering, Lab, Security). An agent loads only the skills of its
  own group. For example, an Engineering Executor cannot load the `red-team` skill.
- `@proposed` A hook enforces it: it refuses a skill call from an agent outside the skill's group. `@open` Not
  verified: whether a Claude Code hook can see and refuse one specific skill call. A lab checks it before the build.
- `@open` Skills that more than one group needs (the data skill, `ai-evals`, `lab-experiment`): one copy in each group,
  or an explicit shared group. To decide with the 0.2.0 checklist.
- `@decided` (2026-11-10, the user) The isolation is about which skills an agent loads. Groups still work together
  through the Architect: for example, the AI group asks the Lab to run an experiment.

### D44 — The Architect plans each skill and calls the area leads `@decided`

Release: `@proposed` 0.2.0 (Architect procedure). Decided by the user on 2026-11-10.

- `@decided` For each use of a skill or a role, the spec and the plan say: when it is used, who calls it, where (the
  step or the task), and what it must deliver. A skill with no such line is not used.
- `@decided` In the process, the Architect calls the lead of each area to decide with it: the Security Lead (D37), the
  DevOps advisor (D42), and the leads of other groups.

### D45 — AI is a fourth role group `@decided`

Release: `@proposed` 0.2.0 for the group and its skills. Decided by the user on 2026-11-10.

- `@decided` AI is a role group of its own, next to Engineering, Lab and Security, because this area will grow. Replaced
  by this: the D29 item "No fourth group" and the D25 statement "three groups, for now".
- `@decided` (corrected 2026-11-10 by the user) The AI group builds AI features: harnesses, prompt engineering,
  agents and skills (with `agent-creator`, D41, and `skill-creator`), and checks against prompt injection and the
  other failures seen in the alignment research (D39).
- `@proposed` (an idea, registered for later) The AI group keeps reading alignment sources, such as the OpenAI
  alignment reports, and brings new lessons to the Architect.
- `@decided` (corrected again 2026-11-10 by the user) The Lab is the place to test and study anything: a large research
  on an idea, articles, experiments on platforms, and the processing of a large volume of data to reach a conclusion.
  It is a full role group with its own skills and space. Its data skill (D25) serves all of this, not only small
  measures. Earlier texts limited the Lab; this replaces them. There is no separate data engineer
  in the AI group; an earlier text of this decision said so by mistake.
- `@decided` Groups work together in one process that the Architect leads. The AI group uses the Lab to test an idea,
  and the Lab data skill processes that data. D43 isolates which skills an agent loads; it does not stop groups from
  working together.
- `@open` Where the estimate of consumption before a build lives (the AI group, or the Lab as an experiment).
- `@proposed` The estimate method: run a small real sample (3 to 5 runs), measure the real tokens, multiply by the
  expected volume with a range, convert with the official price of the day, and compare models.
- `@decided` (2026-11-10, the user) AI security (prompt injection, OWASP LLM Top 10, an agent that acts outside the
  request) stays in the Security group, with the Security Lead as the one owner of risk. The AI group builds with the
  defenses and asks the Security Lead, through the Architect, to check them.
- `@decided` (2026-11-10, the user) The AI group gets a lead agent, like the Security Lead: it decides on AI with the
  Architect (harness design, model and cost, an agent or a simple prompt, when to call the Lab) and, as a lead, it can
  disagree with the user (D46) and speak in a council (D47).

### D46 — Truth first, and disagree when needed, in every role `@decided`

Release: `@proposed` 0.2.0, as a core principle that every role loads. Decided by the user on 2026-11-10.

- `@decided` Every role stays faithful to the truth: it reports what the evidence shows, with its limits, and never
  makes a result look better to please the user, the Architect or another agent.
- `@decided` Every role disagrees when it has a reason, also with the user: it gives the disagreement, the reason and
  the evidence. Then the person who owns the decision decides (R12).
- `@decided` This is intrinsic to guilda: in the core rules, in each role, in each project that uses guilda.
- Today this exists only in parts: R14 (only the Architect must disagree), R5 (memory is a guess), R6 (evidence).
  `@proposed` One core rule that covers every role, with these as its parts, so that it is not only the Architect's
  duty.
- Why: the alignment research (D39) shows the failure that this stops: a grader that preferred a fake success to an
  honest failure. A biased process builds a wrong product.
- `@decided` (2026-11-10, the user, narrows the second item) Only the leads disagree with the user and argue: the
  Architect, the Security Lead, the DevOps advisor, and the leads of the other groups. Other roles (Executor, QA and
  the like, often on a small model) do not argue with the user. Replaced by this: the scope "every role" of the
  disagreement item.
- `@decided` Truth stays for every role: no role makes a result look better or hides a failure. A role that is not a
  lead reports a problem or an objection to the lead of its group, and the lead decides if it goes to the user. The
  alignment case of D39 was a common role (a grader) that preferred a fake success, so truth cannot be only the
  leads' duty.
- `@decided` (2026-11-10, the user) How to make truth real in each role is not decided: today it is only an
  assumption. It is studied in the Lab with more sources, together with the Reviewer work of D39 and the OpenAI
  alignment documents (`docs/research/2026-11-10-alignment/`). The core rule text waits for that study.

### D47 — The guild council (Cúpula da Guilda) `@decided`

Release: `@proposed` 0.5.0 or later (it needs the bus of D17, 0.4.0, and the leads of D37, D42, 0.5.0). Decided by the
user on 2026-11-10.

- `@decided` A council is a live group chat between the leads of one problem (and the user and the Architect), on the
  bus of D17: the leads talk in one shared channel, answer each other and disagree with reasons and evidence (D46).
  The user makes the final decision (R12). A council record (the question, each lead's position, the decision and why)
  enters the decisions register.
- `@decided` A council is only for a real and serious problem. It uses many tokens (each lead is an agent with its own
  context), so it is a strong measure.
- `@decided` A lead can ask for a council. The Architect refuses the request when it does not make sense: the problem
  is not that large, it can be solved without a council, or a question to the user is enough.
- `@decided` The user gives the final yes to open a council ("ok, open the council"). Nothing starts before it.
- `@proposed` Starting points to study: the user's local agent chat project (agents in one chat through MCP) and Claude
  Code agent teams (experimental; teammates send messages to each other).
- `@open` The English name of the feature in the plugin (for example `council`), and how the user and the Architect
  open it.
- `@decided` (2026-11-10, the user) A council has order, like a court. Nobody speaks without the floor. A separate
  Judge agent runs it: it opens the session, gives the floor in turn ("now the DevOps advisor", "now the Security Lead",
  "now the user"), and closes it. The Judge has no view on the merit; the user decides the outcome (R12). It runs on a
  small model and belongs to the Engineering group.
- `@decided` Two formats: adversarial (one lead attacks an idea, another defends it, in turns) or a debate (the Judge
  orders the turns).
- `@decided` A speaker can call another lead to answer by marking it in the chat. The Judge grants that voice or not.
- Why a separate Judge and not the Architect: in a council the Architect is also a party (it has a view, and it is
  sometimes the side under attack).
- `@decided` (2026-11-10, the user) A council skill is given to each agent that takes part. It holds the council
  rules and an argument style that makes sense (for example a claim, its evidence and its reason).
- `@open` To research (sources on short structured argument, for example claim-evidence-reasoning or the Toulmin
  model, and on debate formats) and to test in the Lab: one council with the skill against one without, measured by
  the quality of the decision, the turns and the tokens.
- The conflict with D43 (leads of every group load the council skill) is solved by the council group above.
- `@decided` (2026-11-10, the user) The council is a small role group of its own, like a court (a fifth group). The
  council skill and the Judge belong to it. A lead that joins a council acts as a member of the council group while it
  runs, so it can load the council skill. This removes the conflict with D43.
- `@decided` A council can happen at any time of the development, but only while the user is present. If the user is
  away, the council waits until the user comes back (D48).

### D48 — User presence: away mode `@decided`

Release: `@proposed` with the queue (D14) and the supervisor (D15). Decided by the user on 2026-11-10.

- `@decided` The user can say "I am away now" or "I am away for N hours". The work goes on.
- `@decided` (corrected 2026-11-10 by the user) Only the Architect knows that the user is away. Other agents are not
  told, so that they do not act differently (the alignment research of D39 shows that a model can act differently
  when it knows it is watched or not). `@proposed` The supervisor does not need to know: it sees held tasks and keeps
  the rest of the flow going.
- `@decided` (corrected 2026-11-10) The absence is never written in the queue or in any project file, because agents
  read those files and it would leak. It stays only in the Architect's conversation.
- `@decided` While the user is away, each decision that belongs to the user (R12) waits. Its task goes to a generic
  `held` state of the queue (D14). `held` is also used for other reasons (a dependency not ready, a missing resource,
  a pending decision while the user is present), so it does not show why a task waits; only the Architect knows the
  reason. The other tasks go on. A council (D47) waits too.
- Limit: when the Architect is its own agent (D31, 0.4.0), Claude Code keeps its transcript on disk. An agent could
  read it, but it would have to look outside the project. The Lab study below covers this.
- `@decided` When the user comes back, the Architect gives the waiting decisions one at a time, through the question
  tool (D23).
- `@open` For the Lab, with the study of D46: hiding the absence is easy (it is not in the briefs), but an agent that
  gets no answer for hours can guess it. Test whether this changes how agents act.
- `@decided` (2026-11-10, the user) The Architect's memory alone is not enough: a compaction can drop it. The away
  state is held by code and enforced by a hook.
- `@decided` (2026-11-10, the user) No `/away` command. The user says it in plain words: the user mentions the
  Architect in the main session (for example `@architect I will be away, take care of things`), and the message goes
  straight to the Architect. The Architect answers and records the away state by code (an internal script), so the
  hook still holds when a compaction drops the Architect's memory.
- `@decided` The return is found by itself when the user interacts in the chat. The user can also say "I am back".
- `@decided` The Architect knows, and it gets an explicit instruction: do not change your behavior because the user is
  away; manage the situation (the same care and rigor; only the decisions that need the user wait). `@open` To study in
  the Lab with D46 and D39 (a model can act differently when it knows it is not watched).
- `@proposed` The state lives in a file outside the project. A hook refuses any agent's attempt to read that file.
- `@proposed` While the user is away, a hook refuses each action that needs the user (open a council, ask a decision
  that belongs to the user, publish), with a neutral reason ("this waits; go on with the rest"), and tells the
  Architect. The Architect knows the real reason and guides the supervisor without saying it ("this does not happen
  now; put it in `held` and go on").
- Limits, for the Lab: an agent can try to read the file in ways the hook does not see (for example a path built from
  variables), so the hook catches common cases, not all. Until 0.4.0 the Architect runs in the main session, with no
  agent ID; the hook knows it as the main session.

### D49 — Mention an agent in the main session to talk to it directly `@decided`

Release: `@proposed` with D31 (0.4.0). Proposed on 2026-11-10 from the user's request.

- `@decided` (2026-11-10, the user) The user mentions an agent in the main session (for example `@architect ...` or
  `@security-lead ...`) and the message goes straight to that agent, which answers at once. It is part of the
  communication pattern of D17 (addresses and the bus): the mention is the address. The user uses it to talk to the
  agents and the leads, also to ask a lead for a direct opinion.
- `@proposed` A mod sees the prompt before the model and routes it.
- Different from D32 (mention an agent to trace its work) and from the native subagent panel (select the agent and
  press Enter, which the user confirmed works).
- `@open` Lab: can a mod route a prompt to a named agent (prompt submit hook plus `SendMessage` or the bus of D17)?
