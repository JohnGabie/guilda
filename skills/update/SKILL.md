---
name: update
description: Use when the user asks to update guilda, to check for a new guilda version, or to see what changed in guilda. Also use when a session notice says that a new guilda version exists.
---

# guilda:update

This skill finds the newest guilda version, shows what changed, and updates the plugin after the user says yes.

**Plugin root.** In this skill, `${CLAUDE_PLUGIN_ROOT}` is the plugin root. Claude Code replaces it with the plugin path when the skill loads. The Bash tool does not have this variable.

## Hard limits

1. Run `claude plugin update guilda@guilda` only after the user says yes in a message after you showed the changes.
2. Never guess a version. If you cannot read the newest version, say so and stop.
3. Never edit a project file. This skill changes the plugin only.

## Procedure

1. **Installed version.** Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Show its `version` as the installed version.
2. **Newest version.** The repository JohnGabie/guilda is private. The commands use the login of the user.
   - Run: `gh api repos/JohnGabie/guilda/contents/.claude-plugin/plugin.json -H "Accept: application/vnd.github.raw"`
     The result is the JSON file. Read `version` from it.
   - If `gh` is not installed or the call fails, run: `git ls-remote --tags https://github.com/JohnGabie/guilda`
     Take the highest version of the tags named `guilda--v*`. The version is the text after `guilda--v`.
3. **No access.** If both commands fail, tell the user: "I cannot read the newest version. There is no network, or no access to the repository." Show the error text of each command. Stop here.
4. **Compare.** If the installed version is equal to the newest version, tell the user that guilda is up to date. Stop here.
   If the installed version is higher than the newest version, tell the user. Stop here.
5. **Show the changes.** The installed plugin does not have the new entries. So read the changelog of the repository.
   Run: `gh api repos/JohnGabie/guilda/contents/CHANGELOG.md -H "Accept: application/vnd.github.raw"`
   Save the output to a new temporary file. Then run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/changelog.mjs" <installed> <newest> <temporary file>`
   The script prints each entry above the installed version, up to the newest version.
   If you cannot get the entries, say so. Do not write the entries from memory.
6. **Major version.** If the newest version has a higher major number, tell the user that `guilda:init` is required after the update. Each project must run it again.
7. **Ask.** Ask the user: "Update guilda from <installed> to <newest>?" Wait for the answer. If the answer is not yes, stop.
8. **Update.** Run: `claude plugin update guilda@guilda`
   If the command fails, show its output and stop.
9. **Reload.** Tell the user to run `/reload-plugins`. The new version is not active until the user does this.
   If step 6 applied, also tell the user to run `guilda:init` in each guilda project.
