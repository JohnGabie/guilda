# Lab: block index for traceability and reads by ID

Date: 2026-11-09. Branch: `lab/trace-index`. Spec: `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`, D27.
Run by a dispatched agent (D19). Account: the user chose to run it now on the account with free usage.

## Hypothesis

A generated index of blocks (ID, file, line range, hash of the text) lets agents:
1. find exactly the plan tasks and briefs that a spec change affects, with no full read, and
2. answer questions about one block by reading only that block, with fewer tokens and the same correct answers.

## PASS criteria (written before the run)

### Part A: change alarm (script only)

| ID | Check | PASS |
|---|---|---|
| A1 | Index build | Every `### D<n>` block of a copy of the spec gets an ID, a line range and a hash. Under 1 s. |
| A2 | Suspect links | 12 briefs or tasks with `Uses:` lines cite 15 IDs. Changes: 3 text changes cited by 5 briefs, 2 status-only changes, 1 white-space change, 1 change in an uncited block, 1 brief that cites an unknown ID. The check lists exactly the 5 briefs as suspect and the unknown ID as an error. No other hit. |
| A3 | Earlier version | For each suspect link, the check shows the block as it was at the recorded commit and as it is now. |
| A4 | Acknowledge | After acknowledge, the suspect list is empty. |
| A5 | Repeat | 3 runs give the same result. |

### Part B: many agents in a realistic flow

| ID | Check | PASS |
|---|---|---|
| B1 | Setup | A realistic plan: at least 6 tasks with briefs that cite blocks of the spec copy, and 10 fixed questions with a key. The questions are the kind that agents ask in a real flow: what a decision says, which task owns it, whether a brief still matches a changed decision. |
| B2 | Arms | Arm 1: agents with grep and free reads. Arm 2: the same agents with the index and the rule "read by ID, never the whole file". Same model and settings. Agents run in parallel, as in a wave. |
| B3 | Measure | For each answer: input and output tokens (from the agent's own usage report), tool calls, wall time, correct or not against the key. At least 2 runs per arm. |
| B4 | Result | PASS if arm 2 has at least as many correct answers as arm 1 and its median of input tokens is 30% lower or more. FAIL if the token gain is under 15% with no gain in correct answers. |
| B5 | Review | One Reviewer agent per arm checks the 6 briefs against the changed spec. PASS if the arm-2 Reviewer finds every brief that a change affects, with no more tokens than the arm-1 Reviewer. |

A stop rule: if the total use of the run passes a set limit, the agent stops, reports what it has, and marks the rest NOT VERIFIED.

## Method

## Evidence

## Verdict

## Lessons
