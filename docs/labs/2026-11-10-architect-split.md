# Lab: is a core Architect file with reference files at least as correct as one file, with fewer tokens?

2026-11-10 · branch `lab/0.2-architect-split` (cut at `2120f95`) · spec `docs/superpowers/specs/2026-11-09-guilda-0.2.0.md` (L2, S15, sections 3, 3a, 3b, T13) · decisions D30, D19, D34 · agent ID `ae03c506aba8f6a86` (the file name of this agent's transcript in the `subagents` folder of the controller session `2faf61d8-fac7-442d-9608-ece7086db9bc`; the session ID is the `CLAUDE_CODE_SESSION_ID` environment variable) · model of the lab agent: Opus 5.5 (`claude-opus-5-5`) · account: the user's normal login and config; no config change.

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

(Filled after the runs.)

## Not verified

(Filled after the runs.)

## Verdict

(Filled after the runs.)

## Lessons

(Filled after the runs.)
