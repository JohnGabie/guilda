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

(filled after the run)

## Evidence

(filled after the run)

## Not verified

(filled after the run)

## Verdict

(filled after the run)

## Lessons

(filled after the run)
