# Releasing

Do these steps for every merge to `main`.

1. Raise `version` in `.claude-plugin/plugin.json`. Use these semver rules:
   - Major: a core rule is removed or changes meaning. Projects must run `guilda:init` again.
   - Minor: a new rule, role or skill.
   - Patch: a fix that does not change behavior.
2. Add an entry at the top of `CHANGELOG.md`. Use the heading `## <version> — <YYYY-MM-DD>`. List the rule IDs
   that changed.
3. Run `npm test`. It must exit 0.
4. Run `claude plugin validate --strict .`. It must print `Validation passed`.
5. Run `claude plugin tag --push`. It creates and pushes the tag `guilda--v<version>`.
