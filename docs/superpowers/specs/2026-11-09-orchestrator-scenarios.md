# Orchestrator scenarios — catalog

Status: draft, input for D15. Not approved (R3).
Source: the earlier single file `2026-11-09-guilda-0.2-design.md`, now the [decision register](2026-11-09-guilda-decisions.md),
mainly D12 to D18, D20 to D22 and D24, and `core/rules.md`.

Note (2026-11-10): this catalog was written before the final queue design of D14 and before G18 of D15. Changes since:

- The role name is `foreman` (D15). The catalog keeps the working name `orchestrator` in code form.
- The queue is `.guilda/queue/journal.jsonl` with a derived `state.json`, signal files and a lock (D14), not
  `.guilda/queue.json`. Hooks do not set states; a state changes only on a signal from the agent.
- G18 replaces the rule "never stop a running agent to meet a number". The foreman can stop an agent to keep the
  pace. A stop without a safe save first is an extreme step, and the foreman talks to the Architect first.
- The agent list `.guilda/agents.jsonl` of D12 is replaced by the queue journal, the one owner of agent identity.
- `guilda:doctor` is an internal `doctor` script (D24). D38 adds a resume after a usage-limit stop.

## 1. Purpose and limits

This file lists the situations that the `orchestrator` can meet. Each row gives the signal, the action and the cost.
It does not change the spec. It shows where the spec has no mechanism yet. A row with the mark **GAP** needs a spec change.

The word `orchestrator` is the working name. The role name is `foreman` (D15, decided 2026-11-09).

The role, as the user decided it:

- It starts after the Architect. It runs in the background.
- It does not talk to the user. The main session talks to the user.
- It routes each message to an address (D17). It keeps the flow of the queue running (D14).
- It sleeps in code (`guilda watch`). A healthy flow costs no tokens. It wakes only for an action.
- It never decides the pace or a product question. Before it asks the Architect, it assesses the risk.
- Each question to the Architect has the facts, 2 or 3 options and one recommendation.
- It never switches accounts. It only reads the usage from the `cswap` fork.
- It can stop an agent to keep the pace (G18). A stop without a safe save first needs the Architect first.

## 2. Signals and terms

The rows refer to these signals:

| Name | Source | Fields that the rows use |
|---|---|---|
| queue | `.guilda/queue/journal.jsonl` and `state.json` (D14) | task ID, dependencies, owner role, agent ID, state |
| agent list | `.guilda/agents.jsonl` (D12) | task ID, agent ID |
| audit log | `.guilda/audit.jsonl` (D13) | time, agent ID, task ID, tool, file path or first word of the command |
| binding table | `.guilda/` (D17), file name not set | address, tool, session or agent ID, process, timeout |
| mailbox | `.guilda/bus/<address>.jsonl` (D17) | ID, from, to, task, type, text, answer to |
| usage | `cswap pace --json` (D22) | 5-hour and 7-day percent, reset time, ahead of pace, lasts to reset, projected end, data age |
| end notice | background command of the session (D15, D18) | the watch or an external run ended |
| git | the task branch | commits after `Base commit:`, changed files, merge result |
| config | `.guilda/config.json` | `usage.source`, adapters on or off, pace setting |
| doctor | the internal `doctor` script (D2, D24) | plugin loaded, hooks live, agents present |

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

## Gap closure

Status: proposal. Not approved (R3). It does not change the rows above.

Each item gives the smallest mechanism that closes the gap. Each mechanism keeps these limits:

- No daemon. The watch is a background command of the `orchestrator` session (D15).
- One writer for the queue: the `orchestrator` (D14). Each signal file has one writer: its worker.
- A task state changes only on a signal of the worker, or on a decision event in the journal.
- A healthy flow costs no tokens. The model wakes only for an action.
- guilda never switches accounts (D22). A stop of an agent follows G18 of D15.

Format of each item: gap, mechanism, who acts, tokens, lab.

### Shared mechanisms

Some gaps share one mechanism:

- **Watch on changes** (G1, G14, G15): the watch wakes the model on a new event. A state that stays the same is not an event.
- **End reason** (G4, G15): the `done` and `failed` signals carry a reason.
- **Journal as memory** (G5, G13, G19): the D14 lock, the journal replay and the intent events.
- **Heartbeat content** (G3, G6, G18): the heartbeat carries the progress and the expected end of the current tool.
- **Bus and router** (G7, G11, G12): the D17 mailbox, with two fixed addresses and a route check.
- **Held state** (G2, G7): the state `held` with a reason.

### Items

- **G1** — The watch wakes for each ready task that it cannot dispatch.
  - Mechanism: the watch prints a line only for a new event. An event is a new signal file or a new bus line. A
    timeout that passes is an event. A change of the pace file and a time that the journal sets are also events. A ready task with no free slot is not an event. The
    `orchestrator` can write a journal event `sleep` with `until: <time>` (for example a reset time). Before that
    time, the watch wakes only for a signal file or a bus line.
  - Who acts: code.
  - Tokens: none.
  - Lab: no. Unit tests with fake signal files are sufficient.
- **G2** — The queue has no state for held, paused or "waits for the user".
  - Mechanism: a new state `held`, with two fields. `hold.reason` is `user`, `architect`, `foundation`, `seam` or
    `pause`. `hold.ref` is the ID of the open question or message. A `held` task is never `ready`. Only a journal event
    `release` with the same `ref` moves it back to `pending`. A project pause is one journal event `pause`. It holds
    each `pending` and `ready` task with reason `pause`. A `running` task continues.
  - Who acts: the `orchestrator` writes the events. The Architect or the user makes the decision.
  - Tokens: low.
  - Lab: no.
- **G3** — No field gives the weight or the progress of a task.
  - Mechanism: weight is a brief field `Weight: S | M | L` (D5). `.guilda/config.json` maps each class to agent
    hours. Progress is a field of the heartbeat signal: `items_done` and `items_total`, from the green items of the
    brief (D9). The code reads both. The model reads them only in a risk assessment.
  - Who acts: the Architect sets the weight in the plan. The code reads the progress.
  - Tokens: none.
  - Lab: yes. Does a worker write the progress in each heartbeat reliably? The D14 heartbeat lab can include it.
- **G4** — No field gives the end reason of an agent.
  - Mechanism: the `done` and `failed` signals have a field `reason`: `finished`, `error`, `limit` or `timeout`. For a
    Claude subagent, a `SubagentStop` hook in the worker writes `failed` with the reason if no `done` exists. For an
    external run, the run wrapper writes it from the exit code and the error text. A stop by the user gives no
    signal. The task becomes `stalled` with `reason: no-signal`, and `stalled` never dispatches again by itself
    (D14). The main session then asks the user (A6). A `limit` failure does not count for R10 and does not use an
    attempt.
  - Who acts: code.
  - Tokens: none.
  - Lab: yes. Which hook runs, and with which input, on an API error, a usage limit and a stop by the user?
- **G5** — No reconcile step after a restart, no heartbeat of the `orchestrator`, no lock for the role.
  - Mechanism: the D14 `lock` file gets a field `alive_at`. The watch writes it at each tick, because the watch is
    code of the lock owner. `guilda status` and the panel show "`orchestrator` down" when `alive_at` is older than
    3 ticks. A second `orchestrator` reads the lock. It takes the lock only if the process is dead or `alive_at` is
    old, and it records a takeover. Else it stops and tells the main session. The reconcile step at start is the
    D14 recovery, plus one check. An attempt of a Claude subagent from an ended session becomes `stalled`, with
    `reason: session-ended`. A dead process is a fact, so the `orchestrator` can write a `retry` event with a new
    attempt (R9). It does not wait for a decision.
  - Who acts: code, then the `orchestrator` for the retry.
  - Tokens: low.
  - Lab: yes. The D14 lab: two `orchestrator` sessions at the same time, and a session that dies.
  - USER: who starts the `orchestrator` again after a restart?
    a) A `SessionStart` hook of the main session shows "`orchestrator` down, N tasks open". The main session asks
    the user with the question tool, then starts it (recommended: no start without the user).
    b) The main session starts it without a question when open tasks exist.
    c) Only the user starts it by hand.
- **G6** — The stall time N is not set, and a long command looks like a stall.
  - Mechanism: the D14 heartbeat. A `PreToolUse` hook in the worker writes the heartbeat before each tool call. The
    heartbeat has `busy_until`: now plus the timeout of that tool. For a command, that is its timeout or 10 min. The lease timeout is the
    later of `busy_until` plus 5 min and the last heartbeat plus 15 min. The ack timeout is 2 min. For an external
    run, the wrapper writes the heartbeat on each JSON event of the tool. `stalled` is only a mark. The first
    question comes after 2 lease periods (A2).
  - Who acts: code.
  - Tokens: none while healthy, low at the question.
  - Lab: yes. The values 2 min and 15 min are a start. Measure heartbeats from subagents and from Codex.
- **G7** — No channel between the main session and the `orchestrator`, and no rule for a question with no answer.
  - Mechanism: two fixed addresses in the D17 bus: `main` and `orch`. The main session appends to `bus/orch.jsonl`.
    The watch sees the new line and wakes the `orchestrator`. The `orchestrator` appends to `bus/main.jsonl`, and
    sends a `SendMessage` to the main session to give it a turn. The panel shows open questions. A question with
    no answer has no time limit and no default answer. The tasks that need it stay `held` (G2). The other tasks
    run. The `orchestrator` does not ask again. It adds the open questions to the summary for the user.
  - Who acts: code and the `orchestrator`.
  - Tokens: low.
  - Lab: yes. Does a `SendMessage` from the background session give the idle main session a turn? Does the panel
    show the line?
- **G8** — No resume count and no limit for a new agent on an address.
  - Mechanism: the binding table gets `resumes` and `context_tokens`, from the transcript of the agent. A config
    value `agent.context_limit` sets the limit. Over the limit, a new agent takes the address for the next message.
    It gets the ledger and a summary. The change occurs only between two messages, never during a run.
  - Who acts: code counts. The `orchestrator` makes the change.
  - Tokens: low.
  - Lab: yes. E2 sets the limit.
- **G9** — No age limit and no behavior for old usage data.
  - Mechanism: a config value `usage.max_age_min`, 15 by default. When the data age is over it, the code treats the
    usage as unknown. It keeps the current pace and asks no pace question. The panel shows "usage data old". The
    first fresh sample removes the mark.
  - Who acts: code.
  - Tokens: none.
  - Lab: no.
- **G10** — No usage source for Codex accounts.
  - Mechanism: Codex agents count in the agent limit (D22). The log records the tokens of each Codex run from
    `--json`. A Codex limit error gives `reason: limit` (G4). Then the code holds the Codex tasks, and the
    `orchestrator` asks the Architect as in E7.
  - Who acts: code, then the Architect on a limit error.
  - Tokens: none, low on a limit error.
  - Lab: no.
  - USER: how does guilda plan the pace of Codex work with no usage percent?
    a) Count only the agents and the tokens, and act on the limit error (recommended: no new data source).
    b) Use Codex only for light tasks.
    c) Wait for a usage source for Codex before a Codex task in a wave with a deadline.
- **G11** — No rule for a message that cannot be delivered.
  - Mechanism: the router never drops a message. The message stays in the mailbox. The router appends a reply of
    type `error` to the sender, with `reason`: `no-address`, `tool-off` or `agent-gone`. For `tool-off`, the
    `orchestrator` asks the Architect to bind another tool (M2). For `agent-gone`, it binds a new agent (D17).
  - Who acts: code. The Architect decides only for `tool-off`.
  - Tokens: none, low for `tool-off`.
  - Lab: no. The D18 failure lab can include it.
- **G12** — No table of the allowed routes between roles.
  - Mechanism: a file `core/routes.json` in the plugin. Each line gives the sender role, the receiver role and the
    message types. It comes from the rules, for example the R11 routes and the D12 route through the Architect. The
    router checks each message. A message on a route that is not in the table gets the `error` reply of G11, with
    `reason: route`. A copy goes to the Architect.
  - Who acts: code.
  - Tokens: none.
  - Lab: no.
- **G13** — No lock and no atomic write for the files in `.guilda/`, and no rule for a failed write.
  - Mechanism: D14 closes most of it. The queue has one writer and an append-only journal. `state.json` is written
    by temp file and rename. Each signal file has one writer. Rule for the other files: each file has one writer. A bus line is one
    `O_APPEND` write of less than 4 KB. A longer text goes to a separate file, and the line refers to it. A failed
    write by the `orchestrator` ends the watch with `io-error`. Then the `orchestrator` stops new dispatches, and
    running agents continue. A failed write of a worker gives no signal, so the task becomes `stalled` (a safe
    result).
  - Who acts: code.
  - Tokens: none, low on an error.
  - Lab: yes. The D14 lab: a crash in the middle of an append, `rename` on the project file system, a full disk.
- **G14** — The watch does not wake when the queue cannot move.
  - Mechanism: when the plan loads, the code checks for a dependency cycle and refuses the queue with the cycle.
    At each tick, the watch checks for a blocked queue. A blocked queue has no task `dispatched`, `running` or
    `ready`, but it has tasks in `pending` or `held`. It prints `blocked` one time (G1). The `orchestrator` sends the blocked chain to the
    Architect.
  - Who acts: code, then the Architect.
  - Tokens: low.
  - Lab: no.
- **G15** — No back-off after several failures at the same time.
  - Mechanism: 3 or more attempts of different tasks can end with `reason: error` or `limit` in 10 min. Then the
    watch prints `outage` one time. The `orchestrator` writes a `sleep` event (G1) with a
    back-off of 2, 4, 8 and then 30 min at most. After the sleep, it retries one light task. These failures do not
    count for R10 and do not use attempts.
  - Who acts: code. The `orchestrator` wakes one time for the notice.
  - Tokens: low.
  - Lab: no. The G4 lab gives the error reasons.
- **G16** — No source shows the side tasks of the user that the agent limit counts.
  - Mechanism: the reserve of the D22 pace setting, as a count of slots for the user. The usage percent already
    includes the side tasks (P11).
  - Who acts: the Architect sets the reserve with the user.
  - Tokens: none.
  - Lab: no.
  - USER: how does the agent limit count your own side tasks?
    a) A fixed reserve of slots in the pace setting, for example 1 (recommended: simple and predictable, as in #11).
    b) No reserve. Only the usage percent shows them.
    c) The main session counts the background tasks that it can see.
- **G17** — The file of the pace setting is not named, and the watch does not read it.
  - Mechanism: `.guilda/pace.json`. Only the Architect writes it, with the user. The watch reads it at each tick. A
    change is an event (G1) only when it opens a slot. A lower pace never stops a running agent. It applies at the
    next dispatch.
  - Who acts: code.
  - Tokens: none, low when a slot opens.
  - Lab: no.
- **G18** — A Claude subagent has no run timeout, and the spec does not say who can stop it.
  - Mechanism: no automatic stop. A soft limit is 3 times the hours of the `Weight:` class (G3). After it, or after 2
    lease periods with no heartbeat (G6), the `orchestrator` asks the Architect with the facts. Only the
    `orchestrator` session can stop its background subagent, so it runs the stop after the decision.
  - Who acts: the user decides. The `orchestrator` executes.
  - Tokens: medium, one time.
  - Lab: yes. Can the `orchestrator` session stop its own background subagent? Which end signal comes after it?
  - USER: who can approve the stop of a stuck Claude subagent?
    a) The user only, through the main session and the question tool (recommended: a stop can lose work).
    b) The Architect, with no question to the user.
    c) Nobody. Only the user stops it by hand.
- **G19** — The state of the `orchestrator` (open questions, a dispatch in progress) is not in a file.
  - Mechanism: the journal holds it. Before a dispatch, the `orchestrator` appends `dispatch-intent` with the attempt
    ID and the address. After the dispatch, it appends `dispatch-ok` with the agent ID. The worker writes the attempt
    ID in its `started` signal. At replay, an intent with no `dispatch-ok` and no `started` signal after the ack
    timeout becomes `stalled`. It never dispatches again by itself. An open question is a `question` event, and the
    answer is an `answer` event with the same ID. The context diary (R18) then refers to the journal.
  - Who acts: code.
  - Tokens: none.
  - Lab: yes. The D14 lab: a crash between the intent and the dispatch.

### Summary

| Who acts | Gaps |
|---|---|
| Code only | G1, G4, G6, G9, G12, G13, G15, G17, G19 |
| Code and the `orchestrator` | G7, G8 |
| The Architect decides | G2, G3, G11, G14 |
| USER decision | G5, G10, G16, G18 |

Gaps that need a lab: G3, G4, G5, G6, G7, G8, G13, G18, G19. Most of them fit in the D14 lab, which is already open.
