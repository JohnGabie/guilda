We chose SQLite (D11, `@decided`). The file is `~/.todo/todo.db`. The path is resolved from the current user's home directory when the program runs, not hard-coded. On first run the app creates the `~/.todo/` directory and the database if they are missing (D12, `@proposed`).

SUMMARY: Storage is SQLite at `~/.todo/todo.db` (D11, decided), resolved from the home directory at run time.
The directory and the database are created on first run (D12, proposed).
D21 (where `export` writes) is still waiting on your answer.