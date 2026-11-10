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

All runs on 2026-11-09, on one Fedora machine, Node 24, Claude Code 2.1.321, model `sonnet` (`claude-sonnet-5-5`).
The lab folder is `<labdir>` (a `mktemp -d` folder in the scratchpad). It stays in place.

### Q1, Q2, Q3: the tool list and the docs

- The agent that ran this lab is a background subagent of the main session (depth 1). It recorded its own tool list
  at the start, before it loaded more tools.
- Q2 try: it dispatched one `general-purpose` subagent on `haiku`. The prompt asked for one word and the tool list.
  Later it sent that finished subagent a message with `SendMessage` and its agent ID (a resume by ID).
- Docs read on 2026-11-09: `code.claude.com/docs/en/sub-agents`, `agent-teams`, `agent-view`, `interactive-mode`.

### Q4, Q5, Q6: the simulated project

Scripts are in `labs/architect-agent/`:

| File | What it has |
|---|---|
| `scenario.json` | 17 user turns for a toy feature (a CLI todo app with tags). 11 Architect turns: A1 to A8 (requirements, a spec question, the answer, a change of a decision, plan, brief, a `REJECTED-LARGE` verdict, a late change) and R1 to R3 (recall questions about early decisions). 6 chatter turns C1 to C6 (2 status checks, 4 small unrelated asks). |
| `recall-key.md` | The correct answers to R1 to R3, written before the runs. |
| `roles.md` | The role texts: `architect-in-main` for way (a), `architect-agent` and `light-main` for way (b). |
| `run.mjs` | The driver. `node run.mjs <a\|b> <out-dir> [token-cap]`. |
| `summarize.mjs` | Prints the tables below from the `log.jsonl` of each way. |
| `results/` | Copies of the two `log.jsonl` files, the Q1 cycle replies (A2, A3) and the recall replies. |

Each call is one headless call:

```
claude -p <text> --model sonnet --output-format json --tools "" --strict-mcp-config
  --setting-sources project --disable-slash-commands --append-system-prompt-file <role file>
  [--resume <session_id>]
```

- No tools, so each call is one model request. The `usage` of the JSON result is the size of that request.
  Context of a call = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Tokens of a call =
  context + `output_tokens`.
- The Architect role files have the role text, then the full text of `skills/architect/SKILL.md`.
- Way (a): one session gets all 17 turns, with the `architect-in-main` role.
- Way (b): an Architect session gets the 11 Architect turns. Then the light main session gets the user text. It also
  gets the `QUESTION:` and `SUMMARY:` part of the Architect reply, and nothing more. The light main session also gets
  the 6 chatter turns. This copies a main session that routes a message to the Architect and gets back a short
  result. The cost of the Agent tool call itself is not in the simulation.
- Q1 path in way (b): A2 asks the Architect to return the storage decision as a question. The light main session
  gives that question to the user. A3 is the scripted answer, sent back to the Architect.
- Q6: before and after each call, the driver lists the processes that run in the out dir. It ignores PIDs 603989 and
  603998. It also checks if the PID of the `claude` call still exists.
- Stop rule: the driver stops a way when it passes 750,000 tokens. Neither way got to it.
- `--no-session-persistence` breaks `--resume` ("No conversation found with session ID"), so the runs did not use
  it. The sessions are in the Claude Code session store of the user (`~/.claude/projects/`), not in `<labdir>`.

## Evidence

### Q1 and Q2: the tool list of a subagent

The tool list of the lab agent (a background subagent, depth 1), at the start:

- Loaded: `Agent`, `Artifact`, `Bash`, `Edit`, `Read`, `Skill`, `ToolSearch`, `Write`, and 3 Claude Docs MCP tools.
- Deferred (load with `ToolSearch`): `SendMessage`, `Monitor`, `TaskStop`, `WebFetch`, `WebSearch`, `NotebookEdit`,
  `EnterWorktree`, `ExitWorktree`, `ArtifactComments`, `ArtifactData`, and MCP tools.
- `AskUserQuestion`: not in the list, not loaded and not deferred.

The dispatch try: the `Agent` call returned an agent ID and ran in the background. The child (depth 2) replied
`NESTED-OK`. Its own tool list also had `Agent` and `SendMessage`. A later `SendMessage` to its agent ID resumed it,
and it gave its first word again (`NESTED-OK`). Tokens: 32,458 and 32,990.

From `sub-agents` (2026-11-09):

- "the first removes a short list of tools from every subagent ... `AskUserQuestion`"
- "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the
  depth limit, Claude Code withholds the `Agent` tool from every subagent except a fork."
- "Claude uses the `SendMessage` tool with the agent's ID or name as the `to` field to resume it."
- "Resumed subagents retain their full conversation history, including all previous tool calls, results, and
  reasoning."
- "Main conversation compaction: when the main conversation compacts, subagent transcripts are unaffected."
- "Subagents support automatic compaction. Compaction triggers as the subagent's own context window fills."

### Q1: the question cycle (way b)

1. A2: the Architect wrote the spec outline. Then it stopped with a `QUESTION:` block in the D23 form. It had all
   parts. Where: D11, storage. What: JSON or SQLite. A scenario: two commands at the same time, or a power loss.
   Options A (SQLite) and B (JSON), each with its effects. The recommendation first (A).
2. The light main session gave the user the same question with both options and "Which one do you want?".
3. A3: the answer went back. The Architect changed D11 to `@decided` "Storage is SQLite, in the file
   `~/.todo/todo.db`", and wrote the ID rule as `INTEGER PRIMARY KEY AUTOINCREMENT`.
4. R1 at the end: the Architect gave the same answer again (below).

### Q3: direct talk with a background agent (docs only)

| Path | What the docs say | Status |
|---|---|---|
| Subagent panel | "With a fork's or subagent's transcript open, follow-up messages and skills go to that agent." Keys: `↑`/`↓` select a row, `Enter` opens it. `Ctrl+Enter` sends while it waits: "Requires Claude Code v2.1.286 or later." | No experimental label on this part |
| Agent teams | "You can also talk to any teammate directly without going through the lead." In-process: arrows, `Enter`, type. | "Agent teams are experimental and disabled by default" (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Not in `-p` mode. |
| Agent view (`claude agents`) | "Type a reply in the peek panel and press `Enter` to send it to that session." Applies to background sessions: "Subagents and teammates a session spawns aren't listed as separate rows." | "Agent view is in research preview." |

### Q4 and Q5: tokens of each turn

Context and output tokens of each call. In way (b), an Architect turn has an Architect call and then a main call.

| Turn | (a) context | (a) output | (b) main context | (b) main output | (b) Architect context | (b) Architect output |
|---|---:|---:|---:|---:|---:|---:|
| A1 | 6079 | 1007 | 3683 | 210 | 6128 | 969 |
| C1 | 7118 | 149 | 3924 | 44 | - | - |
| A2 | 7371 | 2564 | 4678 | 182 | 7201 | 2436 |
| A3 | 9998 | 2509 | 5498 | 211 | 9700 | 2976 |
| C2 | 12531 | 213 | 5731 | 98 | - | - |
| A4 | 12802 | 1868 | 6368 | 217 | 12734 | 2972 |
| C3 | 14694 | 95 | 6607 | 57 | - | - |
| A5 | 14823 | 6585 | 7321 | 354 | 15740 | 5627 |
| A6 | 21435 | 4947 | 7901 | 208 | 21394 | 5216 |
| C4 | 26413 | 196 | 8138 | 149 | - | - |
| A7 | 26712 | 2372 | 8592 | 259 | 26713 | 2244 |
| C5 | 29104 | 174 | 8869 | 31 | - | - |
| A8 | 29339 | 5839 | 9622 | 343 | 29018 | 5026 |
| C6 | 35206 | 82 | 9991 | 109 | - | - |
| R1 | 35311 | 110 | 10234 | 79 | 34067 | 259 |
| R2 | 35440 | 277 | 10454 | 126 | 34345 | 259 |
| R3 | 35743 | 140 | 10715 | 103 | 34630 | 195 |

| Measure | (a) | (b) |
|---|---:|---:|
| Calls | 17 | 28 (main 17, Architect 11) |
| Context at the end, main session (last context + last output) | 35,883 | 10,818 |
| Context at the end, Architect session | (same session) | 34,825 |
| Total tokens (input + cache read + cache write + output) | 389,246 | 390,955 |
| Cache read | 324,972 | 315,502 |
| Cache write | 35,081 | 44,386 |
| Output | 29,127 | 30,959 |
| List price, USD (from `total_cost_usd`) | 0.464 | 0.519 |

- The main session of (b) at the end is 69.9% smaller than the session of (a).
- The total of (b) is 0.4% above the total of (a). By list price, (b) is 11.9% above (a). The reason: (b) has two
  sessions, so it writes more cache. A cache write costs more than a cache read.
- The Architect session was resumed 10 times (11 calls). Its context grew from 6,128 to 34,630 tokens. No call had a
  compaction; the sessions stayed far below the context window (1,000,000 for this model).

Recall, graded against `recall-key.md`:

| ID | (a) | (b) Architect | (b) main, to the user |
|---|---|---|---|
| R1 | Correct: SQLite, `~/.todo/todo.db` | Correct | Correct |
| R2 | Correct: lowercase, 20 or fewer, no spaces | Correct | Correct |
| R3 | Correct: now 3 (1 to 5), before `normal` | Correct | Correct |

Other observations:

- C5 asked for the number of tasks in the plan. The light main session said 10 tasks, from its summaries.
  It did not ask the Architect. The plan of (b) is not in the light main session, so this number was not checked
  against it.
- Both Architects asked more questions than the script answers (a `delete` command, the export target, the date
  format). The script did not answer them, so they stayed open to the end in both ways.
- A7: in (b), the brief already said `AUTOINCREMENT`. So the Architect did not change the spec. It treated the
  verdict as a defect against the brief, and it wrote a rework message.

### Q6: idle cost

| Check | Result |
|---|---|
| Processes with the lab out dir as working folder, after each of 45 calls | 0 each time |
| PID of the `claude` call alive after it returned | No, in all 45 calls |
| Session state between calls | Only the session file on disk; the next call reads it with `--resume` |

## Verdict

| ID | Verdict | How it was proven | Not tested |
|---|---|---|---|
| Q1 | PASS | `AskUserQuestion` is not in the tool list of a real subagent, and the docs say that Claude Code removes it from every subagent. The full cycle ran in way (b): a ready question, the main side asked it, the answer went back, and the resumed Architect used it (A3, R1). | The main side was a headless session, so it did not call the real `AskUserQuestion`. The cycle ran with headless sessions, not with a real subagent and `SendMessage`. |
| Q2 | PASS | A real subagent has `Agent`, dispatched a child, and resumed it by ID with `SendMessage`. The docs say up to three layers below the main conversation. So the Architect, as a subagent, can dispatch the Executor, the Reviewer, QA and Security. | Dispatch from depth 3 (the docs say `Agent` is not there). A plugin agent type as the Architect (the try used `general-purpose`). |
| Q3 | NOT VERIFIED | Docs only: the subagent panel (`Enter` on the row, then type; no experimental label), agent teams (experimental), agent view (research preview, background sessions only). | The user did not confirm it on screen yet. |
| Q4 | PASS | One Architect session, resumed 10 times, with all steps of the scenario. Context recorded at each resume (6,128 to 34,630). 3 of 3 recall answers correct. | When the Architect compacts: the run did not get near the window. Recall after a compaction. |
| Q5 | PASS | Main of (b) at the end: 10,818 against 35,883 tokens, 69.9% smaller (40% needed). Total of (b): 0.4% above (a) (20% or less needed). | The cost of the Agent tool call and its result in a real main session. Longer projects, and a main session that also reads code. One run of each way only. |
| Q6 | PASS | No process remained after any of 45 calls, so no calls were possible between resumes. | Network calls were not traced. The prompt cache: after its TTL (1 hour for these writes), a resume writes the cache again, which costs more than a cache read. That is a resume cost, not an idle cost. |

## Lessons

- A subagent has no question tool, but it has `Agent` and `SendMessage`. So the Architect can dispatch the roles
  itself. Only a decision of the user must go up through the main session (the D23 question).
- Make the Architect end each reply with a short `SUMMARY:` and an optional `QUESTION:` block. The main session then
  sees only those parts, and it stays small.
- By tokens, the two ways cost almost the same. By price, the split costs about 12% more, because two sessions write
  two caches. The gain is a small main session, not a lower bill.
- The light main session answers status questions from old summaries. It can give a wrong number with confidence.
  A status question about the product must go to the Architect, or to a file that the Architect writes.
- `--no-session-persistence` and `--resume` do not work together.
- A scripted user cannot answer the new questions of the Architect. A future lab needs a rule for those questions,
  for example "answer with the recommendation".
- Total tokens of the run: headless calls 780,201, the nested subagent 65,448, plus the lab agent itself (not
  measured). This is below the stop rule of 2,000,000.
