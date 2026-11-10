# Releasing

Do these steps for every merge to `main`.

1. Raise `version` in `.claude-plugin/plugin.json`. Use these semver rules:
   - Major: a core rule is removed or changes meaning.
   - Minor: a new rule, role or skill.
   - Patch: a fix that does not change behavior.
   - The 0.x rule: while the major number is 0, a core rule that is removed or changes meaning raises the minor
     number, not the major one.
   - A rule that changes meaning is rewritten in place. The project layer copies no rule text. The migrations run
     in memory at session start, so no project runs `guilda:init` again after an update. A migration writes
     `.guilda/config.json` only through `guilda:update` or after the user approves.
2. Update `CHANGELOG.md` in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) form:
   - Rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>`, and add a new empty `## [Unreleased]` above it.
   - Group the lines under `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed` or
     `### Security`. List the rule IDs that changed.
   - Update the link references at the end of the file: `[unreleased]` compares the new tag with `HEAD`, and
     `[<version>]` compares the earlier tag with the new tag.
   - `scripts/changelog.mjs` reads these headings for `guilda:update`. Do not change their form.
3. Run `npm test`. It must exit 0.
4. Run `claude plugin validate --strict .`. It must print `Validation passed`.
5. Run `claude plugin tag --push`. It creates and pushes the tag `guilda--v<version>`.
6. Create a GitHub release for the tag. Its notes are the CHANGELOG entry of the version:
   `gh release create guilda--v<version> --title "guilda <version>" --notes-file <file with the entry>`.
   Close the milestone of the version on GitHub.
