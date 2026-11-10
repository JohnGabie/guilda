# Roadmap

Each release has one theme. Each release works alone, and the next one builds on it. Each release has a GitHub
milestone with its issues. The decisions are in the
[decision register](docs/superpowers/specs/2026-11-09-guilda-decisions.md), which stays the source of truth. Specs:
[0.1.1](docs/superpowers/specs/2026-11-09-guilda-0.1.1.md), [0.2.0](docs/superpowers/specs/2026-11-09-guilda-0.2.0.md),
[backlog 0.3.0 to 0.5.0](docs/superpowers/specs/2026-11-09-guilda-backlog.md).

## 0.1.1 — fixes

[Milestone 0.1.1](https://github.com/JohnGabie/guilda/milestone/1)

Fix the QA report parser and `lint-rules` with formatters. The README says when a project-scope install loads. The
laws run when `.guilda/config.json` is missing or invalid.

## 0.2.0 — process

[Milestone 0.2.0](https://github.com/JohnGabie/guilda/milestone/2)

Process levels `light` and `full`, an activation check, decisions through the question tool, and the field report
skill. Role groups, one Executor with domain skills, AI engineering skills, and a lean Architect.

A core plugin that always loads and works without `guilda:init`, and an extension plugin with the full process. Rules
change in place with migrations. No project runs `guilda:init` again. An agent creator, a DevOps skill and
advisor, and an AI role group with its lead. Skills isolated by role group, and truth first in every role. Labs gate
their parts before the build of each part.

## 0.3.0 — traceability and state

[Milestone 0.3.0](https://github.com/JohnGabie/guilda/milestone/3)

A block index with content hashes, agent identity, an audit log and a task queue. An agent panel, a status script
and token measures in tokens and money.

## 0.4.0 — the Architect outside the main session

[Milestone 0.4.0](https://github.com/JohnGabie/guilda/milestone/4)

The Architect as its own agent. An agent bus with a clear life cycle, clickable references, and a Codex adapter.
A mention that sends a message to one agent from the main session.

## 0.5.0 — supervisor and pace

[Milestone 0.5.0](https://github.com/JohnGabie/guilda/milestone/5)

A supervisor that keeps the flow running, and a pace from account usage. A resume after a usage limit. The Security
Lead as an agent, with a red team. A guild council of the leads, and an away mode for the user.

Experiments E1 and E2 run between releases. Each lab with a conditional GO gets a larger run before 1.0.
