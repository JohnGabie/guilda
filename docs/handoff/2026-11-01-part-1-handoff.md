# Handoff — guilda Part 1 (2026-11-01)

Status on 2026-11-02: Task 13 and the final review are done. Sections 2, 4 and 5 are older than that. Read the end of
the ledger for the current state.

Read this file first. The machine that ran this work is being formatted. The local scratch state in `.superpowers/`
(git-ignored) is gone. Everything you need is in git: this file, the ledger copy, the design and the commits.

## 1. What guilda is

A Claude Code plugin that holds USER's agent architecture once, for every project. The full design and the Part 1
plan are in one file: `docs/superpowers/specs/2026-11-01-guilda-design.md`.

- Sections 1–11: the approved design (status line: approved by USER on 2026-11-01).
- Section "Plan: Part 1": 13 tasks. Tasks 1–12 are done and reviewed. Task 13 is not finished.

## 2. State

| Item | Value |
|---|---|
| Repository | GitHub `JohnGabie/guilda`, private |
| Branch | `feat/part-1`, pushed to `origin/feat/part-1` |
| Branch base | `3aa73a4` on `main` |
| Last commit | `a23c876 wip: dogfood guilda config in this repository` (plus this handoff commit) |
| Tests | `npm test`: 254 pass, 0 fail (run 2026-11-01) |
| Other checks | `node scripts/lint-rules.mjs` exit 0; `claude plugin validate --strict .` passed |
| Merge to `main` | Not done. Merge is USER's decision. |

## 3. Execution method

USER chose subagent-driven execution (`superpowers:subagent-driven-development`): one fresh implementer subagent
per task, then one fresh task reviewer, then a fix loop (resume the implementer, then a scoped re-review) until the
review is clean. The controller never fixes code itself. Every decision is written as a `Ruling:` line in the ledger.

The ledger copy is `docs/handoff/2026-11-01-part-1-ledger.md`. It holds the pre-flight scan, 42 rulings, the
deferred minor findings of every task, and the completion line of each task. Trust the ledger and `git log` over
any memory.

## 4. Resume here

1. Recreate the SDD workspace: run the `sdd-workspace` script of `superpowers:subagent-driven-development` on
   `docs/superpowers/specs/2026-11-01-guilda-design.md`. Copy `docs/handoff/2026-11-01-part-1-ledger.md` to
   `<workspace>/progress.md`, so tasks 1–12 read as complete.
2. Re-extract the Task 13 brief with the skill's `task-brief` script (task number 13).
3. Rebuild `common.md` for implementers: the plan's "Global Constraints" and "Review Focus" sections, the ledger
   lines that start with `Ruling` (G, B, Q, L, R15, D and the later ones), the deletion safety rules (no bulk
   delete; tests use `fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test '))` and never delete), and the git rules
   (commit on `feat/part-1` only, explicit paths, never push without USER's request, never amend).
4. Dispatch Task 13 from step 2. BASE = the commit of this handoff. Step 1 (checks green) and the dogfood config are
   done. The rulings for Task 13 are in the ledger:
   - Do not run `claude plugin marketplace add` or `claude plugin install`: they write USER's user settings. Load
     the plugin with `claude --plugin-dir <repo> -p "<prompt>"` from a temp project. The real install stays "not
     verified" and is offered to USER at the end.
   - Create configs only with `node scripts/config-write.mjs <projectDir> <answers.json>`.
   - Verify live, if feasible: the field name of the brief text in a `PreToolUse` event for the `Agent` tool
     (today `scripts/hooks/pre-agent.mjs` reads `tool_input.prompt` and fails open when it is missing), and whether
     `SubagentStop` exit 2 makes a subagent rewrite its answer.
   - `claude -p` sessions run the task-observer start-up from USER's global CLAUDE.md (observation 0012). Use long
     timeouts and judge results from side effects (`.guilda/violations.jsonl`, hook output, exit codes).
5. Review Task 13 with a fresh reviewer.
6. Run the final whole-branch review on the most capable model. MERGE_BASE = `3aa73a4`. Point it at the ledger's
   `minor (deferred)` lines so it can triage which to fix before merge. One fix wave at most, then one scoped
   re-review.
7. Report to USER: the list of every `Ruling:` line (with what it costs if wrong), what is "not verified", and the
   next step (real install, merge decision).

## 5. Open points to carry

- **Not verified live:** the `Agent` tool `tool_input` field name; `SubagentStop` exit 2 behavior;
  `stop_hook_active` on `SubagentStop`; whether `Stop` accepts prompt or agent hook types (design 6.13 table).
- **Trigger eval of `guilda:init`:** inconclusive (task-observer start-up made every `claude -p` run time out).
  The behavior eval passed 3/3 cases, 11/11 assertions.
- **Deferred minor findings:** in the ledger, one `minor (deferred)` line per task. The final review triages them.
- **Next build items after Part 1** (design section 10): `guilda:product`, `guilda:roadmap`, `guilda:lab`,
  `guilda:new-role` + `guilda:agent-creator` with role exams, `guilda:qa-tools`, migration of `smart-pets-mod`,
  `claudia-rh`, `dev-grind`, then the promotion flow. HealthAurora migrates later, with its owner's OK.

## 6. USER's preferences seen in this work

- Replies to USER in Portuguese. Repository text in English, ASD-STE100 at full strength.
- One question per message in interviews, never a batched list.
- The Architect disagrees when it has a reason; truth before courtesy.
- Memory is a guess: verify in the docs or the project before claiming a fact.
- USER decides: merge, release, install into USER's settings, any action that leaves the machine.

## 7. Outside this repository

- Task-observer log: `~/.claude/skill-observations/observation-log/`. This session wrote observations 0010, 0011
  and 0012. They are not in this repository. Restore them from USER's backup if the log matters.
- USER's global rules: `~/.claude/CLAUDE.md` (deletion safety, task-observer activation). Restore from backup.
