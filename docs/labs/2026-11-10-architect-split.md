# Lab: is a core Architect file with reference files at least as correct as one file, with fewer tokens?

2026-11-10 · branch `lab/0.2-architect-split` (cut at `2120f95`) · spec `docs/superpowers/specs/2026-11-09-guilda-0.2.0.md` (L2, S15, sections 3, 3a, 3b, T13) · decisions D30, D19, D34 · agent ID `ae03c506aba8f6a86` (the file name of this agent's transcript in the `subagents` folder of the controller session `2faf61d8-fac7-442d-9608-ece7086db9bc`; the session ID is the `CLAUDE_CODE_SESSION_ID` environment variable) · model of the lab agent: Opus 5.5 (`claude-opus-5-5`) · account: the user's normal login and config; no config change.

Run: 2026-11-16, 16:16 to 16:33 local time · agent ID of the run agent: see controller · model of the run agent: Opus 5.5 (`claude-opus-5-5`) · model of the 31 `claude -p` sessions: `claude-fable-5-2` (the default model of the login; `modelUsage` of each `result` event) · account: the user's normal login and config; no config change.

## Hypothesis

A core Architect file of 140 lines or fewer with the ten full ARC blocks, plus five reference files that hold the
rest of the same text, gives answers with at least as many key facts as one file with the same text, uses 25% fewer
input tokens or more, and the Architect opens the correct reference file for each situation.

## PASS criteria (written before the run)

Copied from the plan block `#### L2` without change. Committed before the first run.

| ID | Criterion |
|---|---|
| B1 | Five fixed situations: write an Acceptance scenario; write a brief; plan a parallel wave; act on a REJECTED-LARGE verdict; name the QA tool of a scenario. Each has a key of 3 to 5 facts that the answer must have. |
| B2 | Two arms. One file: `skills/architect/SKILL.md` of `feat/0.2` plus the 0.2.0 texts (sections 3, 3a, 3b). Split: a core file of 140 lines or fewer with the ten full ARC blocks, plus `reference/spec.md`, `brief.md`, `waves.md`, `verdicts.md` and `qa-tools.md`. Both arms hold the same text. |
| B3 | 3 runs of each situation in each arm: 30 runs. The order is random. Each run is a fresh session. |
| B4 | Correct: the split arm has at least as many key facts as the one-file arm, in total. |
| B5 | Tokens: the input tokens of the split arm are 25% lower or more, in total. |
| B6 | The split arm reads the correct reference file in 14 of 15 runs. |

Verdict rule (from the plan): GO when B4, B5 and B6 pass. NO-GO when B4 fails. MORE DATA in each other case.

Measures, fixed before the run:

- Main metric of B5: for each run, the input tokens are the sum, over each model in `modelUsage` of the final
  `result` event of the `stream-json` output, of `inputTokens + cacheReadInputTokens + cacheCreationInputTokens`.
  That is all the input that the models of the session processed. B5 compares the sum of the 15 split runs with the
  sum of the 15 one-file runs: `(one - split) / one >= 0.25`.
- Guard metrics (reported, not in the verdict): the output tokens, the number of turns, the time of each run, the
  cost in USD that the `result` event gives, and an estimate of the Architect text that each run loaded (the bytes
  of the skill file plus each reference file that the run read, divided by 4). The guard metrics show where the
  tokens go; they do not replace the main metric.
- Main metric of B4: the sum of the key facts over the 15 runs of each arm (the key has 24 facts; the most for one
  arm is 72). Smallest effect worth acting on: B4 is a non-inferiority check, so a split total lower by one fact
  fails B4.
- B6: a run reads the correct reference file when its `stream-json` output has a `Read` tool call whose
  `file_path` ends with `reference/<the file of the key>`. A read of other reference files also is recorded.
- Skill load: each run is checked for a `Skill` tool call with the skill of its arm. A run that loads no skill,
  or the installed `guilda:architect`, counts as it is, and the report says so.
- Number of runs: 30 sessions plus 1 grading session. Stop rule: stop and report MORE DATA at 40 `claude -p`
  sessions or at 2 hours from the start (15:18 local time). A run that fails for a technical reason (timeout,
  exit not 0, no `result` event) gets one new run, inside the stop rule.

## Method

- Arms (B2): `docs/labs/data/2026-11-10-architect-split/arm-one/` and `arm-split/`. Each is a throwaway plugin
  (plugin names `arm-one` and `arm-split`) with the skill `architect`. The one-file arm is
  `skills/architect/SKILL.md` of `2120f95` with the 0.2.0 texts: ARC1 of section 3, ARC7 to ARC10 of section 3a,
  the procedure steps 1, 9, 11 and 12 of section 3b, the security zone line and the `explain` meaning of section
  3b. It has 144 lines. The split arm moves the parts that T13 names: the spec step details to
  `reference/spec.md`, the brief format to `reference/brief.md`, "Before you hand over a plan" to
  `reference/waves.md`, the rejection and finding details to `reference/verdicts.md`, and the QA tool list to
  `reference/qa-tools.md`. Its core file has 140 lines, the ten full ARC blocks, the role text, the procedure with
  one pointer line for each reference, the tier table, the definition of done and "Does not". `check-same-text.py`
  shows that each sentence of the one-file arm is in the split arm; the split arm adds only the pointer lines and
  the headings of the reference files (`check-same-text.out`).
- Fixture: `fixture/`, a small `notes` CLI project with `.guilda/config.json` (security enabled, risk areas `auth`
  and `data-loss`) and the feature spec `docs/superpowers/specs/notes-export.md`. Each run gets a fresh copy in a
  `mktemp -d` folder.
- Situations and prompts (B1): `prompts.json`. Each prompt names the skill of its arm (`arm-one:architect` or
  `arm-split:architect`), asks for the answer in the reply text, and forbids a dispatch, a file write and a wait
  for the user. The text of each situation is the same in both arms.
- Key (B1): `key.json`, written before the first run: 24 facts (5, 5, 5, 4, 5) and the correct reference file of
  each situation.
- Order (B3): `order.json`, a shuffle of the 30 (situation, arm, rep) tuples with `random.Random(20261110)`.
- Isolation: each run is a fresh `claude -p` session (`run-one.sh`): `claude --plugin-dir <arm copy in mktemp -d> -p
  "<prompt>" --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)" --output-format stream-json --verbose`, cwd in
  a new `mktemp -d` copy of the fixture, `timeout 600`. Three runs at a time, in the order of `order.json`.
- Grading: one fresh `claude -p` session grades all 30 answers against `key.json`. It sees the answers under
  shuffled labels, with the skill name and each path of the arm removed, so it does not know the arm. The lab agent
  checks the grades of each fact that the grader marks 0.

## Evidence

Data: `data/2026-11-10-architect-split/results/`. `runs.csv` and `runs.json` (one row for each run: tokens by part,
turns, time, cost, Skill calls, reference reads), `scores.csv` (one row for each fact of each run, with the grader's
reason), `answers.json` (the 30 reply texts, paths scrubbed to `<tmp>` and `~`), `answers-blind.json`,
`labels.json` and `grades-blind.json` (the blind grading), `grader-prompt.txt`, `summary.json`, and the scripts
`extract.py` and `blind.py`. Raw `stream-json` transcripts are not committed (they hold machine paths); the derived
tables hold each number of this report.

Runs: the 30 runs of `order.json` in order, three at a time, from 16:16:20 to 16:27:48. All 30 exited 0 and have a
`result` event with `is_error: false`; no run was repeated. Each run made one `Skill` call with the skill of its
arm (`arm-one:architect` or `arm-split:architect`); no run loaded the installed `guilda:architect`. Grading: one
fresh `claude -p` session (no plugin dir) read the 30 answers under shuffled labels `X01` to `X30`, with `arm-one`
and `arm-split` replaced by `the-skill` and each path replaced by `<path>`. The lab agent checked each of the 12
facts that the grader marked 0 against the answer text: each 0 holds (C4: the five answers with a 0 have no line that each
task is one atomic commit with a test and an Acceptance criterion; C5: no `## Plan: Part 2` and no
`notes-export.plan.md`; B5: one criterion with no scenario or no CLI tool). The lab agent also checked the facts
A1, A4, A5, B1, D3, D4 and E5 marked 1 with a text search; each holds. Sessions used: 31 of the 40 of the stop rule.

### B4 — key facts (sum over 15 runs; the most is 72)

| Situation | One file | Split |
|---|---|---|
| A Acceptance scenario (5 facts) | 15 | 15 |
| B brief (5) | 13 | 14 |
| C parallel wave (5) | 10 | 11 |
| D REJECTED-LARGE (4) | 12 | 12 |
| E QA tools (5) | 15 | 15 |
| **Total** | **65** | **67** |

The split arm has 67 facts, the one-file arm 65. B4 passes. The lost facts are the same kind in both arms: C4 (the
atomic-commit line of "Before you hand over a plan") in 5 of 6 C runs, C5 in 2 one-file runs and 1 split run, and
B5 in 2 one-file runs and 1 split run.

### B5 — input tokens (sum over 15 runs; input + cache creation + cache read of each model in `modelUsage`)

| Part | One file | Split |
|---|---|---|
| input | 134 | 152 |
| cache creation | 412,032 | 450,840 |
| cache read | 1,478,374 | 1,793,730 |
| **Total input** | **1,890,540** | **2,244,722** |

`(one - split) / one = -0.187`: the split arm used 18.7% more input tokens, not 25% fewer. B5 fails. By situation
(one / split): A 207,995 / 319,101; B 607,211 / 611,633; C 443,184 / 568,646; D 316,220 / 430,404; E 315,930 /
314,938.

Guard metrics (one / split): output tokens 68,789 / 65,972; turns 81 / 101; time 919 s / 941 s; cost USD 9.641 /
10.212; estimated Architect text loaded (skill bytes plus the reference files read with `Read`, divided by 4) 38,895
/ 37,542 tokens. The split core file is 9,743 bytes against 10,375 bytes for the one file, about 160 tokens less
for each run. Each extra tool call costs a new model turn, and each turn reads the whole cached context again (about
26,000 to 40,000 tokens). The split arm made 20 more turns, so the cache read grew by 315,356 tokens: the small
saving of the core file is lost on the first extra turn.

### B6 — the correct reference file

| Situation (correct file) | Runs with a `Read` of it | Runs that opened it with any tool (guard) |
|---|---|---|
| A (`spec.md`) | 2 of 3 (r02, r04) | 3 of 3 (r28 with `cat` in Bash) |
| B (`brief.md`) | 0 of 3 | 3 of 3 (`cat` in Bash) |
| C (`waves.md`) | 2 of 3 (r09, r24) | 3 of 3 (r19 with `cat` in Bash) |
| D (`verdicts.md`) | 0 of 3 | 3 of 3 (`cat` in Bash) |
| E (`qa-tools.md`) | 1 of 3 (r06) | 3 of 3 (r18, r20 with `cat` in Bash) |
| **Total** | **5 of 15** | **15 of 15** |

By the measure fixed before the run (a `Read` tool call whose `file_path` ends with `reference/<file>`), the split
arm read the correct file in 5 of 15 runs. B6 fails. The guard count shows that each split run did open the correct
file, 10 of them with `cat` in a `Bash` call, so the failure of B6 is a failure of the measure as much as of the
skill. Each split run also opened other reference files: the A runs opened `qa-tools.md` too; the B and C runs
opened three to five reference files; the D runs opened `brief.md` and `spec.md` too.

### Other observations

- Ten runs looked for `core/rules.md` and `core/deletion-safety.md` (the arms have no `core/` folder), with
  `find /` or a listing of the plugin cache, and read the files of the installed guilda plugin of the user's
  config: one file r08, r13, r15, r17; split r09, r19, r21, r22, r24, r30. All B runs of both arms copied
  `Deletion rules:` from that installed file. The effect is in both arms.
- Two runs ran commands that the prompt did not need: r17 made a `mktemp -d` folder and wrote a small node test in
  it (outside the project; the folder stays in the system temp folder), and r30 ran `node -e` probes in `/tmp`. No
  run wrote to the fixture or to the arms.
- The grading session used 97,845 cache-creation tokens and cost 2.08 USD; it is not part of B5.

## Not verified

- A second grader or a human grade. One `claude -p` session graded all facts; the lab agent checked each 0 and a
  part of the 1 grades, not each 1.
- The blind is partial: some answers name the files that they read (`I read ... <path>`), and the grader could see
  that an answer read more files. The arm names and the paths were removed.
- The B6 result with a `Read`-only measure on another model. The 31 sessions ran on `claude-fable-5-2`, the default
  model of the login; the report did not fix the model before the run. Opus or Sonnet may prefer `Read` to `cat`.
- B5 with a fixture that has a `core/` folder. Ten runs spent turns looking for the core rules that the arms do not
  ship; this adds tokens to both arms, and more to the split arm (6 runs against 4).
- Variance: 3 runs of each situation in each arm. The difference of 2 facts in B4 is within the noise of 3 runs.

## Verdict

**MORE DATA.** B4 passes (split 67 facts, one file 65). B5 fails (the split arm used 18.7% more input tokens, not
25% fewer). B6 fails (5 of 15 runs with a `Read` of the correct file; 15 of 15 with any tool). By the fixed rule, GO
needs B4, B5 and B6, and NO-GO needs a failed B4, so the verdict is MORE DATA.

The data do not support the token part of the hypothesis: the split does not keep correctness at a lower token
cost; it keeps correctness at a higher token cost, because each reference read is an extra turn. More runs of the
same design are not likely to change B5.

## Lessons

- In a short session the cost is in turns, not in skill text. The skill text is about 2,500 tokens of a context of
  about 26,000 tokens that each turn reads again; a reference file saves hundreds of tokens and its read costs one
  more turn. A split pays only when the reference text is large and seldom needed.
- The models read all reference files that a task might touch, not only the one that the pointer names. A pointer
  line does not keep the other files out.
- A measure of "reads the file" must count each tool that reads: 10 of 15 split runs used `cat` in `Bash`, not
  `Read`.
- A throwaway plugin arm without the `core/` files that the skill cites sends the model to search the machine and
  to read the installed plugin. A lab arm should ship the files that its skill cites, or the prompt should say
  where they are.
- Fix the model of the `claude -p` sessions before the run (`--model`), and write it in the report.
