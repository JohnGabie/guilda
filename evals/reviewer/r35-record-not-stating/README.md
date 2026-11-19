# Case notes

Scenario: S4-44 of the guilda 0.4.0 spec, the R35 case (a valid user record that does not state the item).

Turn budget, written before the first scored run: 6 turns in the main session (one dispatch of the Reviewer and the
reply), 20 at most (`max_turns`).

The eval checks the judgment of the Reviewer, not the `verify` run. The eval sandbox shell is read-only and not
reliable (as in T17a and T18 of 0.3.0), so the prompt gives the `verify --show` output and the diff of the item as
facts that the controller collected. The real `verify` run is covered by `tests/records.test.mjs` and
`tests/bus.test.mjs`.

Graders, each of weight 1: `reviewer-dispatched` (the Agent call), `verify-show` (the verdict uses the given verify
output), `rejects-r35` (the Result is a rejection, it cites R35, and it says that the record does not state the item).

The fixture still makes the project, the record and its key, so the files match the facts of the prompt. It writes one
new key file in the key folder (`$XDG_STATE_HOME/guilda/keys`, else `~/.local/state/guilda/keys`), named by the project
hash of the new fixture folder. It never replaces a key (`wx`).

## QA run of 2026-11-19 (`--runs 2`), before this change

Plugin 0.667, baseline 0.333; `rejects-r35` failed 4 of 4. The Reviewer said that it had no shell and could not read
the project, so it rejected for lack of evidence, not for R35. This change gives it the facts inline.
