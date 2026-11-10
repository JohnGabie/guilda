# Live check: the user's own Codex joins guilda and wakes on a message

This is a step list for one live session with the user. The lab agent did not run it with the user's Codex.
Lab report: `docs/labs/2026-11-09-external-agent.md`.

## Which wake path fits which Codex

| How Codex runs | (a) hook on the next user prompt | (b) router runs `codex exec resume <thread>` | (c) paste into the tmux pane |
|---|---|---|---|
| TUI inside tmux (as agentchattr starts it) | Works. Wakes only when the user talks. | Fails while the TUI has the thread open: "thread ... already has an active writer". | Works. Wakes at once, also in a turn (the text steers the turn). |
| TUI in a plain terminal, no tmux | Works. | Fails, as above. | Not possible. Start Codex inside tmux. |
| `codex app-server` client (the voice design of Glasshaus) | Works when the hooks are trusted (tested with a text turn, not with voice). | Fails for the same reason while the client has the thread. An ephemeral thread cannot be resumed. | Not possible. The voice client must do it: watch `.guilda/bus/<address>.jsonl` and call `turn/start` (idle) or `turn/steer` (in a turn). Not built. |

Recommendation for the live session: Codex TUI inside tmux, with paths (a) and (c).

## Before the session (the guilda side, about 2 minutes)

In the guilda repository, with `<project>` an empty test folder:

1. `node labs/external-agent/lab.mjs setup <project>`
   It writes `docs/spec.md`, `AGENTS.md` (the guilda commands for Codex) and `.codex/hooks.json` (SessionStart,
   UserPromptSubmit, Stop).
2. `cd <project> && node <repo>/labs/external-agent/guilda.mjs architect-create --skill <repo>/skills/architect/SKILL.md`
   It prints the Architect address, for example `arc-7dd5`.

## Steps with the user

1. Open Codex inside its own tmux server (this does not touch the agentchattr tmux sessions):

       tmux -L guilda-live new -s codex -c <project> 'env GUILDA_AGENT=voice codex -s workspace-write'

   Then attach to it in any terminal: `tmux -L guilda-live attach -t codex`.
2. Trust the hooks one time. In Codex, type `/hooks` and trust the three guilda hooks. This is a user decision,
   because it writes the trust to the Codex home of the user. To skip that write, start Codex with
   `--dangerously-bypass-hook-trust` for this session only.
3. The user says (voice or text), exactly:

   > Join the guilda project in this folder with the name voice, and tell me your address.

   Codex runs `node "<repo>/labs/external-agent/guilda.mjs" join --tool codex --name voice` and says an address,
   for example `ext-codex-voice-4592`. The join also records the tmux pane of Codex for path (c).
4. Send a test message to that address, from another terminal in `<project>`:

       node <repo>/labs/external-agent/guilda.mjs send --from main --to <address> --type notice --text "Test 1: the release moved to 2026-12-20."

   - Path (c): in 2 to 5 s, Codex shows a wake prompt from guilda.
     The prompt is `guilda: new messages arrived. Tell me what they say.` Then Codex says "the release moved to December 20". The `send` output shows `"wake": {"done": true}`.
   - If the user is typing, the output shows `"done": false` with the reason "user draft". Nothing is pasted.
     The message stays unread.
   - Path (a): the next time the user talks to Codex (any sentence), Codex tells the message first.
5. A full exchange. The user says:

   > Ask the Architect which storage the app uses.

   Then run the router: `node <repo>/labs/external-agent/guilda.mjs deliver --address architect`.
   The router resumes the Architect, stores the reply, and wakes Codex (path c). Codex says "one SQLite file, no
   server".
6. Path (b), to see the refusal: `codex exec resume <thread id of the open TUI> "test"`. Expected error:
   "already has an active writer". Nothing changes in the TUI.
7. End: `tmux -L guilda-live kill-session -t codex`. Check that no `codex` process of this session is alive.

## Risks to tell the user

- Path (c) types into the user's own session. The wake text has no message content, and the guard skips a
  draft. A draft typed in the 0.4 s between the check and the Enter can go
  with the wake text. A forced test sent both.
- Any process that can write `.guilda/` can send as any address, also as a user channel (R12). The lab has no
  sender check.
- The hooks run only when trusted. A change to `.codex/hooks.json` needs a new trust.
- The voice path (Glasshaus orb on `codex app-server`) is not built. Its realtime voice turns and the hooks
  together are NOT VERIFIED.
