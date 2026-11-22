---
name: council
description: Use when you are a member of an open guilda council (a lead, the Architect or the Judge) and need the protocol — who speaks, the floor, the lines of the channel, how to open and close. Not a user command.
groups: [council]
user-invocable: false
---

# Council

A council is a live chat of the leads of one serious problem, with the user and the Architect, that a Judge runs (D47).
The core rules are in `core/rules.md` of the guilda plugin. Cite them by ID.
In this text: `<plugin root>` is the folder of the guilda plugin, `<dir>` is the project folder, and `C` is
`node <plugin root>/scripts/council.mjs <dir>`. The channel is `.guilda/bus/council-<4 hex>.jsonl`. Write it only with `C` (R34).

## Protocol

Members: the leads of the problem, the user and the Architect. The Judge runs the session and is not a member.
The formats: `adversarial` (one lead attacks, one defends, in turns) and `debate` (the Judge orders the turns).
A council has 3 rounds at most, unless `open` gives another number (U5-9). A round is one claim of each member.

The lines of the channel:

| Line | Written by | Fields |
|---|---|---|
| `create` | `C open` | `question`, `members`, `format`, `maxRounds`, `record` |
| `open` | the Judge | none |
| `floor` | the Judge | `to` (one member) |
| `claim` | the member with the floor | `claim`, `evidence`, `reason` |
| `call` | the member with the floor | `to` (a lead that it asks to answer) |
| `grant`, `deny` | the Judge | `to`, `call` (the ID of the `call`) |
| `close` | the Judge | `positions` (the ID of the last claim of each lead) |
| `decision` | the user, through the Architect | `decision`, `why`, `record` |

The floor: a member holds the floor after a `floor` or a `grant` that names it. The member loses the floor with its next
`claim` or `call`. After a `deny`, and at the start, no member holds the floor.

### As a lead

1. Wait for the Architect to resume you. The resume names the council ID.
2. Run `C read --id <council> --last 8`. Find the last `floor` or `grant`. If it does not name you, end the turn.
3. Write one line: `C say --id <council> --from <your agent type> --type claim --claim <text> --evidence <text> --reason <text>`.
   To ask a lead to answer, write `C say --id <council> --from <your agent type> --type call --to <member>`.
4. End the turn. Do not write a second line.

### As the Architect (the main session)

1. Open the council only after the user said yes (ARC12). Run
   `C open --question <file> --members <list> --format <adversarial|debate> --record <user record ID>`.
   The script prints the council ID. It exits 1 with `refused: no approval` when the record is not valid (R35).
2. Dispatch the Judge and each lead that is not live. Put the council ID in each prompt.
3. After each `floor`, resume the member of that `floor` with `SendMessage`. After each member line, resume the Judge.
   Pass each turn on in order. Never skip, change or answer for a member.
4. When the floor goes to `user`, end the reply with a `QUESTION:` block (X8). The block has the last lines of the channel and
   the line "The floor is yours." Write the answer of the user word for word:
   `C say --id <council> --from user --type claim --claim <the text of the record> --record <user record ID>`.
5. After the `close`, ask the user for the decision. Write it the same way, with `--type decision --decision <text> --why <text> --record <ID>`.
6. Run `C record --id <council> --register <register file>`. The script appends the register entry: the question, each position,
   the decision and why.

### As the Judge

The agent `guilda:judge` has its own steps. Open the session, give the floor in turn, close with the claim of each lead.

## Rules

```
### CNL1 — Speak only with the floor
Rule:  Speak in a council only when the Judge gives you the floor, and give a claim, evidence and a reason.
Why:   A council with no order gives parallel speeches that cost tokens and decide nothing (D47).
Check: law — PreToolUse and the council script refuse a `claim` or a `call` from a member that does not hold the floor.

### CNL2 — The Judge has no view on the merit
Rule:  As the Judge, open the session, give the floor in turn, close it, and never state a view on merit.
Why:   A Judge with a view takes a side, and the user decides the outcome (D47, R12).
Check: judgment — The council eval reads each Judge message for a view on the merit.
```

<!-- argument-style:start -->
## Argument style (switch: the L5-3 lab removes this section)

1. Open a claim with one sentence that a lead on the other side can accept or reject.
2. Give evidence a reader can check: a file path, a command and its output, or a source. Mark a guess as "guess".
3. Give a reason that links the evidence to the claim. Name the case where the claim fails.
4. When you answer a claim, answer its reason first. Then give your own claim.
5. Change your position when the evidence changes it. Say so in one sentence.
<!-- argument-style:end -->
