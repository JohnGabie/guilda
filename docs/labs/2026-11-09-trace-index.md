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

All runs on 2026-11-09, on one Fedora machine, Node 24, Claude Code 2.1.321. The lab folder is `<labdir>`. It stays in
place.

### Prototype

`labs/trace-index/` has 5 Node scripts with no dependencies. Run them from the project root.

| Script | What it does |
|---|---|
| `lib.mjs` | Parses blocks and citations. A block is a `### <ID> — <title>` section up to the next heading of level 1 to 3. Hash: SHA-256 of the title without the status tag plus the body, white space collapsed, first 8 hex characters. The read commit of a citation is the oldest commit that added `<ID>@<hash>` to the citing file (one `git log -p` for each file). |
| `index.mjs` | Writes `.guilda/trace/index.json`: for each ID, the hash, file, line range, title, owner tasks and citers (citer, hash, read commit). |
| `show.mjs <ID> [--at <commit>]` | Prints only that block, now or at a commit. Now, it also prints the owner tasks and the citers. |
| `check.mjs [--brief]` | Builds the index again, then prints `SUSPECT` (with the block then and now, or only the changed lines with `--brief`), `UNKNOWN` (error) and `NO-OWNER`. Exit 1 on a suspect or an unknown ID. |
| `ack.mjs <brief> <ID>` | Writes the current hash into the `Uses:` line of that brief, then builds the index again. |

Citers: each brief file in `docs/superpowers/briefs/` and each `### T<n> — ` task of a plan in
`docs/superpowers/plans/` with a `Uses:` line. A plan task names its owned decisions on an `Owns:` line. In this
prototype, `NO-OWNER` means: a cited ID that no plan task owns.

### Fixture

`<labdir>/fixture` is a new git repository:

- Commit 1 (`cfb8c8a`) has 3 parts. A copy of the 0.2 spec (from `origin/feat/0.2`, 749 lines). A plan with 6 tasks
  (T1 to T6, 3 waves, a producer/consumer table). 6 briefs in the guilda brief format, each with a `Uses:` line.
  The 6 plan tasks and the 6 briefs are the 12 citers. They cite 15 IDs: D2, D5, D6, D8, D9, D10, D11, D14, D17, D18, D20, D21,
  D22, D24, D27. Copies: `labs/trace-index-bench/fixture/`.
- Commit 2 (`8774490`), by `labs/trace-index-bench/fixture-change.mjs`:

| Change | Block | Cited by |
|---|---|---|
| Text: `status` is no longer internal, it stays a user command | D24 | briefs T1, T6 |
| Text: ARC4 fallback "one tier lower" becomes "one tier higher" | D10 | briefs T3, T4 |
| Text: mailbox "one JSONL file for each code in `.guilda/bus/`" becomes "one SQLite table in `.guilda/bus.db`" | D17 | brief T5 |
| Status only: `@proposed` to `@decided` in the title | D14 | plan T2, briefs T2, T5 |
| Status only: `@proposed` to `@decided` in the title | D20 | plan T6, brief T6 |
| White space only: a line wrap moved, one double space | D9 | plan T5, brief T5 |
| Text in a block that nobody cites: 30 days becomes 14 days | D13 | none |
| Brief T2 adds `D99@1a2b3c4d` | none | brief T2 |

The 3 text changes touch 5 briefs. Of these 5, 4 briefs no longer match the spec (T1, T3, T5, T6). Brief T4 cites the
changed D10, but it uses only the reply-language rule of D10, which did not change.

### Part A

Script runs in `<labdir>/fixture`. The acknowledge run used a clone (`<labdir>/ack-copy`), so that Part B kept the
state before the acknowledge.

### Part B

- Two clones of the fixture at commit 2. `<labdir>/arm1` has no index and no scripts. `<labdir>/arm2` has
  `labs/trace-index/` and a built `.guilda/trace/index.json`.
- Each agent is one headless Claude Code session. The prompt goes on stdin. The clone is the working folder.
  The command is in `labs/trace-index-bench/run-one.sh`.

  ```
  timeout 300 claude -p --model haiku --output-format stream-json --verbose --tools "Read,Grep,Glob,Bash"
    --allowedTools "Read Grep Glob Bash(node:*)" --strict-mcp-config --no-session-persistence
    --setting-sources project
  ```

  The model was `claude-haiku-5-5` in all runs.
- The prompt comes from `labs/trace-index-bench/prompt.mjs`. It gives the role and the paths of the spec, plan and
  briefs. Then one question, "Use grep and read as you like", "Do not edit any file", and the answer line.
  Arm 2 adds only: "An index
  exists: run `node labs/trace-index/show.mjs <ID>` ... Read by ID, never the whole spec file." The arm-2 Reviewer
  prompt also names `check.mjs`.
- 10 questions with a written key are in `labs/trace-index-bench/questions.json`. 5 ask what a decision says
  (Q1, Q2, Q3, Q8, Q9). Q3 and Q8 ask about changed text. 2 ask about the plan and briefs (Q4 owner task, Q5
  citing briefs). 3 ask if a brief still matches a changed decision (Q6, Q7, Q10).
- One wave is the 10 questions of one arm, 5 agents at a time (`batch.sh`). Order: arm 1 run 1, arm 2 run 1, arm 1
  run 2, arm 2 run 2. Then the Reviewer (B5): 2 runs for each arm, the 2 runs of one arm at the same time.
- Tokens come from `modelUsage` of the final `result` event of each session: input, cache read, cache creation,
  output. "Input total" is input plus cache read plus cache creation. Tool calls come from the `tool_use` events.
  Wall time is measured around the `claude` process.
- Grading rule (written before the runs, in `questions.json`): strict. The grader reads the `ANSWER:` line. It is
  correct only if it matches each pattern of `all` and no pattern of `none`. A human check confirms each grade.
  For B5, the `AFFECTED:` line must list exactly T1, T3, T5, T6.
- Stop rule: stop new agents at 3,000,000 tokens in total. The run did not reach it.

## Evidence

### Part A

| Check | Result |
|---|---|
| A1 | 29 blocks (27 `### D<n>` blocks plus E1, E2). Each of the 27 `### D<n>` headers has an index entry with the start line equal to the header line, an end line, and an 8-hex hash. Build: 26.5 to 40.2 ms in the script, 0.11 to 0.14 s for the whole process. |
| A2 | `SUSPECT` lines: brief T1 (D24), brief T3 (D10), brief T4 (D10), brief T5 (D17), brief T6 (D24). `UNKNOWN`: brief T2, `D99@1a2b3c4d`. No hit for D14, D20 (status), D9 (white space), D13 (uncited). Also 9 `NO-OWNER` lines (D2, D6, D10, D11, D17, D18, D21, D22, D24). Exit 1. 69.5 ms. |
| A3 | For each of the 5 suspect links, `check.mjs` prints the block at the read commit `cfb8c8a` and the block now, with both line ranges. The hash of the block at that commit is equal to the cited hash in 5 of 5. `--brief` prints only the changed lines, for example `- ... use one tier lower.` / `+ ... use one tier higher.` |
| A4 | 5 `ack.mjs` runs (T1 D24, T3 D10, T4 D10, T5 D17, T6 D24) changed 5 lines in 5 files. Then: `0 suspect, 1 unknown`. After a commit of the acknowledge, the index records the new commit (`6a72b71`) as the read commit of the 5 links. |
| A5 | 3 runs of `check.mjs` (time removed) give the same output: SHA-256 `e394ba35...` 3 times. 3 index builds: 29 blocks, 28 citations each time. |

### Part B: questions (20 runs for each arm)

| Measure | Arm 1 (grep, free reads) | Arm 2 (index, read by ID) | Arm 2 against arm 1 |
|---|---|---|---|
| Correct (strict, automatic) | 17 of 20 | 19 of 20 | +2 |
| Correct (after the human check) | 18 of 20 | 19 of 20 | +1 |
| Input total, median | 29,691 | 18,425 | 37.9% lower |
| Input total, mean | 37,317 | 30,611 | 18.0% lower |
| Cache read, median / mean | 27,500 / 33,334 | 16,832 / 27,843 | |
| Cache creation, median / mean | 4,008 / 3,976 | 2,366 / 2,762 | |
| Input not cached, median / mean | 6 / 7 | 4 / 6 | |
| Output, median / mean | 789 / 1,083 | 676 / 1,037 | 14.4% lower (median) |
| Turns, median / mean | 3 / 4 | 2.5 / 3 | |
| Tool calls, median / mean | 2 / 3 | 1.5 / 2 | |
| Wall time, median / mean | 5.98 s / 7.37 s | 5.37 s / 7.30 s | 10.1% lower (median) |
| Runs that read the whole spec file | 1 of 22 | 0 of 22 | |
| Runs that used `git` | 5 of 22 | 4 of 22 | |

Input total and correct answers for each question (run 1, run 2):

| Question | Key | Arm 1 correct | Arm 1 input total | Arm 2 correct | Arm 2 input total |
|---|---|---|---|---|---|
| Q1 D14 journal and writer | `journal.jsonl`, orchestrator | 2 | 37,281 / 35,650 | 2 | 18,420 / 18,430 |
| Q2 D8 small re-review | journeyman, 50 lines, no risk area, no shared code | 2 | 33,577 / 32,477 | 2 | 17,453 / 17,496 |
| Q3 D10 fallback (changed) | one tier higher, tell the user | 2 | 27,197 / 27,312 | 2 | 17,383 / 17,368 |
| Q4 owner of D14 | T2 | 2 | 29,681 / 29,680 | 2 | 18,402 / 39,477 |
| Q5 briefs that cite D24 | T1, T6 | 2 | 17,978 / 17,470 | 2 | 27,541 / 17,823 |
| Q6 T5 against D17 | No (SQLite) | 2 | 29,515 / 29,701 | 2 | 40,209 / 30,068 |
| Q7 T4 against D10 | Yes (reply-language rule did not change) | 0 | 128,144 / 66,195 | 1 | 65,341 / 52,338 |
| Q8 D13 days (changed) | 14 | 1 (2 after the human check) | 29,364 / 29,546 | 2 | 26,871 / 17,440 |
| Q9 D20 marker and label | `◇`, `guilda:<role>-<tool>` | 2 | 43,480 / 31,179 | 2 | 17,889 / 17,873 |
| Q10 T6 against D24 | No (`status` is a user command) | 2 | 41,918 / 28,986 | 2 | 54,040 / 80,354 |

Human check: all automatic grades are confirmed except one. Arm 1, Q8, run 2 answered "14 days" and also said that
another line of D13 still says "30 days". That is true: the fixture change left "before the 30 days end" in D13. The
`none` pattern `30` marked it wrong. The human check marks it correct. There are 3 wrong Q7 answers: arm 1 two
times, arm 2 one time. Each said "No" because the cited hash of D10 is old. But the content that T4 uses did not
change.

### Part B: Reviewer (B5, 2 runs for each arm)

| Run | `AFFECTED:` line | All 4 found | Extra | Reported D99 | Input total | Output | Tool calls | Wall time |
|---|---|---|---|---|---|---|---|---|
| Arm 1, run 1 | T1, T2, T3, T5, T6 | yes | T2 (for D99, not a mismatch) | yes | 249,900 | 15,942 | 18 | 75.9 s |
| Arm 1, run 2 | T1, T3, T5, T6 | yes | none | yes | 292,326 | 13,711 | 12 | 66.1 s |
| Arm 2, run 1 | T1, T3, T5, T6 | yes | none | yes | 103,123 | 6,698 | 10 | 32.0 s |
| Arm 2, run 2 | T1, T3, T5, T6 | yes | none | yes | 58,821 | 5,978 | 6 | 28.7 s |

Median input total: arm 1 271,113, arm 2 80,972 (70.1% lower). Median wall time: 71.0 s against 30.4 s.

### Use

Total of the 44 measured agents: 2,147,444 tokens (input total plus output). Arm 1: 1,339,864. Arm 2: 807,580.
One probe run (about 8,100 tokens) and one pilot run (17,827 tokens) are not in the tables. The stop rule did not
apply. Results for each run: `labs/trace-index-bench/results.csv`.

## Verdict

| ID | Verdict | How it was proven | Not tested |
|---|---|---|---|
| A1 | PASS | Each of the 27 `### D<n>` blocks has an ID, a line range and a hash. Build under 0.15 s. | A spec in more than one file; a section with an HTML comment ID (the code supports it, no fixture has one). |
| A2 | PASS | Exactly the 5 briefs as suspect, D99 as the one error, no hit for the 2 status changes, the white-space change or the uncited change. | `NO-OWNER` is a separate list and not part of A2; see Lessons. |
| A3 | PASS | For 5 of 5 suspect links, the block at the read commit and the block now, and the old hash equal to the cited hash. | A read commit lost by a rebase; a spec file renamed after the read. |
| A4 | PASS | 0 suspects after 5 acknowledge runs. The unknown ID stays an error, as designed. | Acknowledge of a plan task line (the script supports it; not run). |
| A5 | PASS | 3 identical outputs. | Other machines. |
| B1 | PASS | 6 tasks, 6 briefs with `Uses:` lines, 10 questions with a written key, 3 kinds of questions. | |
| B2 | PASS, with one deviation | Same model, flags and prompt text, except the index lines. 5 agents at a time. Deviation: Claude Code ran read-only shell commands (`git log`, `git show`, `cat`, `grep`, `ls`) without approval, although the allow list had only `Bash(node:*)`. Both arms had this; 5 arm-1 runs and 4 arm-2 runs used `git`. Commands that write were refused. | Other models (only Haiku). |
| B3 | PASS | 2 runs for each arm (20 question runs for each arm), tokens from the usage report of each agent, tool calls, wall time, grade against the key. | More runs for each question; the spread inside one question is large (Q4 arm 2: 18,402 and 39,477). |
| B4 | PASS | Correct: 19 against 17 (strict) or 19 against 18 (human check). Median input total 37.9% lower. | The mean is only 18.0% lower: arm 2 costs more on Q5 run 1, Q6 run 1, Q4 run 2 and Q10. Not tested with a larger model, or with a spec of several thousand lines. |
| B5 | PASS | Both arm-2 Reviewers found exactly T1, T3, T5, T6, with 103,123 and 58,821 input tokens. Both arm-1 Reviewers used more (249,900 and 292,326). One arm-1 Reviewer added T2. | A cold Reviewer that must also judge the change itself (D27: report or acknowledge); the Reviewer gate in the real hook. |

## Lessons

1. The alarm costs nearly nothing. A full index build and check of a 749-line spec with 12 citers takes under 0.15 s.
   The read commit from `git log -p` works, and the old block comes back with the cited hash.
2. The largest gain is the Reviewer task, not the single lookup. With `check.mjs`, the Reviewer used 70% fewer
   input tokens and 57% less time. It gave the exact list both times.
3. The gain for one lookup is smaller than the D27 estimate (13,000 against 900 tokens). Arm-1 agents almost never
   read the whole spec. They used Grep with context lines and Read with a line range. Only 1 of 22 runs read the
   whole file. Each turn has a fixed cost: the Claude Code system prompt, about 8,000 tokens from the cache. This
   cost is most of a small lookup. The index saves turns, not file reads.
4. Agents mix "suspect" with "does not match". In 3 of 4 wrong answers to Q7, the agent said "No" only because the
   hash was old. The check output and the Reviewer gate must say this: a suspect link asks for a reading of the
   change. The verdict is about the content. Proposal: the `SUSPECT` line says "read the change; the brief can still match".
5. `NO-OWNER` as "a cited ID with no owner task" is noisy. It listed 9 of 15 cited IDs. The cause: one plan covers
   only part of the spec. ARC8 needs a scope: only the `@decided` items of the plan's own part, or the owners from all plans.
6. `--allowedTools` does not stop read-only shell commands in Claude Code 2.1.321. A lab that must take away `git`
   needs a deny rule.
7. A fixture change must change each mention of a value. The D13 change left one "30 days" line, and one agent found
   the conflict. The grading rule then needed a human check.
8. Open for the build: one index for several spec files and IDs that move between files. Also a read commit lost
   by a rebase, and a larger model in the same benchmark.
