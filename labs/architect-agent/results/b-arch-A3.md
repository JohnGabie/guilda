Updated outline below, again as text for `docs/superpowers/specs/todo-cli.md`. The changes are D9, D11, D12 (new), the contract, and S10, S11 and S12.

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
| D9 | Task ID is an integer that is never used again, also after a delete | @decided |
| D10 | Due date format is `YYYY-MM-DD` | @proposed |
| D11 | Storage is SQLite, in the file `~/.todo/todo.db` | @decided |
| D12 | On first run, the app creates the `~/.todo/` directory and the database if they do not exist | @proposed |

## 3. Contract (state crossing a boundary)
- Owner of the data: the storage module only. Commands never open the database directly.
- Location: `~/.todo/todo.db`, resolved from the home directory of the current user at run time, never hard-coded.
- Task: id (int), title (str), done (bool), priority (low|normal|high), due (date or none), tags (set of str).
- ID rule: the ID column is `INTEGER PRIMARY KEY AUTOINCREMENT`. Plain `INTEGER PRIMARY KEY` is not enough, because SQLite may reuse the highest ID after a delete. @proposed (guess (memory): verify in the official SQLite docs before the brief uses it, ARC5)
- Tags: stored in their own table, linked to tasks, with a cascade when a task is removed. @proposed
- Tag validation: one place, used by `add` and `tag`.
- Lifecycle: the schema is created on first run. Each command runs in one transaction. Schema version is stored (`PRAGMA user_version`) so a later change can migrate. @proposed

## 4. Acceptance scenarios
QA tool for all: CLI, run in a shell, comparing stdout, stderr and exit code. S10 to S12 also use the `sqlite3` CLI to inspect the file.
- S1 Add a task with only a title: priority `normal`, no due date, no tags. @proposed
- S2 Add a task with `--due`, `--priority high` and two tags: `list` shows all of them. @proposed
- S3 Add with an invalid priority: exit code is not 0, error names the allowed values, nothing is saved. @proposed
- S4 Add or tag with an invalid tag (uppercase, space, 21 characters): rejected with a clear error, nothing is saved. @decided
- S5 `tag <id> <tag>` on an existing task: tag appears in `list`. @proposed
- S6 `tag` on an unknown ID: exit code is not 0, clear error. @proposed
- S7 `tag --remove` removes the tag; removing an absent tag gives a clear message. @proposed
- S8 `done <id>`: task leaves the default `list` and appears with `--all`. @proposed
- S9 `list --tag <tag>` shows only tasks with that tag. @proposed
- S10 First run with no `~/.todo/`: the directory and `todo.db` are created, and the command succeeds. Data survives between two separate runs. @proposed
- S11 The database file is not a valid SQLite file: exit code is not 0, clear error, the file is not modified or overwritten. @open
- S12 IDs are never used again: after the task with the highest ID is removed, the next `add` gets a new, larger ID. @open (see the question below: no delete command exists yet)

## 5. Out of scope
Multiple users, sync, reminders, recurring tasks, editing a title, other storage formats.
The `delete` command is under question (see below).

## 6. Security consultation
Local only, no network. The app writes under the home directory. The code deletes no files (R20 does not apply). Whether Security is consulted depends on `config.security.riskAreas`, which I have not read. The main session should check it.

## 7. Plan
Not written. It comes after the spec is approved (R3).
```

One conflict needs your decision. You said IDs are not reused "also after a delete", but the four commands have no delete, and I had listed deleting tasks as out of scope. As written, the ID rule can't be tested through the CLI. S12 stays `@open` until you answer.

QUESTION:
**Where:** spec D2 (command list), S12 and section 5 (out of scope).
**What:** should the app have a way to delete a task?

**Scenario:** you add tasks 1 and 2 by mistake, remove task 2, then add "buy milk". With the never-reuse rule, "buy milk" gets ID 3, not 2.

- **A. No delete command in this version.** The ID rule is still built into the schema (AUTOINCREMENT) so it holds if delete is added later. Effect: smallest scope. S12 is checked by QA only by reading the schema with `sqlite3`, not by a user-visible scenario. A wrong task can only be closed with `done`.
- **B. Add a fifth command, `delete <id>`.** Effect: S12 becomes a real CLI scenario, and mistakes can be removed. It adds a command, its error cases (unknown ID) and tag cleanup. It changes your list of four commands, so I want your approval.

**Recommendation: A.** It keeps to the four commands you asked for and still protects the ID rule. Choose B if you expect to remove mistaken tasks often.

Which one do you want?

SUMMARY: Updated the spec outline: D9 and D11 now `@decided` (SQLite at `~/.todo/todo.db`, never-reused integer IDs), new D12, contract and S10–S12 revised; file still has to be saved by the main session.
The AUTOINCREMENT claim is labeled "guess (memory)" and must be verified in the SQLite docs before a brief uses it.
Asked whether a delete command is in scope (recommend A: no); S12 and S11 stay `@open`.