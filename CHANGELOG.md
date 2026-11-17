# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with the 0.x rule of `RELEASING.md`. Each entry lists
the rule IDs that changed. The plan for the next releases is in `ROADMAP.md`.

## [Unreleased]

## [0.2.0] - 2026-11-17

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
- The extension plugin `guilda-skills`, with `superpowers` and `skill-creator` as dependencies. It has no domain
  skill yet.
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
- ARC4 is a law: a dispatch from the main session names its guilda agent.
- A rule changes in place, so no project runs `guilda:init` again. `guilda:update` saves the new version and the
  0.2.0 config form (`schemaVersion` 2).
- The CHANGELOG uses the Keep a Changelog form. `scripts/changelog.mjs` reads the new headings and the old ones.
- `RELEASING.md`: while the major number is 0, a core rule that changes meaning raises the minor number. Each tag
  gets a GitHub release with notes.

### Fixed

- R4 also refuses a plan file that a Bash command creates.

### Not in this release

- R29 (production commands need the user's approval) moved to 0.3.0. The ID R29 stays reserved.
- The domain skills SK1 to SK8 of the extension plugin wait for the curation of their sources.

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

[unreleased]: https://github.com/JohnGabie/guilda/compare/guilda--v0.2.0...HEAD
[0.2.0]: https://github.com/JohnGabie/guilda/compare/guilda--v0.1.1...guilda--v0.2.0
[0.1.1]: https://github.com/JohnGabie/guilda/releases/tag/guilda--v0.1.1
[0.1.0]: https://github.com/JohnGabie/guilda/releases/tag/guilda--v0.1.0
