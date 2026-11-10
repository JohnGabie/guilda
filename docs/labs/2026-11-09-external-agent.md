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

Run by a dispatched agent (D19), on 2026-11-09. Codex CLI 0.166.0 (default model). Architect: `claude -p --model
sonnet`. One run of each scenario. A key was written before the runs (`labs/external-agent/data/KEY.md`).

Context, read only:

- Glasshaus (`docs/superpowers/specs/2026-11-04-modes-and-surfaces-design.md`, section Assistant): the voice
  assistant is a design, not code. The voice goes through `codex app-server`: `thread/start` (ephemeral,
  read-only sandbox), then `thread/realtime/start` over WebRTC. On 2026-11-04 one line of text gave speech back.
  The microphone and a task handed to the agent are not proven there. No launcher button and no orb code exist
  on `main`.
- The Codex process that runs now on this machine belongs to agentchattr. It is a TUI inside tmux. A user
  service starts it (`wrapper.py codex`). agentchattr wakes it with `tmux load-buffer` and `paste-buffer -p`, then
  Enter (`wrapper_unix.py`, `inject`).

Research, primary sources:

- Codex hooks (learn.chatgpt.com/docs/hooks, redirect from developers.openai.com/codex/hooks): events
  `SessionStart`, `UserPromptSubmit`, `Stop` and others. `hookSpecificOutput.additionalContext` adds model
  context on `SessionStart` and `UserPromptSubmit`. `Stop` with `"decision": "block"` and a `reason` makes Codex
  continue, with the reason as a new prompt. Project hooks in `<repo>/.codex/hooks.json` load only when the
  project is trusted. Each hook needs trust of its hash (`/hooks`), or `--dangerously-bypass-hook-trust` for
  one run. The page does not say if hooks run in `codex exec` or in the app-server. This lab tested both.
- Codex app-server (learn.chatgpt.com/docs/app-server): the client gets notifications such as `turn/completed`
  and `item/completed`. A client can add input with `turn/start`, `turn/steer` (in a turn) and
  `thread/inject_items`. Only the connected client can do this. No push to an outside process.
- Local help (`codex --help`, 0.166.0) shows `codex exec resume <id>`. It also shows `codex queue --thread <id>
  --message <text> [--resume]`: "Queue a message for an existing session". It uses the shared local app-server
  daemon. The lab did not test `queue`, because it starts a daemon in the Codex home of the user.

Prototype, `labs/external-agent/` (Node, no dependencies):

- `guilda.mjs` has these commands:
  - `join`: an address from tool + name, with a record in `.guilda/bindings.json`.
  - `send`: append to `.guilda/bus/<to>.jsonl`, print the message ID, exit.
  - `deliver`: the router. It takes a lock for the address, then each unread message in order. It resumes the
    Architect with `--tools "" --strict-mcp-config` and the role from `skills/architect/SKILL.md`. It stores the
    reply with `reply_to`. Lines `NOTIFY <address>:` become notices.
  - `hook codex`: the Codex hook. `wake`: path (c), below.
- The hook. `SessionStart`: the address and the last 8 messages that were seen. `UserPromptSubmit`: the unread
  messages as `additionalContext`, then marks them read. `Stop`: if messages came in during the turn, it blocks
  once with them as the reason, then marks them read.
- `wake`: `join` records `$TMUX` and `$TMUX_PANE` of Codex. After `send` or `deliver`, the router pastes a fixed
  line ("guilda: new messages arrived. Tell me what they say.") into that pane and presses Enter. The hook then
  injects the messages. A guard reads the input line and skips the paste if the user has a draft.
- `lab.mjs` writes the test project: a spec of 5 decisions, `AGENTS.md` with the guilda commands, and the hooks.
  It also runs one Codex turn (`codex exec` or `codex exec resume`). Options: `--json --ignore-user-config
  --dangerously-bypass-hook-trust`, the `workspace-write` sandbox, and stdin closed. The project trust is
  `-c 'projects={"<dir>"={trust_level="trusted"}}'`, for this run only. Nothing goes to the Codex home.
- `appserver-probe.mjs`: a stdio app-server client. It starts a thread and one text turn.
- The "user talks to Codex" step is a new `codex exec resume` turn. In the return turns the user line was "I'm
  back." or "What changed?", not an order to read messages.
- The router runs from the lab shell after the Codex run ends. It stands for the guilda session (D15 watch).
- Processes: a `ps` list before and after. PIDs 603989 and 603998 (agentchattr Codex) were not counted and not
  touched. The TUI tests used a private tmux server (`tmux -L guilda-lab`), stopped by its session name.

## Evidence

Raw data: `labs/external-agent/data/` (machine paths replaced by `<labdir>`, `<repo>`, `~`).

Hook probes (`data/probe-hook.log`):

- `codex exec` with project trust and `--dangerously-bypass-hook-trust`: `SessionStart` (source `startup`),
  `UserPromptSubmit` and `Stop` ran. The context of both hooks reached the model. The env of Codex (for example
  `GUILDA_AGENT`) reached the hook.
- `codex exec resume` without the bypass flag: no hook ran. With it: all three ran, `SessionStart` with source
  `resume`.
- The project trust with `-c 'projects."<dir>".trust_level=...'` was ignored (unrecognized key). The inline table
  form worked.
- App-server (`data/appserver-run.json`): `--dangerously-bypass-hook-trust` had no effect; `hooks/list` showed
  the three hooks `untrusted`, and no hook ran. With `-c 'hooks.state={"<hook key>"={trusted_hash="<hash>"}}'` for
  this run, the hooks showed `trusted` and ran. A text turn "Hello, I am back." got a waiting notice injected,
  and Codex told it: "tasknote 1.0 is scheduled for release on December 15, 2026."

Scenarios (key in `data/KEY.md`; mailboxes in `data/bus/`; turns in `data/codex-turns.jsonl`):

| Scenario | What happened | Result |
|---|---|---|
| a | `voice` joined as `ext-codex-voice-4592`, sent `m-fc163f`, run ended (exit 0, not alive). Router: reply `m-431c21` "one SQLite file ... no server". Return turn "What did the Architect say?": "a single SQLite file ... no server". Codex ran 0 commands in that turn. | PASS |
| b | Two questions `m-1c6204`, `m-71cf1f` in one run. One router run answered both in order. Return "I'm back.": "CSV, one row per note" and "2,000 characters". | PASS |
| c | "Add tags" -> reply `m-46d2ee` type `question`. Return "I'm back.": Codex gave the 3 questions. The user answer went as `m-f67e6d` with `reply_to: m-46d2ee`. The Architect took the details (free text, 5 per note, CSV column) but kept D6 `@open`, because `voice` was not a user channel then (correct for R12). Two differences from the key: Codex used `--type decision` (the Architect asked for it), not `answer`; "accepts" means recorded, not decided. | PASS, with the 2 notes |
| d | `main` (a user channel) sent "D2 is now JSON". Reply to `main`, and notice `m-af0c8d` to `voice` ("Correction to my earlier answer (m-1c6204) ..."). Return "What changed?": "Export changed from CSV to JSON". | PASS |
| e | New `codex exec` session for `voice`: `join` gave the same `ext-codex-voice-4592`. Bindings record 2 sessions. `SessionStart` injected 8 earlier messages. "Which export format now? Do not ask the Architect." -> "JSON ... per the Architect's latest correction" (the spec file still says CSV). | PASS |
| f | `voice` and `cli` (`ext-codex-cli-39f6`) ran at the same time. Then both return turns at the same time. `voice` got only "Node.js 24", `cli` got only "2,000 characters". No cross delivery in the mailboxes or the hook log. | PASS |
| g | One turn: send, then `sleep 45`. The reply `m-3492cd` was stored at 01:04:01, during the sleep. `UserPromptSubmit` (01:03:19) had nothing. `Stop` (01:04:10) blocked once with the reply; Codex continued and said "runtime dependencies are not allowed". The second `Stop` had nothing. Same turn, no loss. | PASS |
| h | Two router runs 1 s apart: the second printed `busy: true`, exit 3. The first delivered `m-9bb554` and `m-296e87` in order. | PASS |
| i | `.guilda/config.json` `userChannels: ["main", "ext-codex-voice-4592"]`. `cli` sent "D3 sync uses Dropbox" (decision): "I record this as an opinion ... D3 stays `@open`". `voice` sent "no sync in 1.0": "D3 is now `@decided` ... the user's decision, from a user channel (R12)". The Architect also sent `cli` a notice, and `cli` told its user. | PASS |

Criteria:

| ID | Evidence | Result |
|---|---|---|
| X1 | One `join` command gave the address. A new session got the same address from `bindings.json` (e). | PASS |
| X2 | `send` printed the ID and returned. Each Codex run ended before the router ran. 17 of 17 Codex runs: exit 0, PID not alive after. | PASS |
| X3 | 13 Architect calls resumed the same session (`535b3597-...`). Each reply has `reply_to` = the question ID. The Architect used earlier context (d: "my earlier answer (m-1c6204)"). | PASS |
| X4 | Mechanism: the `UserPromptSubmit` hook with `additionalContext`, and the `Stop` hook for a turn in progress. 9 return turns of 9 told the reply correctly against the key, with 0 guilda commands run. | PASS (`codex exec`, app-server text turn) |
| X5 | Scenarios a to i above. | PASS (9 of 9, c with 2 notes) |
| X6 | `ps` after = `ps` before (`data/processes.txt`). No `codex`, `claude`, `node` or `tmux -L guilda-lab` process left. 29 messages: 27 read or delivered, 2 unread and still in their mailbox (1 in `main`, 1 reply to `voice` from i). None lost. | PASS |

Wake paths, for the live check (one run each, a throwaway thread in a private tmux server):

- (a) The hook on the next user prompt: as in X4. It wakes only when the user talks.
- (b) `codex exec resume <thread>` while a TUI has the thread open: refused, "thread ... already has an active
  writer" (exit 1). The TUI showed nothing.
- (c) Paste into the TUI pane: an idle TUI ran the pasted text as a turn. In a turn, the pasted text steered the
  running turn (`DONE-1` and `MANGO-3` in one answer). A user draft in the input line was sent together with the
  pasted text. With the guard: the full loop with `wake` worked (`data/tui-pane.txt`): `send` -> paste -> hook ->
  "The Architect moved the release ... to December 20, 2026"; a question to the Architect -> `deliver` -> paste ->
  the answer. With a draft typed, `wake` skipped ("user draft in the input line"). The message then came with
  the next user prompt.

Cost:

- Claude (Architect, sonnet): 13 calls, 129,112 tokens (most of them cache reads), USD 0.73 by the CLI.
- Codex: 17 lab turns 734,429 tokens (input includes 652,800 cached). Probes, app-server and TUI threads:
  417,595. Total about 1,152,000 (about 88% cached input). The usage of `codex exec resume` is the total of the
  thread; the numbers above are the differences per turn.
- A return turn with no commands: 18,000 to 29,000 tokens. A turn with one `send`: 36,000 to 53,000.
- A new session: 53,000 to 69,000. Codex read a user skill (`using-superpowers`) from the Codex home first. It
  did this also with `--ignore-user-config`.
- Time: an Architect call 2.7 to 8 s. A Codex turn 5 to 18 s.

## Verdict

D25 checklist, applied:

- What the result proves:
  - On this machine, with Codex 0.166.0, a Codex agent can join, ask and stop. On its next turn a project hook
    gives it the reply. There is no polling and no process stays.
  - This holds for 9 scenarios. Among them: 2 agents at once, a turn in progress, a busy router, user
    channels.
  - Hooks also run in an app-server session when they are trusted.
  - A paste can wake a Codex TUI inside tmux at once.
- What it does not prove:
  - One run of each scenario (no pass^k), one model, a small spec of 5 decisions. The grading is by hand
    against the key.
  - The real voice setup of the user is NOT VERIFIED. The Glasshaus voice is not built. No realtime voice turn
    ran with the hooks.
  - The live check with the user's own Codex is NOT VERIFIED. `codex queue` was not tested.
  - In the real setup, the hook trust needs the user (`/hooks`).
- Risks:
  1. Sender spoofing. Any process that writes `.guilda/` can send as a user channel. This is a hole in R12.
  2. The paste of path (c) types into the user's session. A draft typed in the guard window can mix with it.
  3. The hook marks a message read when it injects it. This is also true if the turn then fails.
  4. A busy router run exits. A message that comes after the last check of the running router waits for the
     next trigger.
  5. The installed guilda plugin also reads `.guilda/config.json`. Its hook warned the Architect about the lab
     config (no `guildaVersion`).
  6. Each Codex turn has a base cost of about 20,000 tokens.
- The cost of a wrong call: low. The adapter is small and off by default (D18). A NO-GO now would block D31 for
  external agents; a GO that is wrong costs one adapter.

Decision: GO for a Codex adapter in the build. The adapter is: address, file mailbox, router, and the
`UserPromptSubmit` and `Stop` hooks. Conditions:

- a sender check before the user-channel rule;
- the scenarios again, 3 runs;
- the live check of `LIVE.md` with the user.

MORE DATA for the wake at once. Path (c) works only for a TUI in tmux. The voice path needs code in the voice
client (`turn/start` or `turn/steer`).

## Lessons

- Codex hooks are the delivery point. `UserPromptSubmit` gives the messages to the next turn; `Stop` gives the
  messages that came in during the turn. No polling.
- Project hooks need two trusts: the project, and each hook hash. For `codex exec` the bypass flag is enough for one
  run. For the app-server, only `hooks.state.<key>.trusted_hash` worked. The real setup needs one `/hooks` review.
- `codex exec resume` cannot write to a thread that a TUI or a client has open. The router cannot wake an open
  session that way.
- Put the session of the agent in the binding from the hook (`session_id`), not from the agent. One address can
  have many sessions.
- Do not put message text in the paste. Paste a fixed wake line; the hook gives the content and marks it read.
- Keep lab keys out of `.guilda/config.json`, or give them a place in its schema. The plugin validates that file.
- The usage of `codex exec resume --json` is the total of the thread. Take the difference for each turn.
- `--ignore-user-config` does not stop user skills in the Codex home. They add a command and about 20,000 tokens to
  a new session.
