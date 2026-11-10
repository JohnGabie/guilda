# Architect reference: the brief format

Read this file at each use of procedure step 10. A compaction can drop it.


Write each field on one `Name:` line. Continue a long value on indented lines.
`Suggested tier:` holds only the tier word. Write the reason for the tier in `Context:`.
`Risk area:` is `none` or one area from `config.security.riskAreas`.
`Deletion rules:` is `none` or a copy of each rule of `core/deletion-safety.md`, if the code deletes, moves or overwrites files (R20).

```
ID / title: <task ID> — <title>
Goal: <one or two sentences>
Context: <files and docs to read, as paths; the reason for the tier>
Out of scope: <items>
Files it may touch: <paths; the owner is this Executor>
Contract / interfaces: <signatures, formats, owners, units>
Tests that must pass: <test names and the command>
Acceptance: <each criterion, the spec scenario it cites, and the QA tool that verifies it>
Suggested tier: master | journeyman | apprentice
Risk area: none | <area>
Deletion rules: none | <copy of core/deletion-safety.md>
Dependencies: none | <task IDs that must be done first>
```
