Spec outline below. I can't write files in this run, so this is the text for `docs/superpowers/specs/todo-cli.md`. The main session should save it. It is an outline only: no plan and no build until you approve the spec in a separate message (R3).

```markdown
# Feature: todo-cli (CLI todo app with tags)

## 1. Goal
A local CLI todo app for one user. Python 3.12. Commands: add, list, done, tag.

## 2. Decisions
| # | Decision | Tag |
|---|---|---|
| D1 | Python 3.12, one user, local only, no network, no accounts | @decided |
| D2 | Commands: `add`, `list`, `done`, `tag` | @decided |
| D3 | Due date is optional | @decided |
| D4 | Priority is `low`, `normal` or `high`; default `normal` | @decided |
| D5 | Tag: lowercase, 20 characters or fewer, no spaces | @decided |
| D6 | `tag <id> <tag>` adds a tag to an existing task; `tag <id> <tag> --remove` removes it | @proposed |
| D7 | `add` accepts `--tag` (repeatable), `--due`, `--priority` | @proposed |
| D8 | `list` filters with `--tag`; shows open tasks by default, `--all` includes done | @proposed |
| D9 | Task ID is a sequential integer, never reused | @proposed |
| D10 | Due date format is `YYYY-MM-DD` | @proposed |
| D11 | Storage format: JSON file or SQLite | @open |

## 3. Contract (state crossing a boundary)
- Owner of the data: the storage module only. Commands never read or write the file directly.
- Task: id (int), title (str), done (bool), priority (low|normal|high), due (date or none), tags (set of str).
- Tag validation: one place, used by `add` and `tag`.
- Data file location and units: @open until D11 is decided.

## 4. Acceptance scenarios (QA tool for all: CLI, run in a shell and compare stdout, stderr and exit code)
- S1 Add a task with only a title: it gets priority `normal`, no due date, no tags. @proposed
- S2 Add a task with `--due`, `--priority high` and two tags: `list` shows all of them. @proposed
- S3 Add with an invalid priority: exit code is not 0, error names the allowed values, nothing is saved. @proposed
- S4 Add or tag with an invalid tag (uppercase, space, 21 characters): rejected with a clear error, nothing is saved. @decided (rule from D5)
- S5 `tag <id> <tag>` on an existing task: tag appears in `list`. @proposed
- S6 `tag` on an unknown ID: exit code is not 0, clear error. @proposed
- S7 `tag --remove` removes the tag; removing an absent tag gives a clear message. @proposed
- S8 `done <id>`: task leaves the default `list` and appears with `--all`. @proposed
- S9 `list --tag <tag>` shows only tasks with that tag. @proposed
- S10 Data survives between runs (two separate commands). @decided (local app)
- S11 Behavior when the data file is missing or corrupt. @open

## 5. Out of scope
Multiple users, sync, reminders, recurring tasks, editing a title, deleting tasks.

## 6. Security consultation
Local only, no network, no file deletion. Security consultation depends on `config.security.riskAreas`, which I have not read. The main session should check it.

## 7. Plan
Not written. It comes after the spec is approved (R3).
```

Both candidates are in the Python 3.12 standard library, so no dependency is needed either way. That matters because D11 sets the contract for the data file and S11.

QUESTION:
**Where:** spec decision D11, storage format.
**What:** should tasks be stored in a JSON file or in SQLite?

**Scenario:** you run `todo add "buy milk"` in one terminal while `todo done 3` runs in another, or the computer loses power in the middle of a write.

- **A. SQLite (one `.db` file).** Effect: writes are transactional, so a crash or two simultaneous commands cannot corrupt the data. Tags can be stored in their own table, so `list --tag` is a query. The file is not human-readable, but you can inspect it with the `sqlite3` tool. The code is a bit larger (schema creation, and a migration step if the schema changes later).
- **B. JSON file.** Effect: you can open and edit the file in any editor, and the code is smaller. The program must write to a temp file and rename it to avoid corruption on a crash. Two simultaneous commands can overwrite each other's changes unless we add file locking.

**Recommendation: A, SQLite.** The app is small, but it has tags on tasks, filtering and a "never reuse IDs" rule (D9). SQLite handles those and the crash cases without extra code. Choose B if you value being able to read and edit the data by hand more than safety against crashes and simultaneous commands.

Which one do you want?

SUMMARY: Wrote the spec outline for todo-cli (decisions tagged, 11 scenarios, QA tool = CLI); it still has to be saved to `docs/superpowers/specs/todo-cli.md`.
D6–D10 are `@proposed`, and S11 (missing or corrupt data file) is still `@open`.
Asked the one open decision, D11: SQLite (recommended) or a JSON file; waiting for the answer.