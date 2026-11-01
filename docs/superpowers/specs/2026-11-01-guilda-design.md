# guilda — design

Status: draft, waiting for USER's approval.
Date: 2026-11-01.

Tags: `[USER]` = USER decided this in the brainstorm. `[builder call]` = the brainstorm agent decided this; USER can
change it. `[open]` = not decided; the document gives a recommendation.

---

## 1. Intent

USER built an agent architecture for Claude Code in three projects, in this order:

1. `smart-pets-mod` (Minecraft mod, Portuguese docs).
2. `claudia-rh` (Tauri desktop app, Portuguese docs).
3. `dev-grind` (Cloudflare web platform, English docs).
4. HealthAurora (Nuxt health app, Portuguese docs), based on `smart-pets-mod`; it added a Security role.

Each project has its own copy of the rules: a `CLAUDE.md` file and one role file for each agent. Each copy was written
again from zero. An improvement in one project does not reach the other projects. Example: ASD-STE100 writing made a
real difference in `dev-grind`. USER wants it in every project, but today USER must copy it by hand into each one.

`guilda` is a Claude Code plugin that holds this architecture once. USER installs it one time. Every project uses it.
For USER, `guilda` is what `superpowers` is: a plugin USER installs everywhere that carries USER's way of working. `[USER]`

The name: a guild has a hierarchy (master, journeyman, apprentice) and crafts with their own rules. The architecture
has the same shape: model tiers, roles and rules for each role. `[USER]`

## 2. Sources to read before building

Read these files. They are the four versions of the architecture. The core of `guilda` comes from them.

| Project | Location | Files |
|---|---|---|
| smart-pets-mod | GitHub `JohnGabie/smart-pets-mod` (not on the local disk) | `CLAUDE.md`, `agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/spec/GAP-REVIEW.md`, `docs/spec/V0-SPIKES.md`, `docs/22-roadmap.md` |
| claudia-rh | `../claudia-rh` | `CLAUDE.md`, `agents/*.md`, `docs/PRODUCT.md`, `docs/superpowers/CONVENCAO.md`, `.claude/settings.json`, `scripts/dev/journal-skeleton.ps1` |
| dev-grind | `../dev-grind` | `CLAUDE.md`, `docs/roles/*.md`, `.claude/agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/PRODUCT.md`, `scripts/dev/journal-skeleton.sh` |
| HealthAurora | local checkout of the HealthAurora repository, branch `chore/agents-architecture` (ask USER for the path) | `CLAUDE.md`, `agents/*.md` (with `agent-seguranca.md`, `guia-escrita.md`, `qa-conhecimento.md`, `seguranca-conhecimento.md`), `docs/superpowers/specs/chore-agents-architecture-design.md` |

Prior art in other plugins (read, do not copy): `erclx/canon` (one authoritative rule set installed into many repos),
`Guild-Agents/guild` and `lookatitude/guild` (role-based agent teams).

## 3. Goals

1. One core rule set. The core lives in the `guilda` repository and reaches every project through plugin updates.
2. A separate project layer. Each project keeps only what belongs to that project.
3. A clear path from "improved in one project" to "in the core for all projects": a pull request to the `guilda`
   repository. `[USER]`
4. Two skills that start a project: `guilda:product` (writes `PRODUCT.md`) and `guilda:roadmap` (writes
   `ROADMAP.md`). `[USER]`
5. The three existing projects migrate to `guilda`. `[USER]`

## 4. Non-goals

- `guilda` does not replace `superpowers`. `guilda` complements `superpowers`. `[USER]`
- `guilda` is not built for other people first. USER is the first user. Others can install it. `[USER]`
- `guilda` does not hold domain rules (stack, Minecraft invariants, Tauri identifier). Those stay in the project layer.

## 5. Anti-goals (failure even if it technically works)

- An agent promotes a project change to the core without USER's decision.
- The core and a project copy of the same rule exist at the same time and disagree.
- `guilda` stops working when `superpowers` is not installed.
- The rules exist in a file but agents do not follow them. Example: in `dev-grind`, the Architect wrote
  `ROADMAP.md` without ASD-STE100, while the rule was in `CLAUDE.md`. A rule that matters needs a check, not only text.

## 6. Decisions from the brainstorm

### 6.1 Core and project layer `[USER]`

A rule change is one of two kinds:

| Kind | Example | Where it goes |
|---|---|---|
| Project adjustment | The two git remotes in `claudia-rh`; the Learning Advisor role in `dev-grind` | Project layer only |
| Rule improvement | ASD-STE100 writing; the executor ↔ reviewer cycle | Core, through a PR to `guilda` |

The project owner decides the kind. An agent can ask "is this change for this project only, or for all projects?".
An agent never decides the kind and never promotes a change alone. `[USER]`

### 6.2 Promotion path `[USER]`

A rule improvement found in a project becomes a pull request to the `guilda` repository. USER reviews and merges
it. After the merge, each project gets the change at its next plugin update. Nobody edits the installed plugin copy.

### 6.3 Language `[USER]`

- Everything in the `guilda` repository is in English: skills, role files, rules, docs.
- Each project configures its own languages: the language of replies to the user, and the language of docs.
- ASD-STE100 applies in every language.

### 6.4 ASD-STE100 writing, full strength `[USER]`

The core includes the 10 writing rules from `dev-grind/CLAUDE.md` (section WRITING), with no lighter version. Reason:
the docs are shorter and more objective, close to a programming language for people.
Scope: full strength for every text agents read or write: replies to the user, subagent briefs, specs, plans, ADRs,
role files, verdicts, reports, diaries. `[USER]` Out of scope ("free"): code, and text the product's end user reads
(UI copy, blog, product messages, the prompts of the product's own AI). `[USER]`

No levels by default. Reason: "80% of the guide" cannot be checked by a hook or a reviewer (6.13), and a level invites
the agent to treat a document as an exception. `[USER]`

A project can customize this: add document types to "free", or use levels (as HealthAurora does: 100% / 80% / free).
The project layer declares each exception with its reason, and `guilda:init` shows it to the user for approval. `[USER]`

Two parts of the HealthAurora writing guide join the core `[builder call]`:
- A glossary with forbidden words: each term has one definition and the words that must not replace it. This is the
  controlled dictionary of ASD-STE100. The project layer holds the domain terms; the core holds the process terms.
- Fixed meaning in every language: *must* = mandatory, the task fails without it; *may* = optional, the agent
  decides; *must not* = never happens, a violation is a rejection.

### 6.5 Delivery as skills `[USER]`

The core is delivered as skills with the `guilda:` prefix, like `superpowers:brainstorming`. Each skill is built one
at a time with `skill-creator:skill-creator` and `superpowers:writing-skills`. `[USER]`

### 6.6 `superpowers` relation `[USER]`

`guilda` works with `superpowers` and USER uses both. `guilda` must also work without `superpowers`. If a `guilda`
skill uses a `superpowers` skill, it names it as optional and has a fallback.

### 6.7 `guilda:product` `[USER]`

1. Writes `PRODUCT.md`: the central idea of the project in its final form (version 1.0). What it is, what it should
   be, what it represents, which features it has. It can also describe the future after 1.0. It can start at the
   beginning of a project or in the middle of one.
2. After the first draft, runs question rounds:
   - Affirmative questions: what the product is.
   - Negative questions: test each feature against what the user wants, and define what the product is not.
   One question per message, always. A request for "a round" means more messages, not a list. (In `claudia-rh`, a
   20-item list for an anti-pattern round was rejected.)
3. Includes, by default, the sections "Conceptual bugs in this vision" and "Beliefs this vision rests on" from
   `dev-grind/docs/PRODUCT.md` (sections 14 and 15). `[builder call]`

### 6.8 `guilda:roadmap` `[USER]`, procedure `[builder call]`

Converts `PRODUCT.md` into a concrete plan: versions, architecture, technical decisions.
Procedure (from `smart-pets-mod`, which USER rated better than the `dev-grind` roadmap):

1. Gap review: the vision against the code. Tables for contradictions, missing pieces, decisions for the human,
   explicit cuts (model: `smart-pets-mod/docs/spec/GAP-REVIEW.md`).
2. A v0 of risk spikes. Each spike has a question, a method, a measurable PASS, a fallback ladder and an ADR (model:
   `smart-pets-mod/docs/spec/V0-SPIKES.md`).
3. A "cheap precautions now" list for each later version.
4. Measurable completion criteria for each version. Never "defined by the spec later".

### 6.9 The Architect disagrees `[USER]`

New Architect rule: the Architect disagrees with the user when it has a reason. It does not agree with an error to be
polite. Truth comes before courtesy. The Architect states the disagreement, the reason and the evidence, then the user
decides.

### 6.10 The `docs/` folder `[USER]`, layout `[builder call]`

Every project keeps its documents in `docs/`, the folder `superpowers` already uses. `[USER]` Specs go in
`docs/superpowers/specs/`. Documents that are not specs have their own place. `[USER]`
Layout, taken from `dev-grind` and `claudia-rh`:

```
docs/
├── PRODUCT.md            ← guilda:product (both projects keep it at the docs/ root)
├── ROADMAP.md            ← guilda:roadmap
├── adr/                  ← NNNN-<title>.md + README.md (format and index)
├── roles/                ← only project roles and project overrides; core roles live in the plugin
├── research/             ← dated research notes (claudia-rh: docs/pesquisa/)
├── labs/                 ← lab reports, one per lab branch (6.12)
├── <domain>/             ← project-specific folders (dev-grind: docs/learning/)
└── superpowers/
    └── specs/            ← one MD per feature (9, item 1) + GLOSSARY.md
```

Folder names follow the project's docs language (`research/` or `pesquisa/`). `guilda:init` maps the folders a
project already has and does not move them without approval.

### 6.11 QA tooling: the Architect plans it, QA demands it `[USER]`

QA tests by itself, in a simulated environment, with tools that fit the platform. Rules:

1. The Architect names the test tools QA needs, for every scenario: web, Android, iOS, desktop, CLI, game, API,
   hardware, any other. Examples: a web app → the browser (Playwright MCP); Android → a mobile MCP or `adb`; a
   Windows desktop app → UI automation; a Minecraft mod → a game-client bridge.
2. If no known tool fits, the Architect researches and suggests one (an MCP server, a CLI, an emulator, a sandbox).
3. The Architect tells the user when it is time to prepare the tools: "this is the moment to set up the tools QA
   needs". Setting up a tool that installs software or leaves the machine is the user's decision.
4. QA demands these tools. Without the named tool, QA does not mark a scenario as passed: the result is
   `NOT VERIFIED`, with the missing tool named, and QA asks the Architect for it.

The research in step 2 is its own skill: `guilda:qa-tools`. `[USER]` Input: the platform and the Acceptance
scenarios. Output: for each scenario, the tool that verifies it, how to set it up, what it costs (install, account,
network), a measurable PASS that proves the tool works, and the user's decisions. It reuses tools the project or the
machine already has before it suggests new ones. `[builder call]`

Where this happens `[builder call]`:
- `guilda:roadmap`: tool setup is part of the v0 spikes (like `smart-pets-mod` V0-S0, toolchain), with a measurable
  PASS for each tool.
- Each feature spec: every Acceptance scenario names the tool that verifies it.
- `guilda:init`: lists the test tools the project already has, and the gaps.

### 6.12 The lab: test a concept before building it `[USER]`

A lab tests in practice what the MDs describe in concept, before the build starts. It is used mostly in the first
versions (v0.0), where the initial ideas are approved or rejected. A lab can test anything: an architecture, a tool
(for agents, for QA, any), a skill, a library, a platform limit. Examples USER already built: `win-sandbox-lab`,
`agent-creator-lab`, `claudia-rh/sandbox-lab/`, the `smart-pets-mod` V0 spikes.

Cycle:

1. The idea comes from a concept doc (`PRODUCT.md`, `ROADMAP.md`, a spec or an ADR).
2. The lab runs it in an isolated, disposable environment, with a measurable PASS defined before the run.
3. **Approved:** the result goes back into the docs (an ADR, the roadmap, the spec) as verified, with evidence.
4. **Rejected:** the work goes back to the concept phase. The docs are rewritten, a new question session runs with the
   user, and the failure is recorded as a lesson (what was tried, why it failed, what it teaches). Then the team
   looks for a new path.

The lab is a skill: `guilda:lab`. `[USER]` `guilda:roadmap` puts lab experiments in v0; `guilda:qa-tools` uses a lab
to prove a QA tool works. `[builder call]`

Where a lab lives `[USER]`: a branch of the project (for example `lab/<name>`). At the end, the branch is archived or
discarded; only the results stay. `[USER]` The results stay as a lab report in `docs/` (for example
`docs/labs/YYYY-MM-DD-<name>.md`): hypothesis, PASS criterion, method, evidence, verdict, lessons. Archive means an
`archive/*` tag before the branch is removed, as in `claudia-rh`; removing a branch follows the core git rules and
needs the user's OK. `[builder call]`

Approval needs a rigorous viability test, not one good run. `[USER]` After approval, the related MDs are rewritten
with the findings and treat the result as working. `[USER]` The lab report states how the PASS was proven (number of
runs, conditions, what was not tested). `[builder call]`

### 6.13 Rules that agents do not ignore `[USER]`

The USER wants every rule followed. Text alone does not do this: in `dev-grind`, ASD-STE100 was ignored; in
`claudia-rh`, a branch prefix rule was ignored. Each rule therefore has a fixed format, a check level and a place.

**Format.** Every core rule and every project rule is written in ASD-STE100, with an ID:

```
R3 — Spec before code
Rule:  Do not write product code before the user approves the spec in a separate message.
Why:   Code from an unapproved spec builds the wrong thing.
Check: hook — PreToolUse refuses Write/Edit in product paths while the feature MD has no approval mark.
```

- `Rule`: one sentence, imperative, 20 words or fewer.
- `Why`: one sentence.
- `Check`: the level (below) and the mechanism.
- Reviewers, verdicts and reports cite the ID ("violates R3").

**Check levels**, in order of preference:

| Level | Mechanism | Can an agent ignore it? |
|---|---|---|
| Law | A hook that blocks: `PreToolUse` refuses the action, `PreCompact` demands the diary, a pre-commit check scans for secrets and absolute paths | No. The harness blocks it. |
| Gate | A reviewer checklist item that cites the ID. A violation is `REJECTED` | The executor can, but the work does not pass. |
| Judgment | Text only | Yes. Keep this level as small as possible. |

Every rule that can be a law becomes a law. A rule stays a gate or a judgment only when no hook can check it, and the
rule states why.

**Place: the rule is in context near the action it governs.** `[builder call]`

- Always-on core: only principles and gates, injected at session start and again after each compaction. Target:
  150 lines or fewer, because adherence drops as always-on instructions grow (frontier models follow about 150 to
  200 instructions reliably).
- Role rules: in the plugin agent definition of each role. A subagent starts with a clean context and gets only its
  own rules.
- Procedures and output formats: in skills, loaded when the role starts work.

**Escalation.** A rule violated twice moves up one level: judgment → gate → law. The fix is a stronger check, never
a rewrite of the same text. `[USER]` The lab (6.12) measures adherence with scenarios that tempt an agent to break the
rule, and counts how often it complies. `[builder call]`

**Violation log.** `[USER]` Each project keeps a violation log (for example `.guilda/violations.jsonl`, committed).
It catches failures without depending on an agent to notice them:

| Level | Who writes the record | Reliable? |
|---|---|---|
| Law | The hook that blocks the action writes the attempt: rule ID, date, action, branch. | Yes |
| Gate | A script reads each reviewer verdict and records every "violates R<n>". The verdict format is fixed. | Yes, once the verdict format is fixed |
| Judgment | A `Stop` hook checks the end of each turn against the rules; a correction from the user in the next message is also recorded. | No. It lowers the miss rate only. Verify in the Claude Code docs which hook types exist before building it. |

- The escalation rule reads this log. When a rule reaches 2 violations, `guilda` proposes to move it up one level.
- If the rule is a core rule, the proposal becomes a candidate PR to the `guilda` repository (6.2).
- The log never holds secrets, personal data or file contents; only the rule ID and where it happened.
- `task-observer` stays an optional complement, like `superpowers`: it catches what the log cannot see (user
  corrections in free text, new methods, skill ideas). `[builder call]`

**Not proven yet.** The R3 hook needs an approval mark that only the user can write. If an agent can write the mark,
the hook protects nothing. This mechanism is a first experiment for `guilda:lab`. `[open]`

## 7. What the core contains

From the parts the three projects share:

1. Source of truth order: approved spec, docs, rules file. Conversation and model memory are not sources. Conflict or
   vague spec: stop and ask.
2. Spec before code, with explicit approval as a separate message. Writing the spec and implementing in the same reply
   is a violation.
3. The roles: Architect, Executor, Reviewer, QA, Version control, and Security (optional, item 17). Each with Role, Does, Does not, and a fixed output
   format (task brief, executor answer, reviewer verdict, QA report).
4. Model tiers in one file, the only place with model names. Tier names in 9 (item 3); model mapping in 9.1.
5. Escalation: an executor that fails twice on the same thing moves up one tier. Architect and Reviewer stay at the
   top tier.
6. Independence: the Reviewer reads spec and diff before the executor's justification. Nobody approves their own work.
7. Evidence rules: real exit codes, no filtered output, "not verified" written when not verified.
8. "The human decides" list (taste, scope, numbers, merge, release, irreversible actions).
9. Context diary before compaction: PreCompact and SessionStart hooks plus the journal skeleton script.
10. ASD-STE100 writing (6.4). The Architect disagrees (6.9).
11. Deletion safety: code that deletes files gets the deletion rules in the subagent brief (from `claudia-rh`).
    The core carries its own English text of these rules, because other users do not have USER's global
    `CLAUDE.md`. `[builder call]`

Rules that `claudia-rh` and `dev-grind` both have, proposed for the core. USER's approval of this document is the
decision to promote them. `[builder call]`

12. Questions to the user go through AskUserQuestion: 2-4 options, the recommended option first.
13. A definition of done that scales with the size of the change.
14. One plan task per executor ↔ reviewer cycle. The task closes only with the reviewer's written approval.
15. One concern per agent. Two agents never edit the same file.
16. A failed agent counts as nothing delivered. The integrator runs the checks again.

From HealthAurora (items 17 to 21, 23) and from USER (item 22), proposed for the core. USER's approval of this document is the decision to promote them.
`[builder call]`

17. **Security role, optional.** It runs only on tasks that touch a risk area, in parallel with the Reviewer, and
    QA starts only after both approve. The Architect consults it when a spec or brief touches a risk area; its
    requirements go into the Acceptance criteria. It only points; it never edits. `guilda:init` turns it on when the
    project has risk areas; the list of risk areas lives in the project layer.
18. **Knowledge files per role** (for example QA and Security). Every item cites the page that was read. An item not
    read in its source is marked "not confirmed", and no agent rejects work because of it. Generic knowledge (OWASP,
    exploratory testing techniques) lives in the core; "how it applies here" lives in the project layer.
19. **Small or large rejection.** Small: the fix fits the current brief, and the task goes back to the Executor.
    Large: the fix changes a spec scenario, an Acceptance criterion, a contract or the brief's file list, and the task
    goes to the Architect. The QA report goes to the Reviewer, never straight to the Executor.
20. **QA in two phases.** Phase 1: test exactly what was asked, one criterion at a time. Phase 2: test around the
    change (neighbor screens, integrations, visual and UX consistency); findings there are out-of-scope notes for the
    Architect. QA follows a method, not a fixed list of screens.
22. **Memory is a guess, never evidence.** `[USER]` The Architect and the Reviewer can start from a guess that
    comes from model memory, but they verify it before they use it. `[USER]`
    - Architect: verifies on the internet, in current sources (official docs, release notes, the library's
      repository). `[USER]`
    - Reviewer: verifies in the project: reads the files, runs the tests and the checks, reads the installed package
      types and the real output. `[USER]`
    - Until it is verified, a claim is labeled "guess (memory)" in the spec, the brief or the verdict. A verdict or a
      spec decision never rests on an unverified guess. `[builder call]`
    - This extends the existing rule "verify APIs in a real source" from `dev-grind` and `smart-pets-mod` to every
      claim: versions, limits, prices, behavior, best practices.
23. **The user's fears.** `guilda:init` asks what must never happen in the project. The answers become hard rules
    in the project layer, with a check level (6.13).

### 7.1 `guilda:init` adapts the plugin to the project `[USER]`

USER adapted the rules to each of the three projects by hand. `guilda:init` does this adaptation when a project
adopts `guilda`, new or existing. Steps (detail is a `[builder call]`):

1. Read the project: stack, build, test and typecheck commands, test tools (browser, game client, sandbox), git
   branches and remotes, existing `CLAUDE.md`, role files, hooks and docs.
2. Talk with the user about the project to adapt the rules. `[USER]` If `superpowers:brainstorming` is installed,
   use it for this conversation. If not, use the built-in fallback: one question per message, and play back what was
   understood. `[USER]`
3. Propose the project layer: languages, real commands for the checks, domain rules and invariants, extra roles (like
   the Learning Advisor), QA tools, the git flow, the tier mapping.
4. In an existing project: list each existing rule as "already in the core" (to remove), "project adjustment" (to
   keep) or "candidate for the core" (for a PR to `guilda`, 6.2).
5. Ask the user to approve the proposal before it writes any file. Only commands that were run go into the project
   layer; never invented commands.

`guilda:init` can run again later, when the project changes, to propose updates to the project layer.

### 7.2 Scope of activation `[builder call]`

The core is active only in a project that opted in: a project with a `guilda` project config. In any other
repository, `guilda` injects nothing. `guilda:init` creates the project config. Reason: a user-scope plugin reaches
every repository on the machine; a project that has not migrated keeps its own rules, and two active rule sets
would disagree (anti-goal 2).

Install scope does not change the behavior. `[USER]` The plugin can be installed at user scope (global) or at
project scope (`.claude/settings.json`). In both cases, every project needs `guilda:init` to adapt the core rules,
the roles and the project rules to that project. `[USER]` The difference is only where the plugin is available:

| Install scope | Without project config | With project config |
|---|---|---|
| User (global) | `guilda` skills can be called; nothing is injected; no reminder | Core active |
| Project | Same as user scope, for everyone who clones the repository | Core active |

The project config is committed, so a clone of a project with `guilda` gets the same project layer. `[builder call]`

## 8. Left to the builder

These are builder calls. The builder decides and writes the reason in the plan.

1. How the core reaches every session. Constraint: core rules must be active in every session, not only when a skill
   loads. Candidate: a `SessionStart` hook that injects the core rules and the project config. Verify in the Claude
   Code plugin docs which mechanism is supported; do not guess.
2. Roles as plugin agents (`agents/*.md` in the plugin, with the `model:` alias from the tier table) or as skills.
3. The project layer format: where the project config lives (for example `.guilda/config.json` or a section in the
   project `CLAUDE.md`), and what it holds (languages, tier mapping override, extra roles, domain rules).
4. How a project overrides a core rule, and how a check detects a project copy that duplicates a core rule.
5. The journal skeleton script: one cross-platform version (bash, Windows Git Bash) instead of `.sh` and `.ps1`.
6. The plugin repository acts as its own marketplace (`.claude-plugin/marketplace.json`), like `superpowers`.
7. How to enforce ASD-STE100 (anti-goal 4): a hook if a check can be automated, otherwise a reviewer gate (6.13).

## 9. Decisions after the builder check `[USER]`

USER accepted the recommendations for items 1 to 4.

1. **Spec convention.** One MD per feature (spec, Acceptance and plan in one file), from `dev-grind`. One living spec
   per area (`claudia-rh`) stays possible as a project override.
2. **Rejection limit.** 3 rejections, then escalate to the Architect and the user.
3. **Tier names.** `master`, `journeyman`, `apprentice` (the guild hierarchy), shown in the project's language.
4. **Git flow.** The core holds the shared principles: no history rewrite, merge is the human's decision, backup
   before compaction. The concrete flow (autocommit, PR per feature, remotes) is a project setting.
5. **Visibility of the GitHub repository.** Created private. USER makes it public when USER wants.

### 9.1 Still open: model mapping `[open]`

The tier names are fixed (item 3). The model for each tier is not fixed. USER uses Claude models, but a user can put
any model in any tier (for example Fable in `master`). Requirements:

- The mapping lives in one place in the project layer, set by `guilda:init` (7.1, step 2).
- The plugin ships a default mapping for Claude models. The default is a suggestion, not a rule.
- Presets for other providers are possible later. The design does not define them now.

## 10. Build order

Each item gets its own brainstorm (if needed), plan and build, in this order:

1. Skeleton and core: repository, marketplace, project config, core rules (with ASD-STE100), roles, tiers, diary
   hooks, and `guilda:init` (7.1).
2. `guilda:product`.
3. `guilda:roadmap`.
3a. `guilda:lab` (6.12).
3b. `guilda:qa-tools` (6.11). `guilda:roadmap` and `guilda:init` call it when it exists; before that, they list the
    tool gaps without the research.
4. Migration of `smart-pets-mod`, `claudia-rh` and `dev-grind`: core rules leave each project; the project layer stays.
5. Promotion flow: a skill that helps classify a rule change and drafts the PR to `guilda`.

The first implementation plan covers item 1 only. Each later item gets its own plan after the item before it is
done. `[builder call]`

## 11. Constraints

- Windows 11 is the main machine. Scripts run in Git Bash and must not depend on Unix-only calls without a fallback.
  Known issue: `skill-creator`'s `run_eval.py` uses `select.select` on a pipe, which fails on Windows. The builder
  runs the eval with a local fix (a reader thread, as `agent-creator` does) and does not skip the eval. `[builder call]`
- No absolute machine paths and no personal data in repository files.
- Deletion safety rules from USER's global `CLAUDE.md` apply to any script that deletes files.
