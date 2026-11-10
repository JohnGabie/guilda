# Lab: the Architect as its own agent

Date: 2026-11-09. Branch: `lab/architect-agent`. Spec: `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`, D31.
Run by a dispatched agent (D19). Account: the user chose to run it now on the account with free usage.

## Hypothesis

The Architect can run as its own agent outside the main session. It stops after each step, uses no tokens while
stopped, and comes back with its full context when the main session resumes it. The main session stays smaller than
when it carries the Architect itself.

## PASS criteria (written before the run)

| ID | Check | PASS |
|---|---|---|
| Q1 | Question tool | Record whether a subagent has the question tool (`AskUserQuestion`), from its own tool list and from the docs. If it has none: show one full cycle where the agent returns a ready question, the main side asks it, and the answer goes back; the resumed agent uses the answer correctly. |
| Q2 | Dispatch | Record whether a subagent can dispatch another agent (the Agent tool in its tool list, and one real try). If not, record the path: the Architect writes the briefs, and another party dispatches them. |
| Q3 | Direct talk | From the docs, record how a user can send a message straight to a background agent (agent view, agent teams), with the version and the status (stable or experimental). The user confirms it on screen. Without the user, it stays NOT VERIFIED. |
| Q4 | Context over resumes | A simulated project: one Architect session resumed at least 8 times (spec questions, a change of a decision, a plan, briefs, a verdict, a late change). Record the context size at each resume. The resumed Architect answers 3 recall questions about early decisions correctly at the end. |
| Q5 | Cost | The same project in two ways: (a) one session that is both main and Architect; (b) a light main session plus a resumed Architect. Record the tokens of each turn. PASS if the main session of (b) at the end is 40% smaller or more than the session of (a), and the total of (b) is at most 20% above the total of (a). |
| Q6 | Idle cost | A stopped Architect uses no tokens between resumes (no process, no calls). |

A stop rule: if the total use of the run passes 2,000,000 tokens, the agent stops, reports what it has, and marks the
rest NOT VERIFIED.

## Method

## Evidence

## Verdict

## Lessons
