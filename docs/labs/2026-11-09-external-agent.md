# Lab: an external agent talks to the Architect

Date: 2026-11-09. Branch: `lab/external-agent`. Spec: `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`, D17,
D18, D31. Run by a dispatched agent (D19).

## Hypothesis

An external agent (Codex now; another tool or a voice agent later) can join a guilda project, get an address from
guilda, send a question to the Architect, stop, and later, when the user talks to it again, know what the Architect
answered or did, with no polling and no process left running.

Responsibility: guilda owns the project side (addresses, delivery, stored replies, correct information). The
behavior of the external agent (voice, button, call) is not guilda's part. guilda gives it a small adapter only.

## PASS criteria (written before the run)

| ID | Check | PASS |
|---|---|---|
| X1 | Join | The external agent runs one guilda command and gets an address. The same agent gets the same address again after it stops and starts (a new session in the same project), from a file record. |
| X2 | Ask and stop | The external agent sends a question to the Architect address and gets a message ID. Its run ends before the reply exists. No process of it stays alive. |
| X3 | Reply stored | The Architect is resumed with its context, answers, and the reply is stored in the mailbox of the external agent with the ID of the question. |
| X4 | Know on return | The next time the user talks to the external agent, it knows the reply without being told to look: a hook of the external tool (or another mechanism) puts the new messages into its next turn. It tells the user what the Architect answered or did, correctly against a key. |
| X5 | Scenarios | Each scenario below has a result (PASS, FAIL or NOT POSSIBLE, with the reason): (a) one question, one reply; (b) two questions before the return; (c) the Architect asks the external agent something back; (d) the Architect changes a decision while the external agent sleeps, and the user asks "what changed?"; (e) the external agent starts a new session; (f) two external agents at the same time; (g) the reply arrives while the external agent is in the middle of a turn; (h) the Architect is busy when the question comes; (i) a question that is a user decision (R12): the answer counts as the user's only from a channel that the user named. |
| X6 | No leftovers | No process of any tool is alive at the end that the run started. Messages are not lost (each sent message is delivered or still pending). |

The final check with the real voice setup of the user is a user step. Without it, that part is NOT VERIFIED.

A stop rule: if the total use passes 1,500,000 tokens of Claude, or 1,500,000 tokens of Codex, the agent stops and
reports what it has.

## Method

## Evidence

## Verdict

## Lessons
