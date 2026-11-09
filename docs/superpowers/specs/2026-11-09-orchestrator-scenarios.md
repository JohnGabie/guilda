# Orchestrator scenarios — catalog

Status: draft, input for D15. Not approved (R3).
Source: `2026-11-09-guilda-0.2-design.md`, mainly D12 to D18, D20 to D22 and D24, and `core/rules.md`.

## 1. Purpose and limits

This file lists the situations that the `orchestrator` can meet. Each row gives the signal, the action and the cost.
It does not change the spec. It shows where the spec has no mechanism yet. A row with the mark **GAP** needs a spec change.

The word `orchestrator` is a working name. The role name is open (D15). The glossary forbids the plain word, so this file writes it as code.

The role, as the user decided it:

- It starts after the Architect. It runs in the background.
- It does not talk to the user. The main session talks to the user.
- It routes each message to an address (D17). It keeps the flow of the queue running (D14).
- It sleeps in code (`guilda watch`). A healthy flow costs no tokens. It wakes only for an action.
- It never decides the pace or a product question. Before it asks the Architect, it assesses the risk.
- Each question to the Architect has the facts, 2 or 3 options and one recommendation.
- It never switches accounts. It only reads the usage from the `cswap` fork.
- It never stops a running agent to meet a number.

## 2. Signals and terms

The rows refer to these signals:

| Name | Source | Fields that the rows use |
|---|---|---|
| queue | `.guilda/queue.json` (D14) | task ID, dependencies, owner role, agent ID, state |
| agent list | `.guilda/agents.jsonl` (D12) | task ID, agent ID |
| audit log | `.guilda/audit.jsonl` (D13) | time, agent ID, task ID, tool, file path or first word of the command |
| binding table | `.guilda/` (D17), file name not set | address, tool, session or agent ID, process, timeout |
| mailbox | `.guilda/bus/<address>.jsonl` (D17) | ID, from, to, task, type, text, answer to |
| usage | `cswap pace --json` (D22) | 5-hour and 7-day percent, reset time, ahead of pace, lasts to reset, projected end, data age |
| end notice | background command of the session (D15, D18) | the watch or an external run ended |
| git | the task branch | commits after `Base commit:`, changed files, merge result |
| config | `.guilda/config.json` | `usage.source`, adapters on or off, pace setting |
| doctor | `guilda:doctor` checks (D2) | plugin loaded, hooks live, agents present |

Token cost of a row:

- none: only code runs (`guilda watch`, the router, a hook). No model call.
- low: one wake. The `orchestrator` reads a few files and does one action or sends one message.
- medium: one wake with a risk assessment. It reads several tasks and the usage, and writes one question.

Question format to the Architect (D22):

```
Q: <one question>
Facts: <tasks, progress, weight, usage, reset times>
Options: a) ... b) ... c) ...
Recommendation: <a, b or c, with the reason>
```

The rows below give the question in short form.

## 3. Task state (T)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| T1 | A task is `pending`. Its dependencies are `done`. Fewer agents run than the pace allows. | queue: state and dependencies. Count of `running` tasks in the queue and the binding table. | Dispatch the task with a new address (D17). The hook sets `running`. | None. | low |
| T2 | A task is ready, but the count of agents is at the pace number. | Same as T1, but the count is full. | Wait for a free slot. Do not wake again for the same task. | None. | none. **GAP G1**: the watch wakes for each ready task (D15). It has no rule to stay asleep when no action is possible. Each tick then costs tokens. |
| T3 | A heavy task is ready. The accounts are near the 5-hour limit (D22 scenario 2). | queue: ready task. usage: 5-hour percent and reset time. Weight of the task. | Do not dispatch the heavy task. Assess the risk. | "T7 is heavy, about 2 agent hours. Accounts at 88 %, reset in 50 min. a) start T7 after the reset; b) start T7 now at pace 1; c) start a light ready task now. Recommendation: a." | medium. **GAP G3**: no field gives the weight of a task. |
| T4 | A task just started or is halfway. Its agent works. | audit log: recent lines. Commits arrive. | Nothing. The watch prints nothing. | None. | none |
| T5 | A heavy task is near its end, with about 1 agent hour left. The accounts are near the 5-hour limit (D22 scenario 1). | usage. Commits of green items against the items of the brief (D9). Weight of the task. | Let the task run. Never stop it. Dispatch no new task. Assess the risk. | "T4 needs about 1 h more. Accounts at 92 %, reset in 40 min. a) let T4 finish, dispatch nothing until the reset; b) let T4 finish, also run light T8; c) hold all other work for 1 h. Recommendation: a." | medium. **GAP G3**: no field gives the progress of a task. The count of commits is only an estimate. |
| T6 | A task waits for a dependency that is `running` or `review`. | queue: a dependency is not `done`. | Nothing. | None. | none |
| T7 | A dependency is `failed`, or it has its third rejection. Its dependent tasks cannot start. | queue: state `failed`. Count of rejections (R11). | Dispatch other independent tasks. Tell the main session which chain is blocked. | "T3 failed 3 times. T5 and T6 need it. a) rewrite the T3 brief; b) split T3; c) drop T5 and T6 from this wave, with the user's approval. Recommendation: a." | low. **GAP G14**: the watch does not wake when the queue cannot move. That is no ready task, no running task, and pending tasks left. A dependency cycle is the same case. |
| T8 | A task waits for a decision of the user: taste, scope, a merge or a release (R12). | mailbox: a message of type question to the user. Reviewer verdict: `User must look:`. | Send the question to the main session. The main session asks it with the question tool (D23). Run the other tasks. | None. The decision belongs to the user. | low. **GAP G2**: the queue has no state for "waits for the user" or "held". The watch then sees the task as ready or stalled. |
| T9 | All tasks of a wave are `done`. | queue: each task of the wave is `done`. | Search the code for `guilda:consolidate` markers (D9). Dispatch the wave review if the process level asks for it (D1). Send a summary of the wave to the main session. | None. Helper drift goes to E5. | low |

## 4. Agent state (A)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| A1 | An agent runs and is healthy. | audit log: a new line in the last N min. | Nothing. | None. | none |
| A2 | An agent is alive but silent. No commit and no file change for N min. | audit log: last line older than N. git: no new commit. binding table: the process exists. | Mark the task `stalled` and wait one more period. Never stop the agent. A long test run can look the same. | After the second period: "T4 is silent for 40 min. Last tool: a command at 14:02. Last commit at 13:30. a) wait one more period; b) stop it and give its address to a new agent with the ledger; c) ask the user. Recommendation: a." | low, then medium. **GAP G6**: N is not set. The audit log writes a line only after a tool call (PostToolUse). A long command therefore looks like a stall. **GAP G18**: a Claude subagent has no run timeout. The spec does not say who can stop a stuck subagent. |
| A3 | An external run (Codex or `claude -p`) crashed. | end notice. binding table: process ended, exit code not 0. | Count the output as nothing (R9). Resume the session once. If the resume fails, give the address to a new agent with the ledger and the earlier transcript (D17). | None. After a second failure on the same problem, apply R10 (one tier up). Ask only if no higher tier exists. | low |
| A4 | A Claude subagent ended with an error, for example an API error. | `SubagentStop` sets `review`. The final answer does not have the reply format. The hook sends it back once (D17). | Count the output as nothing (R9). Resume the agent once. | None. | low. **GAP G4**: `SubagentStop` sets `review` for each end. No field gives the end reason: finished, error, usage limit or stopped by the user. |
| A5 | An agent finished, but it sent no report or made no commit. | queue: `review`. mailbox: no reply. git: no commit after `Base commit:`, or a worktree with changes. | Resume the agent once. Ask for the report and a commit for each green item (D9). If nothing comes again, apply R9 and give the address to a new agent. | None. | low |
| A6 | The user stopped an agent. It cannot be resumed (D12). | No signal. It looks the same as A4. | Do not dispatch a new agent by itself, because the stop can be the user's intent. Tell the main session. The main session asks the user: new agent, hold or drop. | None. The decision belongs to the user. | low. **GAP G4**: no signal shows a stop by the user. The `orchestrator` can replace an agent against the user's intent. |
| A7 | The context of an agent is near full after many resumes. | binding table: count of resumes. Size of the transcript. | Between two messages, give the address to a new agent with the ledger and a summary (D17). Never during a run. | None. | low. **GAP G8**: no limit is set (E2 is open), and the binding table has no resume count. |

## 5. Context of the `orchestrator` (C)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| C1 | The `orchestrator` starts fresh. | First turn of the session. | Read the config, the queue, the binding table, the mailboxes and the usage. Start `guilda watch`. | None. | low |
| C2 | The context of the `orchestrator` is near compaction. | The host warns, or the context diary is due (R18). | Fill the diary: open questions, the last action, the state of the watch. The flow itself is already in files. | None. | low. **GAP G19**: the open questions of the `orchestrator` and a dispatch in progress are not in a file. R18 blocks only a manual compaction. |
| C3 | The `orchestrator` resumes after compaction. | The summary and the diary. | Read the files again. Check that the watch runs. Check for a half dispatch: an address in the binding table, but no agent ID. | None. | low. **GAP G19**: without a dispatch record, a half dispatch can run twice. |
| C4 | The session restarted. The `/loop` and the watch ended. The old Claude subagents are gone, but the queue still shows `running`. | binding table: session IDs of the old session. No process. | Reconcile. For each old Claude subagent, apply R9 and give the address to a new agent. Resume each `claude -p` and Codex session. The D18 clean-up stops old processes. | None. | medium. **GAP G5**: the spec has no reconcile step at start. Nothing starts the `orchestrator` again after a restart. |
| C5 | The `orchestrator` session ended, or its `/loop` expired after 7 days. The main session still runs. | No signal. | Nothing. Nobody sees it. | None. | none. **GAP G5**: the `orchestrator` has no heartbeat. The panel (D20) and `guilda status` (D21) cannot show "orchestrator down". |
| C6 | Two `orchestrator` sessions run on one project. | No signal. | Both dispatch the same ready task. | None. | low. **GAP G5**: no lock or lease for the role. |

## 6. Usage and pace (P)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| P1 | The work is under the pace. The accounts will reset at about 70 % (D22 scenario 3). | usage: projected end below the target, ahead of pace "no". queue: ready tasks wait. | Assess the risk. Do not change the pace. | "Accounts reset in 2 h at about 70 %. 3 tasks are ready. a) raise the pace from 2 to 3 agents; b) keep 2. Recommendation: a." | medium |
| P2 | The work is on pace. | usage: on the target line. | Nothing. | None. | none |
| P3 | The accounts are near the 5-hour limit. Only light tasks run. | usage: 5-hour percent, reset time. | Let the running agents finish. Dispatch nothing new. Assess the risk. | "Accounts at 90 %, reset in 1 h 10 min. a) wait for the reset; b) go to pace 1; c) hold tasks that are not urgent. Recommendation: a." | medium |
| P4 | The accounts are near the weekly limit. A 5-hour reset does not give back weekly usage (D22 scenario 4). | usage: 7-day percent and the weekly reset. | Same as P3. Do not count the 5-hour reset as capacity. | "Weekly limit at 95 % on all accounts. First weekly reset in 2 days. a) critical tasks only, pace 1; b) hold all work until the reset; c) the Architect asks the user to move the deadline. Recommendation: a." | medium |
| P5 | All accounts are at their limit. | usage: each account at 100 %, or each run ends with a limit error. | Dispatch nothing. Sleep until the first reset. Send one notice to the main session. | Only if the deadline is now at risk. Then as P4. | low. **GAP G1**: the watch has no "sleep until" time. It wakes again for each ready task. **GAP G4**: a run that hits the limit looks like a crash. It must not count for R10. |
| P6 | One account resets soon, for example in 40 min. The others are near the limit (D22 scenario 5). | usage: reset times of each account. | Assess the risk. Never switch the account. `cswap` does that. | "Account 2 resets in 40 min. a) start heavy T7 after that reset; b) start light T8 now. Recommendation: a." | medium |
| P7 | The usage data is old. | usage: data age over the limit. | Treat the values as unknown. Keep the current pace. Ask no pace question on old data. Show "usage data old" to the main session. | None. | low. **GAP G9**: the spec lists this case (scenario 7), but it gives no age limit and no behavior. |
| P8 | `cswap` is off, or `usage.source` is `"off"`. | config, or no `cswap` command. | The usage function is off. Use the pace of the plan. No pace warning (D22). | None. | none |
| P9 | The use of the accounts is uneven (D22 scenario 6). | usage: one account at its limit, one at 30 %. | Nothing. Plan with the total capacity of all accounts. Even use is the work of the `cswap` fork. | None. | none |
| P10 | The measured cost of the done tasks is much higher than the plan. The deadline is at risk. | audit log: tokens of each task (D22). Estimate of agent hours against the time left. | Compute the estimate again, with its range. | "At the measured cost, the work ends 6 h after the deadline. a) raise the pace; b) the Architect asks the user to move the deadline; c) the Architect asks the user to cut scope. Recommendation: b." | medium |
| P11 | Work outside guilda uses the same accounts, for example the user's own side tasks. The agent limit counts them (D22). | usage rises more than the guilda agents explain. | Use the usage values as they are. | None. | low. **GAP G16**: no source shows the side tasks of the user. The count of agents can be wrong. |

## 7. Errors (E)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| E1 | A test fails in a task. The Reviewer rejects with `REJECTED-SMALL`. | Verdict: `Result:` line. | Route the verdict to the address of the Executor. Count the rejection (R11). | None. On `REJECTED-LARGE` or the third rejection, send the task to the Architect (R11). | low |
| E2 | An Executor fails twice on the same problem. | Count of failures of the task. | Apply R10: one tier up. Tell the main session, because a higher tier uses more. | Only at the top tier: "T5 failed twice at the top tier. a) split T5; b) rewrite the brief. Recommendation: a." | low |
| E3 | Tests fail on the base commit before the task changes anything. | Executor report: a failing test outside the brief. | Hold the task. Route the report to the Architect (foundation fix, D9). | "Base test X fails before T5. a) a foundation fix task first; b) T5 continues and the test stays red. Recommendation: a." | medium. **GAP G2**: no state holds the task. |
| E4 | A seam defect (#8). An agent finds a bug in a shared part that it does not own, or a join test fails. | Executor message of the foundation-fix type. Join test result of its owner task (D9 table). | Hold the tasks that use that part. Let the others run. No local workaround. | "Join test T3↔T5 fails on field X. T3 is done, T5 runs. a) a foundation fix task before T5 merges; b) resume T3 with the fix. Recommendation: a." | medium. **GAP G2**: no state holds the dependent tasks. |
| E5 | Helper drift (#9). Two tasks wrote the same helper. | `guilda:consolidate` markers in the code at the end of the wave (T9). | List the markers. | "3 copies of a date helper are marked. a) a consolidate task now; b) after the next wave. Recommendation: a." | low |
| E6 | A merge conflict between parallel tasks. | git: the merge at integration fails. The version-control role reports it. | Hold the dependent tasks. After the user approves the merge, give the conflict to version-control (D10). | Only if two briefs touch one file (R8). Then the plan has a defect. | low |
| E7 | A tool is missing. For example, Codex is not installed for a Codex task. | doctor, or the first dispatch fails at once. | Do not dispatch the task. | "T6 is for Codex. Codex is not installed. a) run T6 on Claude at the same tier; b) hold T6 until the user installs Codex. Recommendation: a." | low |
| E8 | `gh` is not logged in. | doctor. | Nothing. Only the user starts a push, a pull request or a field report. A QA tool that is missing goes to R21. | None. | none |
| E9 | An external tool hangs. The run limit stops it (D18). | binding table: timeout. End notice. | Count the output as nothing (R9). Resume once. | After a second timeout: "T6 timed out twice at 20 min. a) a longer timeout; b) split T6. Recommendation: b." | low |
| E10 | The disk is full, or a permission error stops a write. | A write to `.guilda/` fails. A hook exits with an error. | Stop new dispatches. Running agents continue. Tell the main session, because the user must act. | None. | low. **GAP G13**: no rule covers a hook that cannot write. The queue can then show a wrong state with no warning. |
| E11 | The queue file is not valid JSON, or two hooks write it at the same time. | The watch cannot read the queue. | Stop new dispatches. Tell the main session. | None. | low. **GAP G13**: no lock and no atomic write for the files in `.guilda/`. |
| E12 | Several agents fail in the same minutes, for example on a network failure or an API outage. | Several end notices in a short time. | Do not dispatch again in a loop. Wait, then try one task. | None. | low. **GAP G15**: no back-off rule. R10 can move each task up a tier by error. |
| E13 | The guilda hooks are not live (D2). A dispatch does not set `running`. | queue: no change after a dispatch. doctor: FAIL. | Stop new dispatches. Tell the main session that guilda is off. | None. | low |

## 8. User (U)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| U1 | The user interrupts and asks to pause the work. | A message from the main session. | Dispatch nothing new. Running agents finish. Stop an agent only if the user asks for that (D18 stop command). | None. | low. **GAP G7**: the spec does not name the channel between the main session and the `orchestrator`. **GAP G2**: no pause state. |
| U2 | The user changes the pace or the deadline. | The Architect writes the new pace setting. | Read it again. Apply it at the next dispatch. Do not stop a running agent to lower the count. | None. | low. **GAP G17**: the spec does not name the file of the pace setting, and the watch does not read it. |
| U3 | The user adds a task in the middle of the flow. | The Architect adds the brief and a queue entry. The watch sees a new `pending` task. | Dispatch it when it is ready. Compare its file list with the running tasks. | Only if the file lists overlap: "T9 touches a file that T4 owns now. a) start T9 after T4; b) the Architect splits the file list. Recommendation: a." | low |
| U4 | The user cancels a task while its agent runs. | The Architect changes the state in the queue. | Stop the agent, because the user asked for it. Keep the commits for the user. | None. | low |
| U5 | The user is away for hours. A decision is open. | The question in the main session has no answer. | Run each task that does not need the decision. Hold the others. Do not ask again. Write one summary for the user's return. | Usage questions still go to the Architect. The Architect is the main session, and it can wait on the user's open question. | low. **GAP G7**: no rule says what happens when the Architect does not answer, and there is no time limit. |
| U6 | The user runs side tasks on the same accounts. | See P11. | See P11. | None. | low. **GAP G16**. |

## 9. Mixed tools (M)

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| M1 | Claude and Codex agents run in one wave. | binding table: the tool of each address. | Count all agents in the limit (D22). Run Codex with the options that stop extra loads (D18). | None. | low. **GAP G10**: no usage source for Codex accounts (D22 `@open`). The pace risk of Codex is unknown. |
| M2 | A message goes to an address whose tool is not available, for example Codex is off in the config. | Router: the tool of the binding is not available. | Keep the message in the mailbox. It is append-only, so it stays. | "The address of T6 is a Codex agent. Codex is off. a) bind a Claude agent to the address, with the ledger and the transcript; b) hold until Codex returns. Recommendation: a." | low. **GAP G11**: no rule for a message that cannot be delivered. |
| M3 | A Codex agent needs an answer during its run. | The question is in its final answer. No push reaches an idle Codex (D15). | Route the question. Resume Codex with the answer (`codex exec resume`). | Only if the question is about the product. Then route it to the Architect. | low |
| M4 | The model of a tier is not available (ARC4). | The dispatch fails with a model error. | Use one tier lower. Tell the main session (D10). | None. | low |

## 10. Message routing (R)

This dimension was not in the first list. Routing is a main job of the role, so it gets its own rows.

| ID | Situation | Detection | Own action | Question to the Architect | Tokens |
|---|---|---|---|---|---|
| R1 | A message goes to an address with an idle agent. | mailbox: a new line. | The router resumes the bound agent (D17). | None. | none |
| R2 | A message goes to a busy agent. | binding table: the agent runs. | The router delivers the messages one at a time, in order. | None. | none |
| R3 | A message goes to an address that does not exist. | binding table: no entry. | Do not deliver. Reply to the sender with the error. | None. | low. **GAP G11**. |
| R4 | A reply is missing. | `SubagentStop`: no reply format. The hook sends the agent back once (D17). | If it is still missing, apply R9 and tell the sender. | None. | low |
| R5 | An agent asks a product or taste question. | mailbox: type question, to the Architect or to the user. | Route it to the main session. Never answer it. | None. The `orchestrator` routes only. | low |
| R6 | The Reviewer asks the Executor a question (D12). | Verdict: `Questions:` section. | Route it through the Architect (D12). The ledger keeps the question and the answer. | None. | low |
| R7 | A message breaks a route of the rules, for example a QA report to the Executor (R11). | mailbox: from, to and type. | Nothing. It cannot tell an allowed route from a forbidden route. | None. | low. **GAP G12**: no table of the allowed routes. |
| R8 | A message of type `ack`. | mailbox: type `ack`. | Store it. Do not deliver it (D18). | None. | none |

## 11. GAP list

Each item names what is missing. The rows that need it are in brackets.

- **G1**: the watch cannot sleep until a time or a condition. It wakes for each ready task that it cannot dispatch (T2, P5).
- **G2**: the queue has no state for held, paused or "waits for the user" (T8, E3, E4, U1).
- **G3**: no field gives the weight or the progress of a task. The D22 risk assessment needs both (T3, T5).
- **G4**: no field gives the end reason of an agent. It can be done, an error, a usage limit or a stop by the user (A4, A6, P5).
- **G5**: no reconcile step after a restart. The `orchestrator` has no heartbeat, and the role has no lock (C4, C5, C6).
- **G6**: the stall time N is not set. The audit log has no line when a command starts (A2).
- **G7**: the spec names no channel between the main session and the `orchestrator`. No rule covers a question with no answer (U1, U5).
- **G8**: no resume count and no limit for a new agent on an address (A7).
- **G9**: no age limit and no behavior for old usage data (P7).
- **G10**: no usage source for Codex accounts (M1).
- **G11**: no rule for a message that cannot be delivered (M2, R3).
- **G12**: no table of the allowed routes between roles (R7).
- **G13**: the files in `.guilda/` have no lock and no atomic write. No rule covers a failed write (E10, E11).
- **G14**: the watch does not wake when the queue cannot move, for example on a cycle (T7).
- **G15**: no back-off rule after several failures at the same time (E12).
- **G16**: no source shows the side tasks of the user that the agent limit counts (P11, U6).
- **G17**: the file of the pace setting is not named, and the watch does not read it (U2).
- **G18**: a Claude subagent has no run timeout. The spec does not say who can stop a stuck subagent (A2).
- **G19**: the `orchestrator` state (open questions, a dispatch in progress) is not in a file (C2, C3).
