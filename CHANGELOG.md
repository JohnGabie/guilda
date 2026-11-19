# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with the 0.x rule of `RELEASING.md`. Each entry lists
the rule IDs that changed. The plan for the next releases is in `ROADMAP.md`.

## [Unreleased]

## [0.3.1] - 2026-11-19

### Fixed

- R32: the queue-file check takes out a heredoc body only for a plain chain. Each part of the chain starts with
  cat, tee, mkdir, touch, echo, cd, ls or true. Any other text keeps the body, so a PATH change cannot hide a write.
- R32: the read of the queue journal refuses a symbolic link, a hard link and a FIFO. The check also covers the
  .guilda and .guilda/queue folders, as the writers do.
- `status.mjs` prints the io-error prefix one time.
- R13: the bare-ID check of a question skips an ID-like part of a file name, for example S3.md.

## [0.3.0] - 2026-11-19

### Added

- New rules: R31 and R32. R31: each plan task and each brief cites the blocks that it uses, with a hash. R32: one
  writer for the queue.
- The block index and the citation check: `scripts/trace.mjs` (`index`, `check`, `show`, `ack`).
- The task queue and the signal script: `scripts/queue.mjs` and `scripts/signal.mjs`. A worker writes its signals,
  and `signal.mjs run` wraps an external command.
- The identity hook: it binds a queued dispatch to the agent that runs it. The audit log `.guilda/audit.jsonl`
  records the tool calls of each subagent.
- The status script `scripts/status.mjs`, and the file `.guilda/status.md` that the queue script writes for other
  tools. `status.mjs --agent <name>` shows one agent.
- The cost record: `scripts/cost.mjs` writes the tokens and the cost of each task, block and build at list price.
- The `guilda-panel` plugin entry in the marketplace, with the shared version. The panel module is not in this
  release.
- The eval result cache: `scripts/eval-run.mjs` keeps a passed eval case.

### Changed

- The Reviewer runs the trace check and can ask questions (R31).
- The Architect runs the queue and records each run (R32).
- The tier of each role is pinned by a test, `tests/tiers.test.mjs`. The tiers are the same as in 0.2.0.
- R17: research files and lab files may quote model names and prices as dated records.

### Not in this release

- The `doctor` status line and the Codex checks of the status file: not in this release.
  They wait for live labs. They move to 0.3.1.
- The agent panel module: not in this release.
- The production approval rule R29: not in this release.
- The cheaper tier for a role: lab L7 gave NO-GO, and the tiers stay as they are.

## [0.2.0] - 2026-11-19

### Added

- New rules: R26, R27, R28 and R30. R26: labs run in a dispatched agent. R27: truth first. R28: tell the user when
  guilda is not set up. R30: skills by role group.
- New rule IDs in `guilda:architect`: ARC7 to ARC10. ARC7: concrete scenarios. ARC8: one owner task for each
  decision. ARC9: a mutant for each new test. ARC10: a glossary for each new term.
- Two process levels, `light` and `full`, set in `.guilda/config.json` (`process` and `explain`). `guilda:init`
  asks for the level. A project with no setting runs `full`.
- `guilda:report`: a field report skill. It scrubs private data and files an issue the user approves.
- `guilda:lab` and the lab roles: `lab-researcher`, `lab-experimenter` and `lab-reader`, with a lab report
  template (R26).
- `scripts/doctor.mjs`: an activation check of the installed plugins and of the project layer.
- The extension plugin `guilda-skills`, with `superpowers` and `skill-creator` as dependencies. It has eight skills:
  - `data`: turn raw data and lab results into a verdict.
  - `ai-engineering`: design, write and review a prompt, an LLM call or an agent.
  - `ai-evals`: write, run and grade the eval suite of an AI artifact.
  - `lab-experiment`: run an experiment or a spike and give a verdict.
  - `devops`: CI/CD, infrastructure code, deploy and rollback plans.
  - `ai-data`: estimate and report the tokens and the cost of an AI feature.
  - `agent-creator`: create, change and review a subagent definition.
  - `security-zones`: decide which spec blocks are security zones.
- The plugin `ios-on-linux`: control a real iPhone from a Linux PC.
- Four new agents: `architect-executor`, `ai-lead`, `coherence-validator` and `devops-advisor`.
- Role groups, and the R30 hook: a `Skill` call is checked against the role group of the agent (R30).
- An AI artifact gate in the Reviewer and in QA. A prompt, a skill or an agent file is checked with a tool.
  It must pass a suite of runs before approval.
- `scripts/bump-version.mjs`: one version for the three plugins, with `--check` and `--audit`.
- `THIRD-PARTY-NOTICES.md`: the MIT notice for the pieces adapted from `superpowers`.
- The decision register (D1 to D50, E1, E2), the 0.1.1 and 0.2.0 specs, and a backlog for 0.3.0 to 0.5.0.
- `ROADMAP.md`, with one GitHub milestone for each release.
- `skill-creator` is a plugin dependency of the extension plugin. The core plugin has no dependency (D40).

### Changed

- R4: one MD for each feature. The plan is a `## Plan: Part N` section of it, or one plan file next to it.
- R11: rejections are counted for each review unit. A small or a large rejection; 3 rejections escalate.
- R13 and ARC1: decisions go through the question tool, one decision at a time.
- R24: one review cycle for each review unit, by process level.
- EXE2: the new test fails against the old code first.
- The task brief format: `Base commit:` is a required field.
- The version notice sends the user to `guilda:update`.
- ARC4 is a law. The main session may dispatch `guilda:*`, `Explore` and `Plan`. It may also dispatch the types
  that the user lists in the new config key `dispatch.agentTypes`. Each other type is refused.
- R20 is a law. In a project with `.guilda`, a hook refuses `rm` with a force or recursive flag. The hook reads
  the Bash call of a subagent. `scripts/lab-env.mjs` makes a safe temporary folder for a lab.
- Task worktrees are durable. They live in `../<repo>.worktrees/`, and `task-start --worktree` makes one.
- A rule changes in place, so no project runs `guilda:init` again. `guilda:update` saves the new version and the
  0.2.0 config form (`schemaVersion` 2).
- The CHANGELOG uses the Keep a Changelog form. `scripts/changelog.mjs` reads the new headings and the old ones.
- `RELEASING.md`: while the major number is 0, a core rule that changes meaning raises the minor number. Each tag
  gets a GitHub release with notes.

### Fixed

- R4 also refuses a plan file that a Bash command creates.

### Not in this release

- R29 (production commands need the user's approval) moved to 0.3.0. The ID R29 stays reserved.

### Known gaps

- The R20 hook does not see an `rm` hidden in a variable or in a script file that `bash` runs.
  It does not see an `rm` in a remote command.
- The turn budgets of two skill eval suites are provisional until lab #58.

## [0.1.1] - 2026-11-10

### Fixed

- Fix: the QA report check keeps a scenario line with a colon, and an unindented continuation line, in the `Scenarios` section (D4, issue #6). No rule IDs changed.
- Fix: `lint-rules` accepts a blank line after a rule title and between `Rule:`, `Why:` and `Check:` (D11, issue #13). No rule IDs changed.
- Fix: the README says when a project-scope install loads (D2, issues #2 and #11).
- Fix: when `.guilda/config.json` is missing or invalid, the laws R4, R18, R19 and ARC6 run with safe defaults (D40).
  The session start tells the user. With no `.guilda/` folder, the laws do not run, as in 0.1.0. A refusal creates no folder. No rule IDs changed.
- Fix: `guilda:update` reads the old and the "Keep a Changelog" heading forms, for the update to 0.2.0.

## [0.1.0] - 2026-11-02

### Added

- Plugin skeleton and marketplace entry. No rule IDs changed.
- Core rules, roles, hooks, `guilda:architect`, `guilda:init` and `guilda:update`. New rule IDs: R1 to R25, and ARC1
  to ARC6 in `guilda:architect`. The brief check of the Executor dispatch cites ARC6, not R3.

[unreleased]: https://github.com/JohnGabie/guilda/compare/guilda--v0.3.1...HEAD
[0.3.1]: https://github.com/JohnGabie/guilda/compare/guilda--v0.3.0...guilda--v0.3.1
[0.3.0]: https://github.com/JohnGabie/guilda/compare/guilda--v0.2.0...guilda--v0.3.0
[0.2.0]: https://github.com/JohnGabie/guilda/compare/guilda--v0.1.1...guilda--v0.2.0
[0.1.1]: https://github.com/JohnGabie/guilda/releases/tag/guilda--v0.1.1
[0.1.0]: https://github.com/JohnGabie/guilda/releases/tag/guilda--v0.1.0
