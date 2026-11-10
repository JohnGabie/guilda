# Changelog

Each entry lists the version and the rule IDs that changed.

## 0.1.1 — 2026-11-10

- Fix: the QA report check keeps a scenario line with a colon, and an unindented continuation line, in the `Scenarios` section (D4, issue #6). No rule IDs changed.
- Fix: `lint-rules` accepts a blank line after a rule title and between `Rule:`, `Why:` and `Check:` (D11, issue #13). No rule IDs changed.
- Fix: the README says when a project-scope install loads (D2, issues #2 and #11).
- Fix: when `.guilda/config.json` is missing or invalid, the laws R4, R18, R19 and ARC6 run with safe defaults (D40).
  The session start tells the user. With no `.guilda/` folder, the laws do not run, as in 0.1.0. A refusal creates no folder. No rule IDs changed.
- Fix: `guilda:update` reads the old and the "Keep a Changelog" heading forms, for the update to 0.2.0.

## 0.1.0 — 2026-11-02

- Plugin skeleton and marketplace entry. No rule IDs changed.
- Core rules, roles, hooks, `guilda:architect`, `guilda:init` and `guilda:update`. New rule IDs: R1 to R25, and ARC1 to ARC6 in `guilda:architect`. The brief check of the Executor dispatch cites ARC6, not R3.
