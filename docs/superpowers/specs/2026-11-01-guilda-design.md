# guilda — design

Status: approved by USER on 2026-11-01.
Date: 2026-11-01.

Tags: `[USER]` = USER decided this in the brainstorm. `[builder call]` = the brainstorm agent decided this; USER can
change it. `[open]` = not decided; the document gives a recommendation.

---

## 1. Intent

USER built an agent architecture for Claude Code in four projects, in this order:

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
| smart-pets-mod | GitHub `JohnGabie/smart-pets-mod`, public; read with `gh api` or a clone (not on the local disk) | `CLAUDE.md`, `agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/spec/GAP-REVIEW.md`, `docs/spec/V0-SPIKES.md`, `docs/22-roadmap.md` |
| claudia-rh | `../claudia-rh` | `CLAUDE.md`, `agents/*.md`, `docs/PRODUCT.md`, `docs/superpowers/CONVENCAO.md`, `.claude/settings.json`, `scripts/dev/journal-skeleton.ps1` |
| dev-grind | `../dev-grind` | `CLAUDE.md`, `docs/roles/*.md`, `.claude/agents/*.md`, `.claude/hooks/*`, `.claude/settings.json`, `docs/PRODUCT.md`, `scripts/dev/journal-skeleton.sh` |
| HealthAurora | local checkout of the HealthAurora repository, branch `chore/agents-architecture` (local path: `../bruna-app`; fetch the branch first) | `CLAUDE.md`, `agents/*.md` (with `agent-seguranca.md`, `guia-escrita.md`, `qa-conhecimento.md`, `seguranca-conhecimento.md`), `docs/superpowers/specs/chore-agents-architecture-design.md` |

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
  own rules, plus a short core subset injected by a `SubagentStart` hook: the writing rules (6.4), the evidence rules
  and memory-is-a-guess (item 22). `SessionStart` context does not reach subagents. The 150-line budget applies to
  the main session and, separately, to each subagent's injected text. `[builder call]`
- Procedures and output formats: in skills, loaded when the role starts work.

**Escalation.** A rule violated twice moves up one level: judgment → gate → law. The fix is a stronger check, never
a rewrite of the same text. `[USER]` The lab (6.12) measures adherence with scenarios that tempt an agent to break the
rule, and counts how often it complies. `[builder call]`

What each step means `[builder call]`:
- Judgment → gate: always possible. The rule gets a reviewer checklist item.
- Gate → law: a gate means no known hook can check the rule. Two violations start a search for a hook, as a lab
  experiment. If the lab finds no hook, `guilda` flags the rule to the user with the violation count.
- At law level, a blocked attempt is not a failure of the rule. Two blocks of the same rule in one project mean the
  instructions push agents toward the blocked action: `guilda` flags the rule to the user for a review of the
  surrounding instructions.

**Violation log.** `[USER]` Each project keeps a violation log (for example `.guilda/violations.jsonl`). It is local
and git-ignored, so hook writes on every branch do not cause merge conflicts or commit noise. Counts are per project.
A core rule with 2 violations in any one project becomes a PR candidate; the user decides. `[builder call]`
It catches failures without depending on an agent to notice them:

| Level | Who writes the record | Reliable? |
|---|---|---|
| Law | The hook that blocks the action writes the attempt: rule ID, date, action, branch. | Yes |
| Gate | A script reads each reviewer verdict and records every "violates R<n>". The verdict format is fixed. | Yes, once the verdict format is fixed |
| Judgment | A `Stop` hook checks the end of each turn against the rules; a correction from the user in the next message is also recorded. Not verified: whether `Stop` accepts prompt or agent hook types (two reads of the hooks docs on 2026-11-01 disagreed). A command hook that reads `last_assistant_message` works. Verify before build. | No. It lowers the miss rate only. |

- The escalation rule reads this log. When a rule reaches 2 violations, `guilda` proposes to move it up one level.
- If the rule is a core rule, the proposal becomes a candidate PR to the `guilda` repository (6.2).
- The log never holds secrets, personal data or file contents; only the rule ID and where it happened.
- `task-observer` stays an optional complement, like `superpowers`: it catches what the log cannot see (user
  corrections in free text, new methods, skill ideas). `[builder call]`

**Not proven yet.** The R3 hook needs an approval mark that only the user can write. If an agent can write the mark,
the hook protects nothing. This mechanism is a first experiment for `guilda:lab`. `[open]` Until the lab proves the
mark, R3 ships as a gate in build item 1, not as a law. `[builder call]`

### 6.14 Versions and updates `[USER]`

USER wants to know which `guilda` version is installed, and to update when the repository has a new version. `[USER]`
Facts from the Claude Code docs (read on 2026-11-01: `code.claude.com/docs/en/plugins/publish`,
`code.claude.com/docs/en/discover-plugins`):

- The `version` field in `plugin.json` decides updates. If it does not change, `claude plugin update` keeps the old
  copy. If `version` is omitted, Claude Code uses the git commit SHA.
- Auto-update is off by default for a marketplace that is not an official one. The user turns it on in `/plugin` →
  Marketplaces → Enable auto-update.
- Manual update: `claude plugin update <plugin>@<marketplace>`, or `/plugin` → Installed → Update now.
- A running session keeps the loaded version. `/reload-plugins` or a new session loads the update.
- `claude plugin list` shows the installed version. `claude plugin tag` creates a `{name}--v{version}` git tag.
- A private repository works when the user's git credentials can clone it (for example `gh auth login`).

Design `[builder call]`:

1. **Semver in `plugin.json`, raised on every merge to `main`.** Major: a core rule is removed or changes meaning;
   projects must run `guilda:init` again. Minor: a new rule, role or skill. Patch: a fix that does not change
   behavior.
2. **`CHANGELOG.md`** in the repository: one entry for each version, with the rule IDs that changed.
3. **Release check:** `claude plugin validate --strict` passes, the version was raised, and a `guilda--vX.Y.Z` tag is
   created.
4. **The project remembers its version.** The project config records the `guilda` version it was adapted with. At
   session start, if the installed version is newer, `guilda` says so in one line, with the changelog summary, and
   proposes `guilda:init` to review the project layer. For a major version, `guilda` says that `guilda:init` is
   required.
5. **`guilda:update` skill:** shows the installed version, the newest version in the repository and the changelog
   between them; runs `claude plugin update` when the user approves; tells the user to run `/reload-plugins`.
6. **Recommendation to USER:** turn on auto-update for the `guilda` marketplace. Then a new version arrives by itself,
   and item 4 tells each project what changed.

### 6.15 Create a new role and put it in the flow `[USER]`

Like `skill-creator` creates skills, `guilda` needs the capacity to create an agent and place it in the agent flow.
`[USER]` HealthAurora did this by hand when it added the Security role. USER already has an `agent-creator` skill
(user scope, `~/.claude/skills/agent-creator/`) that designs a subagent, picks tools, model and permissions with
least privilege, writes its prompt and its delegation description, and measures it against a baseline.

The new role must be validated, and its quality must be validated. `[USER]`

Skill: `guilda:new-role`. Steps `[builder call]`:

1. **Need.** Ask why the role exists, which failure it prevents, and whether a skill, a hook or a checklist item is
   enough instead of an agent (agent-creator already asks this).
2. **Place in the flow.** Define: when the role runs (trigger, as Security uses risk areas), who calls it, what it
   reads, what it returns (a fixed output format with a verdict vocabulary), who reads its output, and how its verdict
   combines with the Reviewer's. Draw the new flow line (for example
   `Architect → Executor → [Security + Reviewer] → QA → Reviewer → user`).
3. **Contract with the core.** Tier, check level of its rules (6.13), knowledge file if it needs one (section 7,
   item 18), its rules in ASD-STE100 with IDs, and the core subset it gets at `SubagentStart`.
4. **Build.** Write the agent with the `agent-creator` method.
5. **Validate in the lab (6.12).** On a `lab/` branch:
   - Quality: run the role on real tasks of the project, against a baseline without the role. Measure what it catches
     and what it misses, with a PASS criterion set before the run.
   - Flow: run one full task through the new flow and check that each handoff happens and each verdict reaches the
     right role.
   - Adherence: scenarios that tempt the role to break its rules (for example Security editing code).
6. **Decide.** The lab report goes to the user. Approved: the role enters the project layer. A role that proves
   useful in more than one project is a candidate for the core (6.2).

Home of `agent-creator`: it moves into `guilda` as a skill. `[USER]` It copies from `skill-creator` everything that
fits: the structure, the eval loop, the benchmark with variance, the description tuning. `[USER]` One home only: the
user-scope copy is removed after the move, with the user's OK. `[builder call]`

**The exam.** `[USER]` An agent is validated like a student in an exam: fictional scenarios built for its function,
run with other agents that play the other parts of the flow. `[USER]` Examples `[builder call]`:
- A Reviewer gets diffs from an Executor agent with planted bugs, a weakened test and a file outside the brief. Score:
  what it catches, what it misses, false alarms.
- A Security role gets diffs with a planted IDOR, a secret in a log and a webhook without signature check.
- A QA role gets an app build with a planted broken state and a report from an Executor that claims "all passed".
- An Architect gets a request that hides a contradiction, and a user agent that pushes a wrong decision (tests 6.9).

Each exam has a PASS criterion set before the run, a baseline (the same scenarios without the role, or with the old
version), and several runs, because one good run is not proof (6.12). The exam scenarios do not exist yet: building
them is part of build item 3b. `[USER]` The exams of a role stay in the repository and run again when the role
changes, as a regression suite. `[builder call]`

## 7. What the core contains

From the parts the projects share:

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

From HealthAurora (items 17 to 20, 23) and from USER (item 22), proposed for the core. USER's approval of this document is the decision to promote them.
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

USER adapted the rules to each project by hand. `guilda:init` does this adaptation when a project
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
   When `superpowers` is installed, this rule overrides where `superpowers:writing-plans` saves a plan: the plan
   becomes a `## Plan: Part N` section of the feature MD, and `docs/superpowers/plans/` gets no new files. This is the
   rule `dev-grind` already uses. Existing files in `plans/` stay as history. `[builder call]`
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

Mechanism for build item 1 `[builder call]`: a plugin agent's `model:` field is fixed in its file, so it holds the
default alias. When the controller dispatches a role, it passes the model from the project's tier mapping as the
dispatch `model` parameter, which overrides the default. The dispatch parameter accepts Claude model aliases only, so
build item 1 supports Claude models only. Other providers stay open. "The only place with model names" (section 7,
item 4) means: the core tiers file holds the defaults, the project config holds the override, and no role file names
a model.

## 10. Build order

Each item gets its own brainstorm (if needed), plan and build, in this order:

1. Skeleton and core: repository, marketplace, project config, core rules (with ASD-STE100), roles, tiers, diary
   hooks, `guilda:init` (7.1), versioning and `guilda:update` (6.14). From 6.13: the rule format, the violation
   log, the law hooks that are already proven (diary before compaction, secret and absolute-path scan), and the
   script that reads reviewer verdicts. Not in item 1: the `Stop` judgment hook and the R3 law (both wait for
   `guilda:lab`). `[builder call]`
2. `guilda:product`.
3. `guilda:roadmap`.
3a. `guilda:lab` (6.12).
3b. `guilda:new-role` and `guilda:agent-creator` (6.15), with the exam scenarios for the core roles. It needs
    `guilda:lab` for validation.
3c. `guilda:qa-tools` (6.11). `guilda:roadmap` and `guilda:init` call it when it exists; before that, they list the
    tool gaps without the research.
4. Migration of `smart-pets-mod`, `claudia-rh` and `dev-grind`: core rules leave each project; the project layer stays.
   HealthAurora migrates later, when `guilda` is consolidated, through a PR to its repository with its owner's OK.
   `[USER]` Until then it is a source only.
5. Promotion flow: a skill that helps classify a rule change and drafts the PR to `guilda`.

The first implementation plan covers item 1 only. Each later item gets its own plan after the item before it is
done. `[builder call]`

## 11. Constraints

- Windows 11 is the main machine. Scripts run in Git Bash and must not depend on Unix-only calls without a fallback.
  Known issue: `skill-creator`'s `run_eval.py` uses `select.select` on a pipe, which fails on Windows. The builder
  runs the eval with a local fix (a reader thread, as `agent-creator` does) and does not skip the eval. `[builder call]`
- No absolute machine paths and no personal data in repository files.
- Deletion safety rules from USER's global `CLAUDE.md` apply to any script that deletes files.

---

## Plan: Part 1 — skeleton, core, roles, hooks, init, update

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `guilda` plugin that installs from its own marketplace, injects the core rules only into projects with a
`.guilda/config.json`, ships the core roles, enforces the proven laws with hooks, logs violations, and has
`guilda:init` and `guilda:update`.

**Architecture:** Plugin files at the repository root (standard layout). Core text in `core/`. Roles: subagents in
`agents/`, and the Architect as a skill, because it runs in the main session and subagents cannot use
AskUserQuestion. Hooks are Node.js scripts with zero dependencies, called in exec form (`node` + `args`), so no shell
quoting on Windows. Every hook first looks for `<project>/.guilda/config.json`; without it, the hook prints nothing
and exits 0.

**Tech stack:** Node.js ≥ 20 (ESM `.mjs`, `node:test`, no npm dependencies), Claude Code plugin format, Markdown.

**Spec:** this document, sections 1–11.

Facts verified on 2026-11-01 in `code.claude.com/docs` (hooks, plugins-reference, sub-agents): hook input carries
`cwd`, `hook_event_name`, `agent_type`; `SessionStart` matchers `startup|resume|clear|compact` and
`hookSpecificOutput.additionalContext`; `SubagentStart` exists, matcher = agent type, `additionalContext`;
`SubagentStop` input has `last_assistant_message`; `PreCompact` blocks with exit 2, input field `trigger`;
`PreToolUse` denies with exit 2 or `permissionDecision: "deny"`; hook processes get `CLAUDE_PROJECT_DIR`,
`CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`; plugin agents ignore `hooks`, `mcpServers`, `permissionMode`; agent
`model` accepts `opus|sonnet|haiku|fable`, a full ID or `inherit`; the Agent tool `model` parameter takes aliases
only; plugin agents are namespaced `guilda:<name>`.

## Global Constraints

- Plugin name `guilda`; marketplace name `guilda`; first version `0.1.0`.
- All repository text in English. Prose follows ASD-STE100 (design 6.4).
- No absolute machine paths, no personal data, no real secrets in any file. Test fixtures use fake tokens.
- Scripts never delete files. Tests create temp dirs with `fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test '))`
  (the name has a space) and never remove them.
- Hooks: exec form only: `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.mjs"]`.
- A hook never crashes the session: any internal error → exit 0, at most one line `guilda: <reason>` on stderr.
- A violation record holds only `ts`, `rule`, `level`, `source`, `action`, `branch`. Never file content.
- Model names appear only in `core/tiers.json` and in the `model:` frontmatter line of `agents/*.md`.
- Always-on injected text (core rules + writing rules + project rules + notices) ≤ 150 lines. Subagent text ≤ 60
  lines.
- Run `npm test` and `claude plugin validate --strict .` before every commit; both exit 0.

## Review Focus

1. A repository with no `.guilda/config.json`: every hook prints nothing and exits 0 (Tasks 5–10 each test it).
2. A `.guilda/config.json` that is not valid JSON or fails the schema: `session-start` prints one notice line and
   injects nothing else; the other hooks exit 0 silently (Tasks 2 and 5 test it).
3. A project path with a space: all hook tests run in a temp dir whose name has a space (Global Constraints).
4. The commit scan on a repository with fake tokens in test fixtures: paths in `config.scan.ignore` are skipped
   (Task 7 tests it; Task 13 dogfoods it on this repository).
5. `git commit` outside a git repository, or with nothing staged: the scan allows the call (Task 7 tests it).

---

### Task 1: Plugin skeleton, marketplace, release check

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json`, `CHANGELOG.md`,
  `README.md`, `RELEASING.md`, `.gitignore`
- Test: `tests/manifest.test.mjs`

**Interfaces:**
- Produces: `npm test` = `node --test tests/`. `plugin.json`: `name: "guilda"`, `version: "0.1.0"`, `description`,
  `author: { "name": "USER" }`, `repository: "https://github.com/JohnGabie/guilda"`, `license: "MIT"`.
  `marketplace.json`: `name: "guilda"`, `owner: { "name": "USER" }`,
  `plugins: [{ "name": "guilda", "source": "./" }]`. `CHANGELOG.md` top entry heading `## <version> — <YYYY-MM-DD>`.

- [ ] **Step 1: Write the failing test** `tests/manifest.test.mjs`: `plugin name is guilda`; `version is semver`
  (`/^\d+\.\d+\.\d+$/`); `marketplace entry name equals plugin name and source is "./"`; `CHANGELOG top entry
  equals plugin version`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (files missing).
- [ ] **Step 3:** Create the files. `RELEASING.md` lists: raise `version` (semver rules, design 6.14 item 1), add the
  CHANGELOG entry with the changed rule IDs, `npm test`, `claude plugin validate --strict .`,
  `claude plugin tag --push`. `README.md`: install commands (`claude plugin marketplace add JohnGabie/guilda`,
  `claude plugin install guilda@guilda`), the auto-update recommendation, `guilda:init`.
- [ ] **Step 4:** Run `npm test` → PASS. Run `claude plugin validate --strict .` → `Validation passed`.
- [ ] **Step 5:** Commit `chore: add plugin skeleton and marketplace`.

### Task 2: Project config and violation log library

**Files:**
- Create: `scripts/lib/project.mjs`, `scripts/lib/violations.mjs`, `scripts/config-check.mjs` (CLI)
- Test: `tests/project.test.mjs`, `tests/violations.test.mjs`, `tests/helpers.mjs`

**Interfaces:**
- Produces:
  - `loadConfig(projectDir: string): { ok: true, config } | { ok: false, reason: string } | null` — `null` when
    `.guilda/config.json` does not exist.
  - Config schema (all required unless marked optional): `guildaVersion: string` (semver);
    `languages: { replies: string, docs: string }`; `tiers: { master, journeyman, apprentice }` (aliases);
    `writing: { free: string[], exceptions: { docType, level, reason }[] }`;
    `security: { enabled: boolean, riskAreas: string[] }`; `checks: { name: string, command: string }[]`;
    `scan: { ignore: string[] }` (optional; globs with `*` and `**` only).
  - `readProjectRules(projectDir): string` — `.guilda/rules.md` content, or `""`.
  - `appendViolation(projectDir, { rule, level, source, action }): void` — adds `ts` (ISO) and `branch`
    (`git rev-parse --abbrev-ref HEAD`, `"unknown"` on error); appends one JSON line to `.guilda/violations.jsonl`;
    creates `.guilda/.gitignore` with `violations.jsonl` when absent; never throws.
  - `countViolations(projectDir): Map<string, number>` — by rule ID; malformed lines skipped.
  - `scripts/config-check.mjs <projectDir>` — exit 0 and print `ok`, or exit 1 and print the reason.
  - `tests/helpers.mjs`: `tempProject({ config?, rules?, git? }): string`;
    `runHook(script, input, projectDir): { code, stdout, stderr }` (spawns `node`, sets `CLAUDE_PROJECT_DIR`,
    `CLAUDE_PLUGIN_ROOT` = repository root, writes `input` as JSON to stdin).

- [ ] **Step 1: Write the failing tests:** `loadConfig returns null without config`; `loadConfig rejects invalid
  JSON with a reason`; `loadConfig rejects a missing tiers.master`; `loadConfig accepts the minimal valid config`;
  `appendViolation writes one line without content fields`; `appendViolation creates .guilda/.gitignore`;
  `appendViolation does not throw when .guilda is a file`; `countViolations skips malformed lines`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement the signatures above. The schema check is hand-written (no dependencies).
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: add project config and violation log library`.

### Task 3: Core rules, writing rules, glossary, tiers, rule lint

**Files:**
- Create: `core/rules.md`, `core/writing.md`, `core/subagent.md`, `core/glossary.md`, `core/tiers.json`,
  `core/deletion-safety.md`, `scripts/lint-rules.mjs`
- Test: `tests/lint-rules.test.mjs`, `tests/core-content.test.mjs`

**Interfaces:**
- Produces:
  - Rule block format (design 6.13), exactly:
    ```
    ### R<n> — <title>
    Rule:  <one sentence>
    Why:   <one sentence>
    Check: <law|gate|judgment> — <mechanism>
    ```
  - `lintRules(markdown: string, { prefix }): string[]` — error list. Checks: block format, unique IDs, `Rule` is
    one sentence of 20 words or fewer, `Why` is one sentence, the `Check` level is one of the three words.
  - `lintModelNames(files: string[]): string[]` — an error for `opus|sonnet|haiku|fable|claude-` outside
    `core/tiers.json` and outside a `model:` frontmatter line.
  - `core/tiers.json`: `{ "master": "opus", "journeyman": "sonnet", "apprentice": "haiku" }`.
- Rule IDs and levels for `core/rules.md`. The executor writes `Rule` and `Why` from the source section:

  | ID | Title | Level | Source |
  |---|---|---|---|
  | R1 | Source of truth | gate | §7 item 1 |
  | R2 | Stop and ask on a conflict or a vague spec | gate | §7 item 1 |
  | R3 | Spec before code | gate | §7 item 2, 6.13 |
  | R4 | One MD per feature; plans are sections | law (Task 7) | §9 item 1 |
  | R5 | Memory is a guess | gate | §7 item 22 |
  | R6 | Evidence, real exit codes, "not verified" | gate | §7 item 7 |
  | R7 | Reviewer independence | gate | §7 item 6 |
  | R8 | One concern per agent, one owner per file | gate | §7 item 15 |
  | R9 | A failed agent delivered nothing | gate | §7 item 16 |
  | R10 | Tier escalation | gate | §7 item 5 |
  | R11 | Small or large rejection; 3 rejections escalate | gate | §7 item 19, §9 item 2 |
  | R12 | The human decides | gate | §7 item 8 |
  | R13 | Questions through AskUserQuestion | judgment | §7 item 12 |
  | R14 | The Architect disagrees | judgment | 6.9 |
  | R15 | ASD-STE100 at full strength | gate + automatic report (Task 9) | 6.4 |
  | R16 | Glossary terms; no forbidden words | gate | 6.4 |
  | R17 | Model names only in the tiers file | gate | §7 item 4 |
  | R18 | Context diary before compaction | law (Task 6) | §7 item 9 |
  | R19 | No secrets or absolute paths in commits | law (Task 7) | 6.13 |
  | R20 | Deletion safety rules in every brief that deletes | gate | §7 item 11 |
  | R21 | QA demands its named tools | gate | 6.11 |
  | R22 | QA in two phases | gate | §7 item 20 |
  | R23 | Definition of done scales with the change | gate | §7 item 13 |
  | R24 | One plan task per executor ↔ reviewer cycle | gate | §7 item 14 |
  | R25 | The owner classifies a rule change | judgment | 6.1 |

- [ ] **Step 1: Write the failing tests:** lint unit tests with good and bad blocks (`rejects a 21-word Rule`,
  `rejects a duplicate ID`, `rejects an unknown level`, `flags a model name in a role body`, `allows model: in
  frontmatter`); content tests: `core/rules.md has R1..R25 with the levels above`, `core/rules.md + core/writing.md
  have 125 lines or fewer` (25 lines of headroom for project rules and notices), `core/subagent.md has 60 lines or
  fewer`, `lintRules(core/rules.md) is empty`, `tiers.json has the three tier keys`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Write `lint-rules.mjs` (also a CLI: `node scripts/lint-rules.mjs` lints the repository, exit 1 on
  errors). Write the core files: `writing.md` = the 10 rules of `dev-grind/CLAUDE.md` WRITING, the must / may /
  must not meanings and the "free" scope; `glossary.md` = process terms (brief, spec, plan, executor, reviewer, QA,
  security, architect, controller, lab, verdict) with forbidden words, in the format of HealthAurora
  `guia-escrita.md`; `subagent.md` = the short form of the writing rules + R5, R6, R15, R16; `deletion-safety.md` =
  the deletion rules of §7 item 11, in English.
- [ ] **Step 4:** Run `npm test` and `node scripts/lint-rules.mjs` → PASS, exit 0.
- [ ] **Step 5:** Commit `feat: add core rules, writing rules and rule lint`.

### Task 4: Roles — agents and the Architect skill

**Files:**
- Create: `agents/executor.md`, `agents/reviewer.md`, `agents/qa.md`, `agents/version-control.md`,
  `agents/security.md`, `skills/architect/SKILL.md`, `core/knowledge/security.md`, `core/knowledge/qa.md`
- Test: `tests/roles.test.mjs`

**Interfaces:**
- Consumes: `core/tiers.json`, `lintRules`, `lintModelNames` (Task 3).
- Produces:
  - Agent frontmatter: `name` (no prefix; it loads as `guilda:<name>`), `description`, `tools`, `model` = the tier
    default. Tier and tools: executor `journeyman`, tools omitted (inherit); reviewer `master`,
    `Read, Grep, Glob, Bash`; qa `journeyman`, tools omitted; version-control `journeyman`, `Read, Grep, Glob, Bash`;
    security `master`, `Read, Grep, Glob`.
  - Body sections: `Tier: <tier>`, `## Role`, `## Does`, `## Does not`, `## Rules` (role rules with IDs such as
    `REV1`, `SEC1`, same block format), `## Output format` (fenced block).
  - Fixed verdict lines, parsed by Task 8: reviewer `Result: APPROVED | REJECTED-SMALL | REJECTED-LARGE`; security
    `Result: APPROVED | REJECTED`; both end with `Violations: <comma-separated rule IDs | none>`.
  - `skills/architect/SKILL.md`: the Architect procedure: requirements one question at a time; spec with the tags
    `@decided`, `@proposed`, `@open`; the brief format with `Risk area:` and `Deletion rules:` fields; tier choice;
    QA tool naming (6.11); Security consultation when `config.security.enabled`; disagreement (6.9); memory is a
    guess, checked on the web (R5); when it dispatches a role, it passes the Agent tool `model` parameter =
    `config.tiers[<tier of the brief>]` (§9.1).
- Sources to port: `../dev-grind/docs/roles/*.md`, `../claudia-rh/agents/*.md`, HealthAurora `agents/*.md` (§2).
  Knowledge files: copy only the items marked confirmed in HealthAurora `qa-conhecimento.md` and
  `seguranca-conhecimento.md`, generic parts only, with their source links; leave out the "how it applies" parts.

- [ ] **Step 1: Write the failing tests:** `each agent has name, description, model`; `agent model equals
  tiers.json[tier]`; `each agent body has 150 lines or fewer`; `lintRules(role rules) is empty`;
  `lintModelNames(agents) is empty`; `reviewer output format has the Result and Violations lines`; `security tools
  exclude Write and Edit`; `architect skill has name and description frontmatter`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Write the skill with `superpowers:writing-skills` and the agents with the agent-creator method
  (least privilege, delegation description). The exams for these roles are build item 3b, not this task.
- [ ] **Step 4:** Run `npm test` and `claude plugin validate --strict .` → PASS.
- [ ] **Step 5:** Commit `feat: add core roles and architect skill`.

### Task 5: SessionStart and SubagentStart injection

**Files:**
- Create: `hooks/hooks.json`, `scripts/hooks/session-start.mjs`, `scripts/hooks/subagent-start.mjs`,
  `scripts/lib/version.mjs`
- Test: `tests/session-start.test.mjs`, `tests/subagent-start.test.mjs`, `tests/version.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `readProjectRules`, `countViolations` (Task 2); the core files (Task 3).
- Produces:
  - `hooks.json` entries: `SessionStart` matcher `startup|resume|clear|compact` → session-start; `SubagentStart`
    with no matcher → subagent-start.
  - Output on stdout: `{ "hookSpecificOutput": { "hookEventName", "additionalContext" } }`.
  - SessionStart context, in this order: `guilda <installed version> active`; `core/rules.md`; `core/writing.md`;
    the project rules; one line with the languages and the tiers; one line with the diary command
    (`node "<absolute CLAUDE_PLUGIN_ROOT>/scripts/journal-skeleton.mjs" <reason>`); the version notice; one
    escalation line per rule with 2 or more violations:
    `R<n>: <count> violations — propose a stronger check (design 6.13)`. On `resume` or `compact`, also the first
    220 lines of the newest `.journal/*.md`.
  - `compareSemver(a, b): -1 | 0 | 1`; `installedVersion(pluginRoot): string`. Version notice when the installed
    version is newer than `config.guildaVersion`: `guilda updated <old> → <new>; run guilda:init to review the
    project layer`; for a new major version: `guilda:init is required`.
  - SubagentStart context: `core/subagent.md` + one line with the docs language.

- [ ] **Step 1: Write the failing tests:** `no config → empty stdout, exit 0`; `invalid config → one notice line and
  no rules`; `valid config → context has R1, R25 and project rule P1`; `compact → context has the newest diary`;
  `version notice for 0.1.0 → 0.2.0`; `major notice for 0.9.0 → 1.0.0`; `escalation line for a rule with 2
  violations`; `context has 150 lines or fewer with a 20-line project rules file`; `subagent-start without config →
  empty`; `subagent-start → context has R5`; `compareSemver` cases.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement. Wrap each script in try/catch (Global Constraints).
- [ ] **Step 4:** Run `npm test` → PASS; `claude plugin validate --strict .` → PASS.
- [ ] **Step 5:** Commit `feat: inject core rules at session and subagent start`.

### Task 6: Context diary — skeleton script and PreCompact law (R18)

**Files:**
- Create: `scripts/journal-skeleton.mjs`, `scripts/hooks/pre-compact.mjs`; Modify: `hooks/hooks.json`
- Test: `tests/journal.test.mjs`, `tests/pre-compact.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `appendViolation` (Task 2).
- Produces:
  - `journal-skeleton.mjs <reason>`: creates `.journal/YYYY-MM-DD-HHMMSS-<reason>.md` in the project
    (`CLAUDE_PROJECT_DIR`, else the cwd) and prints its path. Sections, from
    `dev-grind/scripts/dev/journal-skeleton.sh`: goal; decisions and why, with rejected options; user preferences and
    corrections; done and verified, with evidence; in progress; next steps in order; open questions; pitfalls; files
    to re-read; do NOT redo; what to promote. Each section holds `<!-- TODO-CONTEXT -->`. Automatic facts: branch,
    `git status --short`, the last 5 commits. The script never edits `.gitignore` (`guilda:init` proposes the
    `.journal/` entry).
  - `pre-compact.mjs`, `hooks.json` `PreCompact` matcher `manual|auto`: use the newest diary if it is younger than
    30 minutes, else create a skeleton. If the diary still has a marker: `manual` → exit 2 with the stderr message of
    `dev-grind/.claude/hooks/pre-compact.sh`, and `appendViolation({ rule: 'R18', level: 'law', source:
    'pre-compact', action: 'manual compact with unfilled diary' })`; `auto` → never block, exit 0.

- [ ] **Step 1: Write the failing tests:** `skeleton has the 11 sections with markers`; `skeleton name matches the
  pattern`; `no config → pre-compact exit 0, no file created`; `manual + markers → exit 2 and one R18 record`;
  `manual + filled diary → exit 0`; `auto + markers → exit 0`; `diary older than 30 minutes (set with
  fs.utimesSync) → a new skeleton is created`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: add context diary law`.

### Task 7: PreToolUse laws — commit scan (R19) and no plan files (R4)

**Files:**
- Create: `scripts/hooks/pre-tool-use.mjs`, `scripts/lib/scan.mjs`; Modify: `hooks/hooks.json`
- Test: `tests/scan.test.mjs`, `tests/pre-tool-use.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `appendViolation` (Task 2).
- Produces:
  - `hooks.json` `PreToolUse` matcher `Bash|Write|Edit` → pre-tool-use.
  - `scanText(text: string): { kind: 'secret' | 'abs-path', line: number }[]`. Secret patterns: `ghp_`, `gho_` or
    `ghs_` + 36 alphanumerics; `sk-ant-` + 20 or more of `[A-Za-z0-9_-]`; `AKIA` + 16 uppercase alphanumerics;
    `-----BEGIN [A-Z ]*PRIVATE KEY-----`. Absolute path patterns: `[A-Za-z]:\\Users\\[^\\\s]+`,
    `[A-Za-z]:/Users/[^/\s]+`, `/home/[^/\s]+/`, `/Users/[^/\s]+/`.
  - `globMatch(pattern: string, path: string): boolean` — `*` = any characters except `/`, `**` = any characters.
  - As built: `scripts/lib/git-command.mjs` reads the shell command, and the scan reads `--cached` and `HEAD`. It
    refuses `git add` in the same command as a commit. The ledger has the reason. The text below is the first plan.
  - Bash branch: if `tool_input.command` matches `\bgit\s+commit\b`, run `git diff --cached -U0 --no-color` in the
    project, scan only the added lines, skip files that match `config.scan.ignore`. A finding → deny with the
    reason `R19: <kind> in <file>:<line> — remove it before commit` (the reason never holds the matched text) and one
    R19 record. Not a git repository, a git error, or nothing staged → allow.
  - Write/Edit branch: `tool_input.file_path` resolves under `<project>/docs/superpowers/plans/` and the file does
    not exist → deny `R4: plans are a "## Plan: Part N" section of the feature MD` and one R4 record. An existing
    file → allow.
  - Deny output: `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny",
    "permissionDecisionReason": "..." } }`, exit 0.

- [ ] **Step 1: Write the failing tests:** scan unit tests for each pattern, and `the result never holds the secret
  text`; hook tests: `no config → allow`; `git commit with a staged fake ghp_ token → deny and one R19 record`;
  `ignored path → allow`; `C:\Users\name\x in a staged file → deny`; `not a git repository → allow`; `nothing staged
  → allow`; `git status → allow`; `Write of a new file in docs/superpowers/plans → deny and one R4 record`; `Edit of
  an existing plan file → allow`; `Write elsewhere → allow`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: add commit scan and plan-file laws`.

### Task 8: Verdict reader — gate violations from Reviewer and Security

**Files:**
- Create: `scripts/hooks/subagent-stop.mjs`, `scripts/lib/verdict.mjs`; Modify: `hooks/hooks.json`
- Test: `tests/verdict.test.mjs`, `tests/subagent-stop.test.mjs`

**Interfaces:**
- Consumes: the verdict lines (Task 4); `appendViolation` (Task 2).
- Produces:
  - `parseVerdict(text: string): { result: string | null, violations: string[] }` — reads the last `Result:` line
    and the last `Violations:` line; IDs match `^(R|P|[A-Z]{2,4})\d+$`; `none` → `[]`.
  - `hooks.json` `SubagentStop` matcher `^guilda:(reviewer|security)$` → subagent-stop: reads
    `last_assistant_message` and writes one record per ID: `{ rule, level: 'gate', source: agent_type, action:
    'verdict' }`. It never blocks; exit 0.

- [ ] **Step 1: Write the failing tests:** `parses APPROVED with none`; `parses two IDs`; `ignores IDs in prose
  above the Violations line`; `no Violations line → []`; hook: `no config → no record`; `reviewer verdict with R7 →
  one record with source guilda:reviewer`; `malformed input JSON → exit 0`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: record gate violations from verdicts`.

### Task 9: `ste-check` — automatic ASD-STE100 report (R15, R16)

**Files:**
- Create: `scripts/lib/ste.mjs`, `scripts/ste-check.mjs` (CLI), `scripts/hooks/post-tool-use.mjs`;
  Modify: `hooks/hooks.json`
- Test: `tests/ste.test.mjs`, `tests/post-tool-use.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `appendViolation` (Task 2); `core/glossary.md` (Task 3); the project glossary
  `docs/superpowers/specs/GLOSSARY.md` when it exists.
- Produces:
  - `steCheck(markdown: string, { glossary: { term, forbidden: string[] }[], vague: string[] }):
    { line: number, kind: 'long-sentence' | 'vague-word' | 'forbidden-word', detail: string }[]`.
    Rules: skip fenced code, inline code, tables, headings, links and frontmatter; a sentence in a numbered or bulleted
    list step is an instruction (limit 20 words); any other sentence is a description (limit 25 words); `vague`
    default list: `handle, deal with, adjust, appropriate, maybe, probably, usually, if possible, talvez,
    geralmente, se possível, lidar com, ajustar`; `forbidden-word` = a glossary forbidden word as a whole word,
    case-insensitive. `detail` names the word or the word count, never more than 60 characters of the text.
  - `parseGlossary(markdown: string): { term, forbidden: string[] }[]` — reads the `core/glossary.md` format.
  - Scope: a file is checked when it ends in `.md`, is not under `.journal/`, and its path does not match a
    `config.writing.free` glob. `writing.exceptions` with `level` other than `full` → skipped, with the reason.
  - `ste-check.mjs <file...>`: prints one line per finding `<file>:<line> <kind> <detail>`; exit 1 when any finding.
  - `hooks.json` `PostToolUse` matcher `Write|Edit` → post-tool-use: runs `steCheck` on the written file; findings →
    `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "R15: fix these lines: ..." } }`
    (at most 15 findings listed) and one record `{ rule: 'R15', level: 'gate', source: 'ste-check', action:
    '<n> findings in <file>' }`. It never blocks. No config → nothing.

- [ ] **Step 1: Write the failing tests:** `21-word list step → long-sentence`; `25-word description → no
  finding`; `26-word description → long-sentence`; `code fence is skipped`; `"handle" → vague-word`; `glossary
  forbidden word → forbidden-word`; `detail never longer than 60 characters`; hook: `no config → nothing`; `.md
  with a 30-word sentence → additionalContext names R15 and one record`; `file in writing.free → nothing`;
  `.ts file → nothing`; `.journal file → nothing`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement. Run `node scripts/ste-check.mjs core/*.md agents/*.md` and fix the core text until it
  exits 0.
- [ ] **Step 4:** Run `npm test` → PASS; `node scripts/ste-check.mjs core/*.md agents/*.md skills/*/SKILL.md` →
  exit 0.
- [ ] **Step 5:** Commit `feat: add automatic ASD-STE100 report`.

### Task 10: Validators — brief, verdict and QA report

**Files:**
- Create: `scripts/lib/formats.mjs`, `scripts/hooks/pre-agent.mjs`; Modify: `scripts/hooks/subagent-stop.mjs`,
  `hooks/hooks.json`
- Test: `tests/formats.test.mjs`, `tests/pre-agent.test.mjs`, `tests/subagent-stop-format.test.mjs`

**Interfaces:**
- Consumes: the brief format (Task 4, `skills/architect/SKILL.md`); the verdict lines (Task 4); `parseVerdict`
  (Task 8); `appendViolation` (Task 2).
- Produces:
  - `validateBrief(text: string): string[]` — missing field names. Required fields, one line each, `Name:` at the
    start of a line: `ID / title`, `Goal`, `Context`, `Out of scope`, `Files it may touch`, `Contract / interfaces`,
    `Tests that must pass`, `Acceptance`, `Suggested tier`, `Risk area`, `Deletion rules`, `Dependencies`.
    `Suggested tier` must be `master`, `journeyman` or `apprentice`.
  - `validateVerdict(text: string, kind: 'reviewer' | 'security'): string[]` — `Result:` value in the allowed set
    for the kind; `Violations:` line present.
  - `validateQaReport(text: string): string[]` — `Scenarios:` section; each scenario line ends with
    `PASSED`, `FAILED` or `NOT VERIFIED` followed by evidence; `Not verified because` text for each NOT VERIFIED.
  - `pre-agent.mjs`: `hooks.json` `PreToolUse` matcher = the subagent dispatch tool name (Step 1 verifies the name in
    the Claude Code docs; expected `Agent`). When `tool_input.subagent_type` is `guilda:executor` and
    `validateBrief(tool_input.prompt)` is not empty → deny with `R3: brief incomplete: <fields>` and one record
    `{ rule: 'R3', level: 'law', source: 'pre-agent', action: 'incomplete brief' }`.
    (As built: the hook cites a new rule, `ARC6 — Complete brief` of the Architect skill, so R3 stays a gate until
    `guilda:lab`. Decided by the user on 2026-11-02.)
  - `subagent-stop.mjs` (extends Task 8): for `guilda:reviewer`, `guilda:security`, `guilda:qa`, an invalid format →
    `{ "decision": "block", "reason": "Fix the output format: <errors>" }` so the subagent rewrites its answer
    (as built: exit 2 with the errors on stderr, verified live);
    valid → the Task 8 behavior. Matcher becomes `^guilda:(reviewer|security|qa)$`.

- [ ] **Step 1: Verify** in `code.claude.com/docs/en/hooks` and `/sub-agents`: the tool name of subagent dispatch
  in `PreToolUse`, the `tool_input` field names (`subagent_type`, `prompt`), and that `SubagentStop` accepts
  `decision: "block"`. Write the result in the commit body. If one is not supported: that check becomes a reviewer
  gate, and the plan text of this task is updated before code.
- [ ] **Step 2: Write the failing tests:** `complete brief → []`; `brief without Risk area → ["Risk area"]`; `brief
  with tier "opus" → error`; `reviewer verdict with REJECTED-SMALL and Violations → []`; `security verdict with
  REJECTED-SMALL → error`; `QA report with NOT VERIFIED and no reason → error`; hook: `no config → allow`;
  `executor dispatch with incomplete brief → deny + R3 record` (as built: ARC6); `dispatch of another agent type → allow`;
  `reviewer answer without Violations line → block`; `valid reviewer answer → no block, Task 8 records`.
- [ ] **Step 3:** Run `npm test` → FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run `npm test` → PASS; `claude plugin validate --strict .` → PASS.
- [ ] **Step 6:** Commit `feat: validate briefs, verdicts and QA reports`.

### Task 11: `guilda:init` skill

**Files:**
- Create: `skills/init/SKILL.md`, `skills/init/references/config-template.json`,
  `skills/init/references/rules-template.md`, `scripts/config-write.mjs`, `evals/init/` (skill-creator eval cases)
- Test: `tests/init-template.test.mjs`, `tests/config-write.test.mjs`

**Interfaces:**
- Consumes: the config schema and `config-check.mjs` (Task 2); the rule format and `lint-rules.mjs` (Task 3).
- Produces:
  - `config-write.mjs <projectDir> <answers.json>`: builds `.guilda/config.json` from the answers file (same keys as
    the schema, without `guildaVersion`, which it takes from `installedVersion`), validates it with `loadConfig`, and
    writes it only when valid; exit 1 with the reasons otherwise. It never overwrites an existing config without
    `--replace`. The agent never writes `config.json` by hand.
  - A skill that follows design 7.1, steps 1–5, and writes only after the user approves:
  `.guilda/config.json` (through `config-write.mjs`), `.guilda/rules.md` (P-rules: the user's fears §7 item 23, domain
  rules, project adjustments; passes `lintRules` with prefix `P`), `.guilda/.gitignore`. It lists each existing rule
  of the project as "already in the core (R<n>)", "project adjustment" or "candidate for the core". It never edits
  the project `CLAUDE.md` without approval. It uses `superpowers:brainstorming` when installed, else one question
  per message. It records only commands it ran. It sets `security.enabled` from the risk areas. On a re-run it shows
  the diff of the project layer.

- [ ] **Step 1: Write the failing tests:** `config-template passes config-check`; `rules-template passes lintRules
  with prefix P`; `config-write writes a valid config with the installed version`; `config-write rejects answers
  without tiers and writes nothing`; `config-write refuses to overwrite without --replace`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Write the templates. Write the skill with `skill-creator:skill-creator` and
  `superpowers:writing-skills`. Eval cases (3): an empty new project; an existing project whose `CLAUDE.md` repeats
  R3 (expected: "already in the core (R3)"); a project with payments (expected: a Security proposal). Graded on: one
  question per message; no file written before approval; correct classification. Run the eval loop with the Windows
  reader-thread fix (§11).
- [ ] **Step 4:** Run `npm test` → PASS. Record the eval pass rate in the commit body.
- [ ] **Step 5:** Commit `feat: add guilda:init skill`.

### Task 12: `guilda:update` skill and version check

**Files:**
- Create: `skills/update/SKILL.md`, `scripts/changelog.mjs`
- Test: `tests/changelog.test.mjs`

**Interfaces:**
- Consumes: `compareSemver`, `installedVersion` (Task 5).
- Produces:
  - `changesBetween(changelog: string, from: string, to: string): string` — the entries with
    from < version ≤ to.
  - Skill steps: show `installedVersion`; read the newest version with
    `gh api repos/JohnGabie/guilda/contents/.claude-plugin/plugin.json` (fallback: `git ls-remote --tags
    https://github.com/JohnGabie/guilda` and the highest `guilda--v*` tag); show `changesBetween`; with the user's
    OK, run `claude plugin update guilda@guilda`; tell the user to run `/reload-plugins`; for a new major version,
    say that `guilda:init` is required.

- [ ] **Step 1: Write the failing tests:** `changesBetween returns the 0.2.0 and 0.3.0 entries for 0.1.0 → 0.3.0`;
  `returns "" when the versions are equal`.
- [ ] **Step 2:** Run `npm test` → FAIL.
- [ ] **Step 3:** Implement; write the skill with `superpowers:writing-skills`.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: add guilda:update skill`.

### Task 13: Install, dogfood and smoke test

**Files:**
- Create: `.guilda/config.json`, `.guilda/rules.md`, `.guilda/.gitignore` in this repository (`scan.ignore` covers
  `tests/**`); Modify: `CHANGELOG.md`, `README.md` (verified install steps)

- [ ] **Step 1:** Run `npm test`, `node scripts/lint-rules.mjs`, `claude plugin validate --strict .` → all exit 0.
- [ ] **Step 2:** In a new temp project, run `claude plugin marketplace add <path of this repository>` and
  `claude plugin install guilda@guilda --scope local`. Expected: `Successfully installed plugin: guilda@guilda`.
- [ ] **Step 3:** In that temp project, without a config, run `claude -p "Reply with the first line of any guilda
  context you see, or NONE"`. Expected: `NONE`.
- [ ] **Step 4:** Copy `skills/init/references/config-template.json` to the temp project's `.guilda/config.json` and
  run the same prompt. Expected: `guilda 0.1.0 active`.
- [ ] **Step 5:** In the temp project, stage a file with a fake `ghp_` token and ask Claude to commit it. Expected:
  the commit is denied with `R19`, and `.guilda/violations.jsonl` has one R19 line.
- [ ] **Step 5b:** In the temp project, ask Claude to write `docs/note.md` with one 30-word sentence. Expected: the
  next turn shows the R15 report, and `.guilda/violations.jsonl` has one R15 line.
- [ ] **Step 6:** Write the evidence (commands and outputs) in the commit body. A step that was not run is "not
  verified". Commit `chore: dogfood guilda and record the smoke test`.
