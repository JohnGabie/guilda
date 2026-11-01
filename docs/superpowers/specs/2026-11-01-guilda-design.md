# guilda — design

Status: draft, waiting for João's approval.
Date: 2026-11-01.

Tags: `[João]` = João decided this in the brainstorm. `[builder call]` = the brainstorm agent decided this; João can
change it. `[open]` = not decided; the document gives a recommendation.

---

## 1. Intent

João built an agent architecture for Claude Code in three projects, in this order:

1. `smart-pets-mod` (Minecraft mod, Portuguese docs).
2. `claudia-rh` (Tauri desktop app, Portuguese docs).
3. `dev-grind` (Cloudflare web platform, English docs).

Each project has its own copy of the rules: a `CLAUDE.md` file and one role file for each agent. Each copy was written
again from zero. An improvement in one project does not reach the other projects. Example: ASD-STE100 writing made a
real difference in `dev-grind`. João wants it in every project, but today he must copy it by hand into each one.

`guilda` is a Claude Code plugin that holds this architecture once. João installs it one time. Every project uses it.
For João, `guilda` is what `superpowers` is: a plugin he installs everywhere that carries his way of working. `[João]`

The name: a guild has a hierarchy (master, journeyman, apprentice) and crafts with their own rules. The architecture
has the same shape: model tiers, roles and rules for each role. `[João]`

## 2. Sources to read before building

Read these files. They are the three versions of the architecture. The core of `guilda` comes from them.

| Project | Location | Files |
|---|---|---|
| smart-pets-mod | GitHub `JohnGabie/smart-pets-mod` (not on the local disk) | `CLAUDE.md`, `agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/spec/GAP-REVIEW.md`, `docs/spec/V0-SPIKES.md`, `docs/22-roadmap.md` |
| claudia-rh | `../claudia-rh` | `CLAUDE.md`, `agents/*.md`, `docs/PRODUCT.md`, `docs/superpowers/CONVENCAO.md`, `.claude/settings.json`, `scripts/dev/journal-skeleton.ps1` |
| dev-grind | `../dev-grind` | `CLAUDE.md`, `docs/roles/*.md`, `.claude/agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/PRODUCT.md`, `scripts/dev/journal-skeleton.sh` |

Prior art in other plugins (read, do not copy): `erclx/canon` (one authoritative rule set installed into many repos),
`Guild-Agents/guild` and `lookatitude/guild` (role-based agent teams).

## 3. Goals

1. One core rule set. The core lives in the `guilda` repository and reaches every project through plugin updates.
2. A separate project layer. Each project keeps only what belongs to that project.
3. A clear path from "improved in one project" to "in the core for all projects": a pull request to the `guilda`
   repository. `[João]`
4. Two skills that start a project: `guilda:product` (writes `PRODUCT.md`) and `guilda:roadmap` (writes
   `ROADMAP.md`). `[João]`
5. The three existing projects migrate to `guilda`. `[João]`

## 4. Non-goals

- `guilda` does not replace `superpowers`. `guilda` complements `superpowers`. `[João]`
- `guilda` is not built for other people first. João is the first user. Others can install it. `[João]`
- `guilda` does not hold domain rules (stack, Minecraft invariants, Tauri identifier). Those stay in the project layer.

## 5. Anti-goals (failure even if it technically works)

- An agent promotes a project change to the core without João's decision.
- The core and a project copy of the same rule exist at the same time and disagree.
- `guilda` stops working when `superpowers` is not installed.
- The rules exist in a file but agents do not follow them. Example: in `dev-grind`, the Architect wrote
  `ROADMAP.md` without ASD-STE100, while the rule was in `CLAUDE.md`. A rule that matters needs a check, not only text.

## 6. Decisions from the brainstorm

### 6.1 Core and project layer `[João]`

A rule change is one of two kinds:

| Kind | Example | Where it goes |
|---|---|---|
| Project adjustment | The two git remotes in `claudia-rh`; the Learning Advisor role in `dev-grind` | Project layer only |
| Rule improvement | ASD-STE100 writing; the executor ↔ reviewer cycle | Core, through a PR to `guilda` |

The project owner decides the kind. An agent can ask "is this change for this project only, or for all projects?".
An agent never decides the kind and never promotes a change alone. `[João]`

### 6.2 Promotion path `[João]`

A rule improvement found in a project becomes a pull request to the `guilda` repository. João reviews and merges
it. After the merge, each project gets the change at its next plugin update. Nobody edits the installed plugin copy.

### 6.3 Language `[João]`

- Everything in the `guilda` repository is in English: skills, role files, rules, docs.
- Each project configures its own languages: the language of replies to the user, and the language of docs.
- ASD-STE100 applies in every language.

### 6.4 ASD-STE100 writing, full strength `[João]`

The core includes the 10 writing rules from `dev-grind/CLAUDE.md` (section WRITING), with no lighter version. Reason:
the docs are shorter and more objective, close to a programming language for people.
Scope (from `dev-grind`): replies to the user, subagent briefs, specs, ADRs, role files, diaries. Out of scope: code,
and the prompts of the product's own AI.

### 6.5 Delivery as skills `[João]`

The core is delivered as skills with the `guilda:` prefix, like `superpowers:brainstorming`. Each skill is built one
at a time with `skill-creator:skill-creator` and `superpowers:writing-skills`. `[João]`

### 6.6 `superpowers` relation `[João]`

`guilda` works with `superpowers` and João uses both. `guilda` must also work without `superpowers`. If a `guilda`
skill uses a `superpowers` skill, it names it as optional and has a fallback.

### 6.7 `guilda:product` `[João]`

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

### 6.8 `guilda:roadmap` `[João]`, procedure `[builder call]`

Converts `PRODUCT.md` into a concrete plan: versions, architecture, technical decisions.
Procedure (from `smart-pets-mod`, which João rated better than the `dev-grind` roadmap):

1. Gap review: the vision against the code. Tables for contradictions, missing pieces, decisions for the human,
   explicit cuts (model: `smart-pets-mod/docs/spec/GAP-REVIEW.md`).
2. A v0 of risk spikes. Each spike has a question, a method, a measurable PASS, a fallback ladder and an ADR (model:
   `smart-pets-mod/docs/spec/V0-SPIKES.md`).
3. A "cheap precautions now" list for each later version.
4. Measurable completion criteria for each version. Never "defined by the spec later".

### 6.9 The Architect disagrees `[João]`

New Architect rule: the Architect disagrees with the user when it has a reason. It does not agree with an error to be
polite. Truth comes before courtesy. The Architect states the disagreement, the reason and the evidence, then the user
decides.

## 7. What the core contains

From the parts the three projects share:

1. Source of truth order: approved spec, docs, rules file. Conversation and model memory are not sources. Conflict or
   vague spec: stop and ask.
2. Spec before code, with explicit approval as a separate message. Writing the spec and implementing in the same reply
   is a violation.
3. The roles: Architect, Executor, Reviewer, QA, Version control. Each with Role, Does, Does not, and a fixed output
   format (task brief, executor answer, reviewer verdict, QA report).
4. Model tiers in one file, the only place with model names. Tier names: `[open]`, recommendation in 9.3.
5. Escalation: an executor that fails twice on the same thing moves up one tier. Architect and Reviewer stay at the
   top tier.
6. Independence: the Reviewer reads spec and diff before the executor's justification. Nobody approves their own work.
7. Evidence rules: real exit codes, no filtered output, "not verified" written when not verified.
8. "The human decides" list (taste, scope, numbers, merge, release, irreversible actions).
9. Context diary before compaction: PreCompact and SessionStart hooks plus the journal skeleton script.
10. ASD-STE100 writing (6.4). The Architect disagrees (6.9).
11. Deletion safety: code that deletes files gets the deletion rules in the subagent brief (from `claudia-rh`).

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
7. How to enforce ASD-STE100 (anti-goal 4): a check skill, a hook, or a reviewer checklist item.

## 9. Open decisions (João decides; recommendation given)

1. **Spec convention.** `claudia-rh` uses one living spec per area. `dev-grind` uses one MD per feature (spec,
   Acceptance and plan in one file). Recommendation: one MD per feature, from `dev-grind`, because it is the newest
   and keeps spec and plan together. The other stays possible as a project override.
2. **Rejection limit.** `smart-pets-mod` and `dev-grind`: 3 rejections, then escalate. `claudia-rh`: 5.
   Recommendation: 3.
3. **Tier names.** Proposal: `master`, `journeyman`, `apprentice` (the guild hierarchy), shown in the project's
   language. Alternative: keep `STRONG`, `MEDIUM`, `FAST`.
4. **Git flow.** `dev-grind` uses autocommit plus `backup/*` branches. `claudia-rh` uses a PR to `dev` per feature
   and a separate `backup` remote. Recommendation: the core holds the shared principles (no history rewrite, merge is
   the human's decision, backup before compaction); the concrete flow is a project setting.
5. **Visibility of the GitHub repository.** Created private. João makes it public when he wants.

## 10. Build order

Each item gets its own brainstorm (if needed), plan and build, in this order:

1. Skeleton and core: repository, marketplace, project config, core rules (with ASD-STE100), roles, tiers, diary hooks.
2. `guilda:product`.
3. `guilda:roadmap`.
4. Migration of `smart-pets-mod`, `claudia-rh` and `dev-grind`: core rules leave each project; the project layer stays.
5. Promotion flow: a skill that helps classify a rule change and drafts the PR to `guilda`.

## 11. Constraints

- Windows 11 is the main machine. Scripts run in Git Bash and must not depend on Unix-only calls without a fallback.
  Known issue: `skill-creator`'s `run_eval.py` uses `select.select` on a pipe, which fails on Windows.
- No absolute machine paths and no personal data in repository files.
- Deletion safety rules from João's global `CLAUDE.md` apply to any script that deletes files.
