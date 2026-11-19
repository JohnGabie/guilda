# Case notes

Scenario: S4-44 of the guilda 0.4.0 spec, the R35 case (a valid user record that does not state the item).

Turn budget, written before the first scored run: 6 turns in the main session (one dispatch of the Reviewer and the
reply), 20 at most (`max_turns`).

The eval checks the judgment of the Reviewer, not the `verify` run. The eval sandbox shell is read-only and not
reliable (as in T17a and T18 of 0.3.0), so the prompt gives the `verify --show` output and the diff of the item as
facts that the controller collected. The real `verify` run is covered by `tests/records.test.mjs` and
`tests/bus.test.mjs`.

Graders, each of weight 1: `reviewer-dispatched` (the Agent call) and `rejects-r35` (the Result is a rejection, it
cites R35, and it says that the record does not state the item).

The fixture makes only the project files that the prompt names: the config and the register, in two commits. It
writes no key and no user record, so it never writes to the key folder.

## QA run of 2026-11-19 (`--runs 2`), before this change

Plugin 0.667, baseline 0.333; `rejects-r35` failed 4 of 4. The Reviewer said that it had no shell and could not read
the project, so it rejected for lack of evidence, not for R35. This change gives it the facts inline.

## QA run 2 of 2026-11-19 (`--runs 2`)

`rejects-r35` passed 2 of 2 in the plugin arm and failed in the baseline. The grader `verify-show` failed one plugin
run; it repeated item 3 of `rejects-r35`, so it was removed.
