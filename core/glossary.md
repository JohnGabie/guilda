# Glossary

This glossary is the controlled dictionary of guilda (ASD-STE100). It holds the process terms.
The project glossary, `docs/superpowers/specs/GLOSSARY.md`, holds the domain terms of each project.

Each term has one definition and a list of forbidden words. Use the term. Do not use a forbidden word for the thing the term names (R16).
Each line has this format: `- **<term>**: <definition>. Forbidden: <word>, <word>.`

## Process terms

Source: guilda design, sections 6 and 7.

- **brief**: the fixed task text that the Architect writes for one Executor, with its file list, contract, tests and Acceptance criteria. Forbidden: ticket, assignment.
- **spec**: the design document of one feature, with its Acceptance scenarios, that the user approves in a separate message. Forbidden: specification draft, requirements document, PRD.
- **plan**: the ordered list of tasks that builds a spec, kept as a `## Plan: Part N` section of the feature MD, or in `<feature>.plan.md` next to it. Forbidden: to-do list, schedule.
- **executor**: the agent that writes the code of one brief. Forbidden: implementer, developer, coder.
- **reviewer**: the agent that compares the diff with the brief and the spec and writes a verdict. Forbidden: inspector, checker.
- **QA**: the agent that tests the running product and reports one result for each Acceptance scenario. Forbidden: tester.
- **security**: the optional agent that reviews the diff of a task in a risk area, and points at problems but never edits. Forbidden: auditor, pentester.
- **architect**: the role that writes the spec, the plan and the briefs, and runs in the main session. Forbidden: planner, designer.
- **controller**: the main Claude Code session, which dispatches each role as a subagent and integrates the results. Forbidden: orchestrator, coordinator.
- **lab**: an experiment in an isolated branch that tests a concept with a measurable PASS before the build starts. Forbidden: playground, POC.
- **verdict**: the fixed output of the Reviewer or Security, with a `Result:` line and a `Violations:` line. Forbidden: feedback, opinion.
- **process level**: the value of the process field in .guilda/config.json, light or full, that sets the review cycle and the gates but never a law. Forbidden: process mode, process profile.
- **security zone**: a spec block that the Architect marks because it touches a risk area, and that gets a Security review at each process level. Forbidden: hot spot, sensitive area.
- **review unit**: the work that one Reviewer cycle covers and that the rejections count against: a task at full, the integration at light. Forbidden: review batch, review scope.
- **domain skill**: a skill with the knowledge of one area that a brief names in its Skills field, and that the Executor and the Reviewer both load. Forbidden: specialist agent, area agent.
- **triage**: the step before each brief that sends an open question to the Lab, a risk area to Security, and a decided change to Engineering. Forbidden: task routing, intake.
- **mutant**: one named change to the product code that makes a new test fail, classified as killed, survived or equivalent. Forbidden: bug injection, fault seed.
- **field report**: the output of guilda:report, a report from a project to the guilda repository, apart from the reports of the Executor and of QA. Forbidden: feedback, bug report.
- **lab report**: the fixed output of a lab, in the form of D34, with the agent ID of the agent that ran it. Forbidden: findings doc, spike notes.
- **Lab group**: the role group that researches, runs experiments and studies data for the other groups (D25, D45); one run of it is a lab. Forbidden: research team, lab team.
- **block**: one part of a spec with a stable ID (a decision, a task, a scenario), the unit that a link and a hash cover. Forbidden: chunk, snippet.
- **agent ID**: the identifier that the host gives one agent run, recorded in the queue journal. Forbidden: agent name, agent handle.
- **address**: the name of one dispatch, one joined agent or one fixed role on the bus, that stays the same when the agent behind it changes. Forbidden: mailbox name, agent handle.
- **mailbox**: the append-only file of one address in `.guilda/bus/`, with the messages to that address and their receipts. Forbidden: inbox, message box.
- **binding table**: the table, derived from the queue journal, that maps each address to the agent and the sessions that run it. Forbidden: registry, agent map.
- **user channel**: an address whose prompts count as the words of the user; in 0.4.0 only `main`. Forbidden: owner channel.
- **user record**: one line that a hook writes for a user prompt or a question answer, with a code that `verify` checks. Forbidden: user log.
- **queue journal**: the append-only file .guilda/queue/journal.jsonl that records each task, dispatch, signal and state change, with one writer. Forbidden: job log, task list.
- **signal**: a file that a worker writes under .guilda/queue/signals/ to say that it started, that it is alive, or that it ended. Forbidden: ping, beacon.
- **audit log**: the file .guilda/audit.jsonl with one line for each tool call of a subagent, with no command text and no file content. Forbidden: activity log, tool log.
- **block index**: the generated file .guilda/trace/index.json that maps each block ID to its file, its line range, its hash and its citers. Forbidden: spec map, ID table.
- **cost record**: the file that the cost script writes at the end of a build, with the tokens and the cost of each task, block and build. Forbidden: bill, invoice.
- **supervisor**: the session that holds the claim of the queue and keeps the pace of the build; it is not the owner of the product. Forbidden: boss, manager, overseer.
- **claim**: the file writer.json of the queue, which names the one session that may write the queue while that session is live. Forbidden: lock, lease.

## Approval of the terms

The user approves each term list. The user approves the core list when the user merges its pull request to guilda.
The Reviewer rejects a forbidden word only after the user approves the list. Before the approval, the Reviewer records the word as a note.

## Examples

- Wrong: `The implementer sends the ticket to the checker.`
- Right: The Executor sends the diff to the Reviewer.
