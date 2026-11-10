# Rules

### R1 — Spec before code

Rule:  Do not write product code before the user approves the spec.

Why:   Code from an unapproved spec builds the wrong thing.

Check: gate — The Reviewer rejects the work.

### R2 — Tests first

Rule:  Run each new test before you write the code.

Why:   A test that never failed can pass for the wrong reason.

Check: gate — The Reviewer rejects a test that never failed.
