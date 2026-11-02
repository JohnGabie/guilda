# Project rules

## What must never happen

### P1 — Machine paths in the repository
Rule:  Never write an absolute machine path, personal data or a real secret in any file.
Why:   The repository is public, and a leaked path or secret cannot be recalled.
Check: gate — The commit scan blocks a staged secret, and the Reviewer rejects a machine path.

## Project adjustments

### P2 — Scripts never delete
Rule:  Never add code to a script or a test that deletes files.
Why:   A wrong path in a delete call can destroy data on the machine of the user.
Check: judgment — The Reviewer reads each diff for delete calls, because no hook can see the intent.
