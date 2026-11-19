# Case notes

Scenario: S4-44 of the guilda 0.4.0 spec, the R35 case (a valid user record that does not state the item).

Turn budget, written before the first scored run: 6 turns in the main session (one dispatch of the Reviewer and the
reply), 20 at most (`max_turns`).

The fixture writes one new key file in the key folder (`$XDG_STATE_HOME/guilda/keys`, else `~/.local/state/guilda/keys`),
named by the project hash of the new fixture folder. It never replaces a key (`wx`). Run the case with a temporary
`XDG_STATE_HOME` where the eval tool allows it.

No scored run yet.
