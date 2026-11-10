# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with the 0.x rule of `RELEASING.md`. Each entry lists
the rule IDs that changed. The plan for the next releases is in `ROADMAP.md`.

## [Unreleased]

### Added

- The 0.2 design: decisions D1 to D33, experiments E1 and E2, and a release plan from 0.1.1 to 0.5.0.
- `skill-creator` is a required plugin dependency. The README install adds the official marketplace first.
- `ROADMAP.md`, with one GitHub milestone for each release.

### Changed

- The CHANGELOG uses the Keep a Changelog form. `scripts/changelog.mjs` reads the new headings and the old ones.
- `RELEASING.md`: while the major number is 0, a core rule that changes meaning raises the minor number. Each tag
  gets a GitHub release with notes.

## [0.1.0] - 2026-11-02

### Added

- Plugin skeleton and marketplace entry. No rule IDs changed.
- Core rules, roles, hooks, `guilda:architect`, `guilda:init` and `guilda:update`. New rule IDs: R1 to R25, and ARC1
  to ARC6 in `guilda:architect`. The brief check of the Executor dispatch cites ARC6, not R3.

[unreleased]: https://github.com/JohnGabie/guilda/compare/guilda--v0.1.0...HEAD
[0.1.0]: https://github.com/JohnGabie/guilda/releases/tag/guilda--v0.1.0
