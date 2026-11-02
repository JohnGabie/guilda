# SDD ledger — plan: docs/superpowers/specs/2026-11-01-guilda-design.md

Branch: feat/part-1 (from main 3aa73a4). Spec = sections 1–11 of the same file; plan = "## Plan: Part 1".
Ruling: work on branch feat/part-1 in the main checkout, no worktree — new repo, no other work in progress, user asked to start — cost if wrong: none, branch is isolated.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T2 → T5..T10 | tests/helpers.mjs runHook, tempProject | consistent |
| T5 → T6,T7,T8,T9,T10 | hooks/hooks.json created then modified | consistent, sequential |
| T8 → T10 | subagent-stop.mjs, matcher widened to qa | consistent |
| T3 → T9 | core/glossary.md format → parseGlossary | format not pinned in T3 → Ruling G |
| T4 → T10 | brief fields → validateBrief | T4 lists fields loosely, T10 lists 12 exact → Ruling B |
| T4 → T10 | QA report format → validateQaReport | T4 does not pin QA format → Ruling Q |
| T3 budget | 25 rules ×(4 lines+blank) + writing.md vs "≤125 lines" | impossible with blank lines → Ruling L |
| T3 levels table | R15 "gate + automatic report (Task 9)" vs test "levels above" | Ruling R15 |
| T5 → T11,T12 | installedVersion, compareSemver | consistent |
| T3/T4 → T9 | T9 step 3 edits core/agents text to pass ste-check | sequential, allowed |
| T11 → T13 | config-template used in smoke | consistent |
| each task self-consistency | tests vs files | T1–T13 consistent apart from rows above |

Ruling G: glossary line format is `- **<term>**: <definition>. Forbidden: <w1>, <w2>.` (one line per term) — T3 writes it, T9 parses it — cost if wrong: T9 parser rewrite.
Ruling B: the Architect brief template in T4 uses exactly T10's 12 field names (`ID / title`, `Goal`, `Context`, `Out of scope`, `Files it may touch`, `Contract / interfaces`, `Tests that must pass`, `Acceptance`, `Suggested tier`, `Risk area`, `Deletion rules`, `Dependencies`), one `Name:` line each, tier values master|journeyman|apprentice — cost if wrong: T10 rework.
Ruling Q: T4 QA output format has a `Scenarios:` section; each scenario line ends with `PASSED`, `FAILED` or `NOT VERIFIED` then ` — <evidence>`; a NOT VERIFIED line also has `Not verified because: <reason>` — cost if wrong: T10 rework.
Ruling L: line budgets count non-blank lines. Session context ≤150 non-blank lines; core/rules.md + core/writing.md ≤125 non-blank lines; core/subagent.md ≤60 non-blank — cost if wrong: injected text a little longer than the design target.
Ruling R15: R15 Check level word is `gate`; its mechanism text names the ste-check report — cost if wrong: none.
Ruling D: no task deletes files; tests leave temp dirs in os.tmpdir() — USER's global deletion rules satisfied by not deleting — cost if wrong: temp clutter only.

## Tasks
Task 1: dispatched (BASE 3aa73a4, implementer sonnet)
Ruling: npm test script is `node --test "tests/**/*.test.mjs"` (plan said `node --test tests/`, which fails on Node 24) — all later test files end in .test.mjs — cost if wrong: none.
Ruling: marketplace.json gets a `description` (strict validate warns without it) — cost if wrong: none.
Task 1: ⚠️ resolved by controller — npm test 4 pass, validate --strict passed (re-run), tag format and auto-update default verified in docs on 2026-11-01, 6.14 says every merge to main.
Task 1: minor (deferred): manifest test does not check top-level marketplace name; checks only plugins[0].
Task 1: complete (commits 3aa73a4..ce16123, review clean)
Task 2: dispatched (BASE ce16123, implementer sonnet)
Task 2: implementer DONE 0d51137; RED not captured (tests+impl in one batch) — noted; future dispatches stress RED capture
Task 2: ⚠️ resolved — npm test 17 pass 0 fail, validate passed (controller re-run).
Task 2: minor (deferred): "unknown branch" test asserts only non-empty; appendViolation does not guard undefined rule; git init result unchecked in helper.
Task 2: complete (commits ce16123..0d51137, review clean)
Task 3: dispatched (BASE 0d51137, implementer opus — core text quality)
Ruling: R23 size table goes into Task 4 (reviewer agent + architect skill), not core — budget — cost if wrong: DoD less visible in always-on text.
Ruling: Task 5 injects one line with the absolute path of core/glossary.md (session and subagent context) — subagents cannot locate the plugin — cost if wrong: none.
Ruling: Task 9 ste-check skips `Forbidden:` text on glossary lines (and the core glossary file's forbidden lists) — they hold the forbidden words on purpose — cost if wrong: false positives.
Ruling: model-name lint scope = root *.md, core, agents, skills, hooks, scripts (not docs/, tests/) — cost if wrong: a model name in docs goes unflagged.
Task 3: review → Needs fixes (1 Important: R11 meaning). Fix round 1 sent to implementer (FIX_BASE 896eb5c).
Task 3: minor (deferred): R1 Rule omits "model memory"; R10 omits "Architect and Reviewer stay at top tier" and its Check names Reviewer (controller sees tier); R21 omits "QA asks the Architect"; lint allows model: frontmatter in any file (should be agents/*.md only); lint skips whole lint-rules.mjs; no negative test for lintRepository; misleading error for wrong Check separator; R11/R24 two actions per sentence.
Task 3: ⚠️ cross-task: R18 mechanism text must match Task 6; R4/R19 must match Task 7; REJECTED-SMALL/LARGE must match Task 8 — check at those reviews.
Task 3: fix round 1/5 (2 addressed, 0 open; commits 896eb5c..584c41a)
Task 3: minor (deferred): R11 Rule drops verb ("large to the Architect", "the third"); R11 Check holds QA routing not in Rule.
Task 3: complete (commits 0d51137..584c41a, review clean)
Task 4: dispatched (BASE 584c41a, implementer opus)
Ruling: `claude plugin validate --strict .` reports contents [] here (validates marketplace only); agent/skill frontmatter is covered by tests/roles.test.mjs and by the real install/load in Task 13 — cost if wrong: a bad frontmatter caught only at Task 13.
Ruling: QA report puts `Not verified because: <reason>` on the same line as NOT VERIFIED; Task 10 validateQaReport accepts that form — cost if wrong: one template edit.
Ruling: reviewer verdict carries `Stage: code | final`; Task 8 records Violations regardless of Stage — violations count either way — cost if wrong: none.
Ruling: Brazil-only ANPD item stays out of core security knowledge (project layer) — cost if wrong: none.
Ruling: Task 4 edit of tests/core-content.test.mjs (recursive core/ read) accepted — needed for core/knowledge/ — cost if wrong: none.
Ruling: Security agent has no Bash; the controller (Architect) passes it the diff as a file — record in Task 10/Architect context — cost if wrong: Security cannot read the diff.
Task 4: review → Needs fixes (2 Important: QA2 restates R21, ARC1 restates R13). Fix round 1 sent (FIX_BASE 2fc5657).
Task 4: ⚠️ resolved: (a) Architect step 7 does QA-tool research inline; guilda:qa-tools is build item 3c — Ruling: when 3c lands, the Architect skill points to it; until then inline is the documented fallback (design 6.11 "before that, they list the tool gaps") — cost if wrong: one skill edit later. (b) frontmatter load check → Task 13.
Task 4: minor (deferred): ARC5/VC2/EXE5/VC1 partial restatements — add R-ID to Rule lines; executor step 2 cites R2 for the Architect; Security missing-diff answer REJECTED conflicts with SEC4 and Task 8 reads it as rejection with no rule; ASD sentence length over limits in frontmatter descriptions (architect 52, security 33/28, reviewer 28, VC 27) and 4 instructions >20 words — Task 9 ste-check will flag; knowledge test checks one https only; R23 table copies may drift (no equality test); no lint for role rule duplicating a core Why.
Task 4: fix round 1/5 (2 addressed, 0 open; commits 2fc5657..ac8d026)
Task 4: complete (commits 584c41a..ac8d026, review clean)
Task 5: dispatched (BASE ac8d026, implementer sonnet)
Task 5: implementer DONE_WITH_CONCERNS e19c753 (had a failing test) + cf7944f fix; context 126 non-blank lines without project rules. Ruling: no squash — history is USER's (no rewrite) — cost: one red commit in history.
Task 5: minor (deferred): escalation/diary lines not bounded by budget; hooks.json has no test; version test uses URL.pathname; test name 0.1.0→0.2.0 wrong.
Ruling: Task 6 creates scripts/lib/hook-io.mjs (readStdin, resolveProjectDir, resolvePluginRoot, runHook wrapper that sets process.exitCode instead of process.exit after write, one-line error message) and moves session-start/subagent-start onto it; Tasks 7–10 use it — 6 hooks would otherwise copy the same code — cost if wrong: small refactor scope creep in Task 6.
Ruling: Task 6 also makes the session-start header test read the version from plugin.json (brittle at next bump) — cost if wrong: none.
Task 5: complete (commits ac8d026..cf7944f, review clean)
Task 6: dispatched (BASE cf7944f, implementer sonnet)
Ruling: commit trailers from subagents may name the subagent's model (Sonnet) instead of common.md's line — attribution of the actual model is accurate — cost if wrong: none.
Task 6: ⚠️ resolved — 119 pass, validate passed (controller re-run). Minor "appendViolation throw bypasses block": appendViolation never throws by Task 2 contract (tested) — no action.
Task 6: minor (deferred): no test for missing trigger field.
Task 6: complete (commits cf7944f..12eb96e, review clean)
Task 7: dispatched (BASE 12eb96e, implementer sonnet)
Task 7: review → Needs fixes (Critical: -a/-am/pathspec commits bypass --cached scan; Important plan-mandated: global options before commit bypass regex).
Ruling: the spec wins over the brief text — R19 is a law the agent cannot get around (design 6.13). Scan `git diff HEAD -U0` (index + tracked working tree) always, fallback to --cached when HEAD does not exist; match global git options before `commit` and honor `-C <dir>` as the diff cwd — cost if wrong: an unstaged token in a file not being committed can block a commit (fail closed, acceptable).
Task 7: minor (deferred): user git config (noprefix/mnemonicPrefix/external) can break parsing — pass --no-ext-diff --no-textconv --src-prefix/--dst-prefix; "+++ " content line parsed as header; >64MB diff fails open; R4 case-sensitive on Windows and Bash writes not covered; regex false triggers on echo "git commit".
Task 7: fix round 1 sent (FIX_BASE 5e179f4)
Task 7: fix round 1/5 (2 addressed, 0 open; commits 5e179f4..738dea6)
Task 7: minor (deferred): global options with separate value (--git-dir X, --work-tree X, --namespace X) skip scan; only the first commit in a chained command is scanned.
Task 7: complete (commits 12eb96e..738dea6, review clean)
Task 8: dispatched (BASE 738dea6, implementer sonnet)
Task 8: minor (deferred): duplicate IDs write duplicate records; markdown-decorated Violations line not parsed; one appendViolation throw loses later IDs (appendViolation never throws, low risk); no-config test does not assert empty stderr.
Task 8: complete (commits 738dea6..f282e13, review clean)
Task 9: dispatched (BASE f282e13, implementer opus — sentence parsing + core text edits)
Ruling: writing.exceptions[].docType is a glob matched against the project path or file name; Task 11 init documents it that way (e.g. "docs/adr/**") — cost if wrong: named types need a glob.
Ruling: glossary definition lines are descriptions (25-word limit) — cost if wrong: none.
Ruling: core/knowledge/** is exempt from ste-check (source quotations keep source wording, as dev-grind's Learning Advisor exception); Task 13 puts "core/knowledge/**" in this repo's writing.free — cost if wrong: knowledge text stays long.
Ruling: the PostToolUse check reports the whole file after an Edit (pre-existing issues included), capped at 15 findings — pushes legacy docs toward compliance; revisit at migration (build item 4) if noisy — cost if wrong: noise on legacy docs.
Task 9: ⚠️ resolved — 193 pass, ste-check exit 0 on core/agents/skills (controller re-run); runHookMain/appendViolation never-throw verified in Tasks 2/6 reviews.
Task 9: minor (deferred): CODE/LINK placeholders can match a project-forbidden "code"/"link"; duplicate findings for a word listed under two terms; hook tests missing for outside-project file, invalid config, exceptions skip; multi-line inline code not recognized.
Task 9: complete (commits f282e13..e618c9e, review clean)
Task 10: dispatched (BASE e618c9e, implementer sonnet)
Task 10: implementer DONE_WITH_CONCERNS d9f7860 — docs: dispatch tool = Agent, subagent_type documented, tool_input.prompt NOT stated; SubagentStop decision:block NOT stated, exit 2 documented (keeps the subagent running). SubagentStop branch not built (fallback).
Ruling: pre-agent fails open when tool_input.prompt is missing or not a string (allow + one stderr notice) — the field is unverified and fail-closed would deny every executor dispatch — Task 13 verifies the field live — cost if wrong: incomplete briefs pass until verified.
Ruling: build the SubagentStop format check with the documented route: invalid format → exit 2 with the errors on stderr (keeps the subagent running so it rewrites); add guilda:qa and widen the matcher — exit 2 is documented, unlike decision:block — Task 13 verifies live — cost if wrong: one hook branch to revert.
Task 10: review → Approved with 1 Important (no loop guard on SubagentStop exit 2). Fix round 1 sent (FIX_BASE 0b4e3c7).
Ruling: loop guard = allow (exit 0, one stderr notice) when input.stop_hook_active === true OR when this agent_id was already sent back 2 times (counter in .guilda/format-retries.json, git-ignored like violations.jsonl) — stop_hook_active unverified, the counter is the fallback — cost if wrong: a malformed answer passes after 2 retries.
Task 10: minor (deferred): SCENARIO_START matches indented bullets; SCENARIO_RESULT not anchored to "->"; bold labels rejected without a hint; no test runs the real filled templates.
Task 10: fix round 1/5 (1 addressed, 0 open; commits 0b4e3c7..b18fe41)
Task 10: minor (deferred): fallback retry key shared per agent_type; corrupt retries file disables check permanently; counter never resets.
Task 10: complete (commits e618c9e..b18fe41, review clean)
Task 11: dispatched (BASE b18fe41, implementer opus)
Task 11: implementer DONE_WITH_CONCERNS 9a56ca9 — behaviour eval 3/3 cases 11/11 assertions (iteration 2); trigger eval inconclusive (timeouts from global task-observer start-up in claude -p) — no pass rate claimed.
Ruling: config-template keeps tier placeholders (R17 bans model names in skills/); config-write must fill missing/placeholder tiers from core/tiers.json — reviewer to check; Task 13 smoke uses config-write output, not the raw template — cost if wrong: a placeholder alias reaches dispatch.
Ruling: checkSchema export and lint-rules `--prefix P <file>` CLI mode accepted — cost if wrong: none.
Task 11: review → Needs fixes (Important: tiers not filled from core/tiers.json; placeholder strings pass config-write).
Ruling: the brief's test "config-write rejects answers without tiers" is superseded by the controller ruling — config-write fills missing/placeholder tiers from core/tiers.json; and config-write rejects any remaining `<...>` placeholder string (languages, checks) — cost if wrong: none.
Task 11: minor (deferred): config-write creates a missing project folder; misleading message after partial write; lint-rules --prefix arg guards; trigger eval unresolved (environment, observation 0012).
Task 11: fix round 1 sent (FIX_BASE 9a56ca9)
Task 11: fix round 1/5 (2 addressed, 0 open; commits 9a56ca9..aa54815)
Task 11: complete (commits b18fe41..aa54815, review clean)
Task 12: dispatched (BASE aa54815, implementer sonnet)
Task 12: minor (deferred): temp CHANGELOG file location unspecified in skill (say system temp dir); no CRLF test; no stop rule after failed changelog fetch; tag selection should ignore ^{} and compare numerically.
Task 12: complete (commits aa54815..f9c35dc, review clean)
Ruling: Task 13 smoke uses `claude --plugin-dir <repo>` (loads the plugin for one session, no settings change) instead of `claude plugin marketplace add` + install, which writes the USER's user-scope settings — a side effect outside this repo that norms say to ask about first; the real install step is left "not verified" and offered to USER at the end — cost if wrong: install path unproven until USER runs it.
Ruling: Task 13 also verifies live, if feasible: PreToolUse Agent tool_input field name for the brief; SubagentStop exit 2 behavior — record results; unverifiable → "not verified".
Task 13: dispatched (BASE f9c35dc, implementer sonnet)
Task 13: INTERRUPTED (USER restarts the PC). Implementer stopped after step 1 (checks green) and the dogfood config. Controller committed .guilda/{config.json,rules.md,.gitignore} as a23c876 (wip), npm test 254 pass, lint P exit 0, config-check ok. Branch pushed to origin/feat/part-1 at USER's request.
Task 13: resumed 2026-11-02 on the reformatted machine (Claude Code 2.1.316). The local checkout was a stale backup at 0d51137; fast-forwarded to 530f8e2.
Ruling: run Task 13 step 2 onward in the main session, no subagents — superpowers is not installed, so sdd-workspace and task-brief are not available, and the task is verification with small doc edits — cost if wrong: no separate implementer; the fresh reviewer stays as the check.
Task 13: observation 0012 no longer applies: ~/.claude/CLAUDE.md does not exist, so `claude -p` has no task-observer start-up. A run takes about 4 s.
Task 13: smoke results (temp project with a space in its path, --plugin-dir, config from config-write):
- Step 1: npm test 254 pass, lint-rules exit 0, validate --strict passed.
- Step 2: NOT VERIFIED. marketplace add and install not run (they write USER's settings). --plugin-dir load is verified: 5 agents and 3 skills listed in the init event.
- Step 3, no config: reply `NONE`, no .guilda folder created.
- Step 4, with config: reply `guilda 0.1.0 active`.
- Step 5, fake ghp_ token staged: commit denied with `R19: secret in secret.txt:1`, no commit made, one R19 line in violations.jsonl.
- Step 5b, 31-word sentence in docs/note.md: Claude received `R15: fix these lines: docs/note.md:1 long-sentence 31 words, limit 25`, one R15 line in violations.jsonl.
Task 13: live checks:
- Agent PreToolUse: the brief is in `tool_input.prompt`. Raw payload: {"description","prompt","subagent_type"}. An incomplete executor brief was denied with R3, one R3 line in violations.jsonl.
- SubagentStop exit 2: the subagent keeps running and rewrites. guilda:reviewer answered `hello`, then a valid verdict with `Violations: R6`, and one R6 line was recorded.
- stop_hook_active on SubagentStop: exists. false on the first stop, true on the stop after exit 2. Payload also has agent_id, agent_type, last_assistant_message.
Task 13: trigger eval of guilda:init rerun (sonnet, empty project, Skill call detected from the stream): 12/12 (6 should fire, 6 should not).
Task 13: minor (deferred): currentBranch records `unknown` in a repository with no commits (rev-parse fails on an unborn HEAD; symbolic-ref works) and `HEAD` when detached.
Task 13: minor (deferred): stop_hook_active is true on every retry, so a subagent gets one rewrite, not MAX_RETRIES (2), and the format-retries counter is a fallback that does not limit in practice; a second malformed answer passes and writes no violation.
Task 13: for final review: design section 10 says the R3 law waits for guilda:lab, but plan Task 10 builds pre-agent as an R3 law and it denies live. Decide which text wins.
Task 13: still not verified: real install; whether Stop accepts prompt or agent hook types (not used in Part 1).
RESUME HERE: commit Task 13, then Task 13 review, then final whole-branch review (MERGE_BASE 3aa73a4).
