The Architect wrote the spec outline and has one open decision left: the storage format.

- **A (recommended):** SQLite. Writes are transactional, so a crash or two simultaneous commands can't corrupt data, and `list --tag` is a query. The file isn't human-readable, but `sqlite3` can inspect it.
- **B:** JSON file. You can read and edit it by hand and the code is smaller. It needs temp-file-and-rename writes, and two simultaneous commands can overwrite each other unless we add file locking.

Which one do you want?