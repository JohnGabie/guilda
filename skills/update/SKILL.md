---
name: update
description: Use when the user asks to update guilda, to check for a new guilda version, or to see what changed in guilda. Also use when a session notice says that a new guilda version exists, or a session notice says "Run guilda:update".
---

# guilda:update

This skill finds the newest guilda version, shows what changed, and updates the plugin after the user says yes. At the end it offers to save the new version in the project config.

**Plugin root.** In this skill, `${CLAUDE_PLUGIN_ROOT}` is the plugin root. Claude Code replaces it with the plugin path when the skill loads. The Bash tool does not have this variable.

## Hard limits

1. Run `claude plugin update guilda@guilda` only after the user says yes in a message after you showed the changes.
2. Never guess a version. If you cannot read the newest version, say so and stop.
3. Never edit a project file, with one exception. After the user says yes to the last step, run `config-write.mjs --migrate`. It writes `.guilda/config.json` only.

## Procedure

1. **Installed version.** Use the Read tool on `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Show its `version` as the installed version.
2. **Newest version.** The repository JohnGabie/guilda is private. The commands use the login of the user.
   - Run: `gh api repos/JohnGabie/guilda/contents/.claude-plugin/plugin.json -H "Accept: application/vnd.github.raw"`
     The result is the JSON file. Read `version` from it.
   - If `gh` is not installed or the call fails, run: `git ls-remote --tags https://github.com/JohnGabie/guilda`
     Take the highest version of the tags named `guilda--v*`. The version is the text after `guilda--v`.
3. **No access.** If both commands fail, tell the user: "I cannot read the newest version. There is no network, or no access to the repository." Show the error text of each command. Stop here.
4. **Compare.** If the installed version is equal to the newest version, tell the user that guilda is up to date. Go to step 10.
   If the installed version is higher than the newest version (a build before its release), tell the user. Go to step 10.
5. **Show the changes.** The installed plugin does not have the new entries. So read the changelog of the repository.
   Run: `gh api repos/JohnGabie/guilda/contents/CHANGELOG.md -H "Accept: application/vnd.github.raw"`
   Save the output to a new temporary file. Then run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/changelog.mjs" <installed> <newest> <temporary file>`
   The script prints each entry above the installed version, up to the newest version.
   If you cannot get the entries, say so. Do not write the entries from memory.
6. **Major version.** If the newest version has a higher major number, tell the user that the update is a major version. Show the changes of step 5 with care.
7. **Ask.** Ask the user: "Update guilda from <installed> to <newest>?" Wait for the answer. If the answer is not yes, stop.
8. **Update.** Run: `claude plugin update guilda@guilda`
   If the command fails, show its output and stop.
9. **Reload.** Tell the user to run `/reload-plugins`. The new version is not active until the user does this.
   Wait until the user says the reload is done. Then go to step 10.
10. **Save the new version.** Use this step only in a project that has `.guilda/config.json`. Ask the user in the question tool: "Save the new guilda version in .guilda/config.json?" Wait for the answer.
   - On a yes, run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/config-write.mjs" <project> --migrate`. Run it alone in the Bash call. Show its output line.
   - If the output starts with `migrate refused:`, show that line to the user with its next step. Do not retry.
   - On a no, change nothing. Tell the user that the config is unchanged.
