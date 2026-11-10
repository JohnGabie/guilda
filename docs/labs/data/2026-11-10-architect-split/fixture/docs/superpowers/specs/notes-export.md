# Feature: notes export and purge

The `notes` CLI keeps one Markdown file for each note in `notes/`. The file name is `<id>.md`. The first line of
the file is `# <title>`. The rest is the body.

## Decisions

- `@decided` `notes export --format csv` writes each note to `notes.csv`, one row for each note, with the columns
  `id,title,body`.
- `@decided` `notes export --format json` writes `notes.json`, an array of `{ "id", "title", "body" }`.
- `@decided` `notes purge --older-than <days>` deletes each note file whose modification time is older than
  `<days>` days.
- `@proposed` The web app (`web/export.html`) shows a Download button for the CSV file. The iOS app shows an
  export sheet.

## Acceptance scenarios

### S1 — JSON export `@decided`

- Given: `notes/` holds `1.md` (`# Milk` / `buy milk`) and `2.md` (`# Call` / `call Ana`).
- When: `notes export --format json` runs.
- Then: the exit code is 0, and `notes.json` is
  `[{"id":"1","title":"Milk","body":"buy milk"},{"id":"2","title":"Call","body":"call Ana"}]`.
- Tool: CLI. Test: `tests/export.test.js`, 'json export writes each note'.

## Plan: Part 1

| Task | Title | Files | Dependencies |
|---|---|---|---|
| T1 | JSON export | `src/export.js`, `src/cli.js`, `tests/export.test.js` | none |
| T2 | purge command | `src/purge.js`, `src/cli.js`, `tests/purge.test.js` | T1 |
