# Glossary

This glossary is the controlled dictionary of guilda (ASD-STE100). It holds the process terms.
The project glossary, `docs/superpowers/specs/GLOSSARY.md`, holds the domain terms of each project.

Each term has one definition and a list of forbidden words. Use the term. Do not use a forbidden word for the thing the term names (R16).
Each line has this format: `- **<term>**: <definition>. Forbidden: <word>, <word>.`

## Process terms

Source: guilda design, sections 6 and 7.

- **brief**: the fixed task text that the Architect writes for one Executor, with its file list, contract, tests and Acceptance criteria. Forbidden: ticket, assignment.
- **spec**: the design document of one feature, with its Acceptance scenarios, that the user approves in a separate message. Forbidden: specification draft, requirements document, PRD.
- **plan**: the ordered list of tasks that builds a spec, kept as a `## Plan: Part N` section of the feature MD. Forbidden: to-do list, schedule.
- **executor**: the agent that writes the code of one brief. Forbidden: implementer, developer, coder.
- **reviewer**: the agent that compares the diff with the brief and the spec and writes a verdict. Forbidden: inspector, checker.
- **QA**: the agent that tests the running product and reports one result for each Acceptance scenario. Forbidden: tester.
- **security**: the optional agent that reviews the diff of a task in a risk area, and points at problems but never edits. Forbidden: auditor, pentester.
- **architect**: the role that writes the spec, the plan and the briefs, and runs in the main session. Forbidden: planner, designer.
- **controller**: the main Claude Code session, which dispatches each role as a subagent and integrates the results. Forbidden: orchestrator, coordinator.
- **lab**: an experiment in an isolated branch that tests a concept with a measurable PASS before the build starts. Forbidden: playground, POC.
- **verdict**: the fixed output of the Reviewer or Security, with a `Result:` line and a `Violations:` line. Forbidden: feedback, opinion.

## Approval of the terms

The user approves each term list. The user approves the core list when the user merges its pull request to guilda.
The Reviewer rejects a forbidden word only after the user approves the list. Before the approval, the Reviewer records the word as a note.

## Examples

- Wrong: `The implementer sends the ticket to the checker.`
- Right: The Executor sends the diff to the Reviewer.
