# Deletion safety

These rules apply to code that deletes, moves or overwrites files in bulk, from any person or agent.
Examples: `remove_dir_all`, `rmtree`, `rm -rf`, `Remove-Item -Recurse`, `fs.rm(..., { recursive: true })`, `robocopy /MIR`, `git clean -fdx`.
Copy these rules into every brief whose code deletes, moves or overwrites files (R20).

## Before you run the code

1. Read the test or the script before you run it. Find every path that reaches a delete operation.
2. Make sure that each of these paths is a temporary folder that the test itself creates.
   Examples: `tempfile::TempDir`, `tmp_path`, `mkdtemp`, `os.tmpdir()` with a unique subfolder.
3. On the first run, run the code in an isolated environment, such as a container or a virtual machine. Never run it first on the user's machine.
4. If you are not sure, do not run the code. Ask the user.

## When you write the code

- Never pass a real path to a function that deletes. A real path is a drive root, `/`, `~`, `%USERPROFILE%`, `$HOME`, `AppData`, the project folder or any other existing folder.
- This also applies to a test that checks that the function refuses the path. To test the refusal, test the pure validation function, which returns an error and deletes nothing.
- Never delete a path from a variable that can be empty or relative. Validate the path first:
  1. The path is absolute.
  2. The path is inside an allowed root.
  3. The path is not a drive root and not the home folder.
  4. The path does not follow a junction or a symbolic link out of the allowed root.
- Give these rules to every subagent whose task deletes files.

## If a file is deleted by mistake

1. Stop at once. Write nothing to the affected disk.
2. Look for snapshots or shadow copies. On Windows, run `vssadmin list shadows`.
3. Before you restore anything, copy everything that matters to a different disk.
4. Check the free space on the target disk before you copy.
5. Copy only what cannot be rebuilt. Leave out build output and dependencies: `target`, `node_modules`, `.venv`, `venv`, `dist`, `build`, `__pycache__`, `.gradle`, `.next`, `.nuxt`, `.cache`, `cargo-target`.
   These folders come back with `cargo build`, `npm ci` and `pip install`.
   Example: `robocopy <source> <target> /E /XD target node_modules .venv venv dist build __pycache__ .gradle .next .nuxt`.
6. Copy the source code, `.git`, the configuration files and the documents first. Configuration includes `.ssh`, `.gitconfig`, `.config` and app data.
7. Copy the rest only if space and time remain.
