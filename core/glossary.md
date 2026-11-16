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

## Approval of the terms

The user approves each term list. The user approves the core list when the user merges its pull request to guilda.
The Reviewer rejects a forbidden word only after the user approves the list. Before the approval, the Reviewer records the word as a note.

## Examples

- Wrong: `The implementer sends the ticket to the checker.`
- Right: The Executor sends the diff to the Reviewer.
