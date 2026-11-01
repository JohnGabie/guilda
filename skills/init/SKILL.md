---
name: init
description: Use when a project adopts guilda, new or existing — the user asks to set up, install, initialize, configure or adapt guilda for a repository, or to migrate the rules of a project CLAUDE.md to guilda. Also use when a session notice says "guilda:init is required" or "run guilda:init", or when the project changed and its project layer (.guilda/config.json, .guilda/rules.md) needs an update.
---

# guilda:init

This skill adapts guilda to one project. It writes the project layer: `.guilda/config.json`, `.guilda/rules.md` and `.guilda/.gitignore`.
Without `.guilda/config.json`, guilda injects nothing into the project (design 7.2). This skill is how a project opts in.

**Plugin root.** When this skill loads, Claude Code shows the base directory of the skill. The plugin root is two folders above that directory. Write `<root>` for the plugin root in each command.

## Hard limits

1. Write no file before the user approves the full proposal (step 5).
2. Write `.guilda/config.json` only through `node "<root>/scripts/config-write.mjs"`. Never write `config.json` by hand.
3. Put a command into `checks` only if you ran that command in this session and you saw its exit code. Never invent a command.
4. Never edit the project `CLAUDE.md`, a role file, a hook or the project `.gitignore` without an approval for that file.
5. Never move or remove a docs folder or a file without approval (design 6.10).

## Conversation

If the `superpowers:brainstorming` skill is installed, use it for the conversation in step 2. Use only its question method. Do not write its design doc, and do not start its plan. The output is the proposal of step 3.

If `superpowers:brainstorming` is not installed, use this fallback:
- Send one question in each message. Use AskUserQuestion with 2 to 4 options and put the recommended option first (R13).
- If the user asks for "a round" of questions, send more messages, one question in each. Never send a list of questions.
- After each topic, write back what you understood. The user corrects it.

## Steps

### 1. Read the project

Read, and write down what you find with the file path:
- Stack, package files, and the build, test, typecheck and lint commands.
- Test tools: browser automation, mobile driver, game client bridge, sandbox, MCP servers in `.mcp.json` or `.claude/settings.json`.
- Git branches and remotes (`git branch -a`, `git remote -v`).
- The project `CLAUDE.md`, role files (`docs/roles/`, `.claude/agents/`), hooks (`.claude/settings.json`) and the `docs/` folders.
- An existing `.guilda/config.json` and `.guilda/rules.md`. If they exist, this is a re-run (see Re-run).

Run each candidate check command one time. Record the command and its exit code. Before a command that installs software, deploys, migrates a database or writes outside the project, ask the user. If a command fails, show the output and ask the user. Do not put a failed command into `checks`.

### 2. Talk with the user

Ask about these topics, one question in each message:
1. **Fears.** Ask: "What must never happen in this project?" Ask again until the user has no more answers. Each answer becomes a P-rule (design 7, item 23).
2. **Languages.** The language of replies to the user, and the language of docs. ASD-STE100 applies in every language.
3. **Domain rules.** The invariants of the domain: units, states, money, data that must not change.
4. **Risk areas.** Authentication, payments, personal data, uploads, secrets, external webhooks, or other areas of this project.
5. **Writing exceptions.** Document types that the ASD-STE100 check must skip, each with its reason (see Config values).
6. **QA tools.** The tools from step 1, and the gaps (see QA tools).
7. **Git flow.** Autocommit, a PR for each feature, remotes. Write the flow as project adjustments.
8. **Tiers.** The model for each tier (see Config values).
9. **Extra roles.** Project roles, for example a Learning Advisor. A project role lives in `docs/roles/`.

### 3. Propose the project layer

Show the full proposal in one message:
- The `config.json` values. Use `references/config-template.json` for the shape.
- The full `.guilda/rules.md`. Use `references/rules-template.md` for the shape.
- The rule list of step 4, if the project has rules.
- The docs map: each existing `docs/` folder and its place in the guilda layout (design 6.10). Folder names follow the docs language.
- The QA tools and the gaps.
- Each file that you will write, and each file that you propose to change.

### 4. Sort the existing rules

For each rule in the project `CLAUDE.md`, role files and hooks, read `<root>/core/rules.md` and `<root>/core/writing.md`. Give the rule one label:
- **already in the core (R<n>)**: a core rule says the same thing. Name the core rule ID. Propose to remove the project copy.
- **project adjustment**: the rule is for this project only. Propose a P-rule, or keep the rule where it is.
- **candidate for the core**: the rule can help all projects. Propose a pull request to the guilda repository (design 6.2).

Show each rule as one line: `<rule text, short> — <label> — <file>:<line>`. The project owner decides the label (R25). You only propose the label.

### 5. Approve, then write

Ask the user to approve the proposal in a separate message. Do not write a file before the approval. After the approval:
1. Write the answers to a JSON file in the system temp folder, outside the project. The answers have the config keys without `guildaVersion`.
2. Run `node "<root>/scripts/config-write.mjs" "<project>" "<answers file>"`. The script adds `guildaVersion`, validates the config against the schema and writes `.guilda/.gitignore`. If the script exits 1, show its reason, correct the answers and run the script again.
3. Write `.guilda/rules.md`. Run `node "<root>/scripts/lint-rules.mjs" --prefix P .guilda/rules.md`. If the script exits 1, correct the rules.
4. Run `node "<root>/scripts/config-check.mjs" "<project>"`. The output must be `ok`.
5. Tell the user to add `.journal/` to the project `.gitignore`. The diary script never edits `.gitignore`. Offer to add the line. Add the line only if the user approves.
6. If the user approved changes to the project `CLAUDE.md`, make only those changes.
7. Tell the user to commit `.guilda/config.json`, `.guilda/rules.md` and `.guilda/.gitignore`, so that each clone gets the same project layer.

## P-rules

- Use the block format of `core/rules.md` with the prefix `P`: `### P<n> — <title>`, then `Rule:`, `Why:` and `Check:`.
- Put each fear under "What must never happen" with the level `gate` or `law`. Use `law` only if a hook or a script blocks the action.
- Keep `.guilda/rules.md` at 20 non-blank lines or fewer. The session start hook injects the file into each session, and the budget is 150 lines. If the rules are more, ask the user which rules to keep.
- Never copy a core rule into a P-rule.

## Config values

| Key | Value |
|---|---|
| `languages.replies`, `languages.docs` | Language tags from the user, for example `en` or `pt-BR`. |
| `tiers.master`, `tiers.journeyman`, `tiers.apprentice` | Propose the default mapping from `<root>/core/tiers.json`. The user can put any model in any tier. The Agent tool `model` parameter accepts only Claude model aliases. |
| `writing.free` | Globs of document types that the ASD-STE100 check skips, for example `docs/blog/**`. |
| `writing.exceptions` | Objects `{docType, level, reason}`. `docType` is a glob against the path in the project or the file name, for example `docs/adr/**` or `CHANGELOG.md`. `level` is `full` to keep the check; another level skips the automatic check. The user approves each exception and its reason. |
| `security.enabled` | `true` if `security.riskAreas` has one area or more. Else `false`. |
| `security.riskAreas` | The risk areas from the conversation. |
| `checks` | `{name, command}` for each command that you ran with exit code 0. |
| `scan.ignore` | Optional. Globs that the commit scan skips, for example test fixtures with fake tokens. |

## QA tools

List the test tools that the project or the machine already has. For each platform of the project (web, Android, iOS, desktop, CLI, game, API, hardware), name the tool that QA uses, or write "gap". The Architect plans the setup of each gap with `guilda:qa-tools` (design 6.11). Setup that installs software or leaves the machine is the decision of the user.

## Re-run

If `.guilda/config.json` exists, read it and `.guilda/rules.md` first. Show the diff of the project layer: each config key and each P-rule that you add, change or remove. Ask only about the changes. After the approval, run `config-write.mjs` with `--replace`.
