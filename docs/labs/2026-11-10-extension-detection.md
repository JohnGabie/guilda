# Lab: how does the core plugin see, at session start, that the extension plugin did not load?

2026-11-10 · branch `lab/0.2-extension-detection` · spec 0.2.0 (O1, sections 2, 3c, 4a, S13, S21, tasks T10, T27) · decisions D2, D19, D34, D40 · agent ID `ada9da200ad5ee8dd` (from the transcript file `subagents/agent-ada9da200ad5ee8dd.jsonl` of the controller session, which holds this lab prompt; agent type `general-purpose`) · model `claude-opus-5-5` · account: the user's normal login and config, not changed

## Hypothesis

One of two methods tells the core plugin, in the same session start, whether the extension plugin loaded:
(A) a marker file that a SessionStart hook of the extension writes under `.guilda/`, with the session ID of the
hook input, which the core SessionStart hook reads; (B) the output of `claude plugin list --json`, run by the core
hook. We expect A to work only when the core hook can wait for the extension hook (the hooks of one event can run
in parallel), and we expect B not to list a plugin of `--plugin-dir` and to cost more than 500 ms.

## PASS criteria (written before the run)

Copied from the plan block `#### L4` (fixed):

| ID | Check |
|---|---|
| M1 | With both plugins loaded, the method says "loaded" in 3 of 3 sessions. |
| M2 | In a session with only the core loaded (`claude --plugin-dir <core> -p`), the core hooks run, and the method says "not loaded" in 3 of 3 sessions. The lab does not test a config with no marketplace: that case is the manual check of S13 (gate G6). |
| M3 | The core SessionStart hook has the answer in the same session start. The lab records the order of the two hooks, and each wrong answer. |
| M4 | The method adds 500 ms or less to the session start (median of 5). |
| M5 | The method writes no committed file, and nothing outside the project: a marker goes under `.guilda/`, with its ignore line. It writes nothing in the user's Claude Code config folder. |

Verdict rule (fixed): GO when one method passes M1 to M5. Conditional GO when a method passes M1, M2, M4 and M5
but not M3: then only `doctor` reads it, and T27 stops. NO-GO in each other case.

- Main metric: the answer of the method in the core SessionStart hook ("loaded" / "not loaded") against the arm.
- Guard metrics: the time that the method adds inside the core hook (ms), the start and end times of the two
  hooks, the files in the project and in the Claude Code config folder after each session.
- Smallest effect worth acting on: one wrong answer in any session fails M1 or M2.
- Runs: 5 sessions with both plugins, 5 with the core alone (the first 3 of each arm are M1 and M2; all 5 give the
  median of M4). Method B is measured in the same sessions. At most 40 `claude -p` sessions.
- Stop rule: 40 `claude -p` sessions or 2 hours, then MORE DATA.

Keys (expected answers, written before the run):

| Arm | Method A answer | Method B answer |
|---|---|---|
| both (`--plugin-dir core --plugin-dir ext`) | loaded | expected: not listed (B lists only installed plugins), so a wrong answer |
| core alone (`--plugin-dir core`) | not loaded | not listed |

## Method

- Claude Code 2.1.322. Raw data: `docs/labs/data/2026-11-10-extension-detection/` (`summary.json`,
  `hooks.jsonl`, `runs.jsonl`, `sessions.txt`, the runner `run.sh`, `summarize.mjs`, and the two throwaway
  plugins under `plugins/`). Commit of the base: `2120f95`. Date: 2026-11-10.
- Two throwaway plugins in a `mktemp -d` folder: `l4core` (stands in for `guilda`) and `l4ext` (stands in for
  `guilda-skills`). Each has one SessionStart hook, matcher `startup|resume|clear|compact`.
  - `l4ext` hook (`extension-marker.mjs`): when `<project>/.guilda/` exists, it writes
    `.guilda/.extension-live.json` = `{"sessionId":"<session_id of the hook input>","at":"<ISO time>"}`. It does
    nothing else. Sessions both-1..5, stale-1 and stress-1..3 used a temp file and a rename
    (`extension-marker.rename-version.mjs`); sessions direct-1..3 used one `fs.writeFileSync` (the contract form).
  - `l4core` hook (`core-start.mjs`): method A, then method B, then a log line. Method A: append
    `.extension-live.json` to `.guilda/.gitignore` when missing; read the marker; "loaded" when its `sessionId`
    equals `session_id` of the hook input; else read again every 20 ms until 300 ms passed; then "not loaded". The
    log also records `firstRead`, the answer with no wait. Method B: `claude plugin list --json` (read only), and
    "loaded" when an entry id starts with `l4ext`.
  - Lab instrumentation only (not part of a method): each hook appends one JSON line to `$L4_LOG`, a folder of the
    lab, with its start and end time (`performance.timeOrigin + performance.now()`).
- Fixture: for each session a new `mktemp -d` project with `git init`, a committed `.guilda/.gitignore`
  (`.hooks-live.json`), and no other file.
- Arms (command: `claude --plugin-dir <l4core> [--plugin-dir <l4ext>] -p "Reply with the single word OK."
  --output-format stream-json --verbose --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)"`, cwd = the
  project, timeout 300 s, stdin `/dev/null`):
  - `both` 1..5: both plugins. `core` 1..5: the core alone. Interleaved: both-1, core-1, core-2, both-2, core-3,
    both-3, ... both-5.
  - `stale` 1: the core alone in the project of both-5, which holds the marker of the both-5 session.
  - `stress` 1..3: both plugins, three sessions started at the same time.
  - `direct` 1..3: both plugins, with the marker written by one `writeFileSync`.
- Plugins that each session loaded (the `plugins` field of the `init` event of each stream): `l4core@inline`, and
  `l4ext@inline` in the arms with two flags, plus the user's installed plugins `computer-use-linux`,
  `superpowers` 7.0.0, `guilda@guilda` 0.1.0, and the built-in `cc-plugin-agents-md`, `cc-plugin-telemetry`,
  `cc-plugin-privacy`, `cc-plugin-plugin-authoring`. Per session in `summary.json`, field `plugins`.
- After each session: `git status --short --untracked-files=all` of the project, the project file list, and the
  files under the Claude Code config folder that are newer than a stamp of the session start.
- 17 `claude -p` sessions in total. Each exit code was 0 and each result was `OK`.

## Evidence

Times are ms after the runner started `claude`. A = the marker method, B = `claude plugin list --json`.

| Run | A answer | A, no wait | A ms | B answer | B ms | core hook start-end | ext hook start-end | first |
|---|---|---|---|---|---|---|---|---|
| both-1 | loaded | not loaded | 84.2 | not loaded | 886.7 | 3610-4586 | 3662-3688 | core |
| both-2 | loaded | not loaded | 23.0 | not loaded | 769.6 | 745-1542 | 750-758 | core |
| both-3 | loaded | not loaded | 21.3 | not loaded | 693.6 | 408-1126 | 413-419 | core |
| both-4 | loaded | not loaded | 22.1 | not loaded | 701.2 | 412-1140 | 428-434 | core |
| both-5 | loaded | loaded | 0.4 | not loaded | 686.8 | 390-1081 | 386-391 | ext |
| core-1 | not loaded | not loaded | 303.5 | not loaded | 692.2 | 377-1375 | - | - |
| core-2 | not loaded | not loaded | 304.9 | not loaded | 727.8 | 536-1572 | - | - |
| core-3 | not loaded | not loaded | 303.6 | not loaded | 695.6 | 422-1424 | - | - |
| core-4 | not loaded | not loaded | 304.5 | not loaded | 699.5 | 412-1419 | - | - |
| core-5 | not loaded | not loaded | 303.5 | not loaded | 707.4 | 454-1470 | - | - |
| stale-1 | not loaded | not loaded | 305.9 | not loaded | 772.1 | 495-1577 | - | - |
| stress-1 | loaded | not loaded | 102.5 | not loaded | 1157.6 | 1915-3186 | 1970-2008 | core |
| stress-2 | loaded | not loaded | 22.0 | not loaded | 1041.4 | 1398-2467 | 1389-1407 | ext |
| stress-3 | loaded | not loaded | 105.5 | not loaded | 1152.2 | 1319-2609 | 1445-1456 | core |
| direct-1 | loaded | not loaded | 21.3 | not loaded | 725.1 | 390-1140 | 390-396 | ext |
| direct-2 | loaded | loaded | 0.4 | not loaded | 674.5 | 485-1162 | 479-485 | ext |
| direct-3 | loaded | loaded | 0.5 | not loaded | 735.7 | 531-1272 | 525-533 | ext |

### M1 — both plugins loaded

- A: "loaded" in 11 of 11 sessions with the extension (both 5/5, stress 3/3, direct 3/3). PASS.
- B: "not loaded" in 11 of 11. `claude plugin list --json` lists only the installed plugins (the user config);
  it never lists a plugin of `--plugin-dir`. FAIL.

### M2 — the core alone

- The core hook ran in each session (one `core.jsonl` line per session). A: "not loaded" in 5 of 5 (`core`), and
  in the stale case (a marker of an older session in the project): "not loaded", 1 of 1. PASS.
- B: "not loaded" in 6 of 6, but only because B never lists a `--plugin-dir` plugin (M1). It cannot tell the two
  arms apart.

### M3 — the answer in the same session start; hook order

- Claude Code runs the SessionStart hooks of the plugins in parallel. The hook times overlap in each session, and
  the stream shows all `hook_started` events (4 with the extension, 3 without) before the first `hook_response`, in 17 of 17 sessions. The order is not fixed: the core
  hook started first in 6 of 11 sessions, the extension hook in 5 of 11.
- Wrong answers: with no wait (`firstRead`), the core answer was "not loaded" in 8 of 11 sessions with the
  extension. Those 8 are wrong. With the bounded wait (20 ms steps, 300 ms limit), 0 of 17 answers are wrong. The
  longest wait that found the marker was 105.5 ms (stress-3, three sessions at the same time); the extension hook
  ended at most 93 ms after the core hook started (stress-1).
- A: PASS with the wait. B: has an answer in the same session start, but a wrong one (M1).

### M4 — time added to the session start (median of 5)

- A, inside the core hook: both arm median 22.1 ms (0.4 to 84.2); core arm median 303.6 ms (303.5 to 304.9),
  which is the 300 ms limit plus one step. The not-loaded case always costs the full limit. PASS (500 ms or less).
- B: median 701.2 ms in the both arm and 699.5 ms in the core arm, up to 1157.6 ms under load. FAIL.

### M5 — files

- In each project, `git status` shows only ` M .guilda/.gitignore` (the line `.extension-live.json` appended by
  the core hook). The marker is not listed: it is ignored. The project has no other new file.
- Files under the Claude Code config folder that are newer than the session start: 7 to 27 per session, all
  session transcripts and plugin store files of Claude Code itself and of other sessions on the machine. No file
  has `l4core`, `l4ext` or `extension-live` in its path (field `configFilesWithL4OrMarker` = 0 in 17 of 17).
- The marker method writes only `.guilda/.extension-live.json` and the ignore line. PASS.
- B writes nothing, but runs a second Claude Code process.

## Method as a contract (marker, method A)

- Extension hook, `plugins/guilda-skills/hooks/hooks.json`: one SessionStart entry, matcher
  `startup|resume|clear|compact`, command `node ${CLAUDE_PLUGIN_ROOT}/scripts/extension-marker.mjs`.
- `extension-marker.mjs`: read the hook input from stdin; project = `CLAUDE_PROJECT_DIR`, else `cwd` of the input.
  When `<project>/.guilda/` is a folder, one `fs.writeFileSync` of `<project>/.guilda/.extension-live.json` with
  `{"sessionId":"<session_id of the hook input>","at":"<ISO time>"}` and a newline. With no `.guilda/` folder it
  writes nothing. It prints nothing and exits 0. It does nothing else.
- Core, `scripts/hooks/session-start.mjs` (T27): `IGNORED` gets `.extension-live.json`; `ensureIgnored` runs
  first. Only at `startup` and `clear`, in a valid or broken project layer: read the marker; "loaded" when it parses
  and its `sessionId` equals `session_id` of the hook input. Else read again every 20 ms until 300 ms passed, then
  "not loaded". A missing file, a parse error or another `sessionId` all mean "not yet". At `resume` and `compact`
  it does not read and does not wait.
- `doctor` (T10): the evidence source is `.guilda/.extension-live.json`. The reference session is `--session`;
  with no `--session`, the `sessionId` of `.guilda/.hooks-live.json`. No wait (doctor runs after the session start).
  - PASS: `extension plugin loaded: PASS — .guilda/.extension-live.json has this session (<sessionId>, <at>)`
  - FAIL: `extension plugin loaded: FAIL — no marker of this session (<sessionId>) in .guilda/.extension-live.json; the extension guilda-skills did not load. Check skill-creator and superpowers and their marketplaces`
  - UNKNOWN (proposal): no `.guilda/` folder, or no reference session (no `--session` and no hooks marker):
    `extension plugin loaded: UNKNOWN — no session to compare; marker time <at or none>`.
- Test fixtures. "Loaded": `.guilda/.extension-live.json` with `{"sessionId":"s1","at":"2026-11-10T00:00:00.000Z"}`
  and the hook input `session_id` `s1` (doctor: `--session s1`). "Did not load": the same project with no
  `.extension-live.json` (the S21 fixture: hooks marker `s1`, `--session s1`, extension line FAIL, exit 1). "Stale":
  a marker with `sessionId` `s0` and the session `s1`: not loaded / FAIL. A test of the core hook for "not loaded"
  waits the 300 ms limit.

## Not verified

- An installed `guilda-skills` (marketplace install) instead of `--plugin-dir`: the lab changes no config. The
  hooks of installed plugins and of `--plugin-dir` plugins ran together in parallel here (the installed
  `superpowers` and `guilda` hooks started in the same group), so we expect the same; S13 (gate G6) checks it.
- `/clear` and `resume` in an interactive session: `claude -p` gives only `startup`. Not verified that `/clear`
  gives a new `session_id` to both hooks at the same time.
- A machine much slower than this one: the extension hook ended at most 93 ms after the core hook started, also
  with three sessions at once. A slower start than 300 ms gives a false "not loaded" notice (no harm to the laws).
- A Windows or macOS host.
- Side note: the Bash tool environment of a session has `CLAUDE_CODE_SESSION_ID` (seen in this agent's own shell).
  Not checked against `session_id` of the hook input; if equal, the Architect can give it to `doctor --session`.

## Verdict

GO for method A (the marker with a bounded wait): M1 PASS (11/11), M2 PASS (5/5, and the stale case 1/1), M3
PASS (0 wrong answers with the wait; 8 of 11 wrong with no wait), M4 PASS (medians 22.1 ms and 303.6 ms), M5 PASS.
Method B (`claude plugin list`) fails M1 and M4: it does not see `--plugin-dir` plugins and costs about 700 ms.

- Cost of a wrong call: a false notice "the extension did not load" (when the extension hook starts more than
  300 ms late), or no notice; the laws stay on in both cases. Low.
- Can be undone: yes; the core hook and `doctor` read one file, and the extension hook can be removed.
- Does not apply to: a config with no marketplace (G6), interactive `/clear` and `resume`, other OSes.

## Lessons

- Section 3c and T27: the core hook must wait for the extension hook. The hooks of one event run in parallel, in
  no fixed order. Write the 300 ms limit and the 20 ms step in the T27 contract.
- The not-loaded case always adds the full limit (about 300 ms) to each `startup` and `clear` of a guilda project
  where the extension is off. Do not wait at `resume` and `compact`.
- The marker carries the `sessionId`, so a marker of an older session never reads as "loaded".
- One `writeFileSync` is enough; a temp file and a rename would need a second ignore line.
- Drop `claude plugin list` as a candidate in O1.
