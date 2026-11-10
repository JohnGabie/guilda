# D40 research: rule changes without a manual `guilda:init` re-run

Repo read: `wt-feat02` at `dcea009` (feat/0.2). Web sources fetched 2026-11-10. "Verified" means I read the claim on
the cited page. "Not verified" is marked.

## 1. Root cause in guilda (what in the project layer depends on a rule)

The project layer copies **no core rule text**. `scripts/hooks/session-start.mjs` reads `core/rules.md` and
`core/writing.md` from the installed plugin each session. `.guilda/config.json` holds no rule text. `init` forbids
copying a core rule into a P-rule. So an in-place rewrite of R24, R11 or R13 reaches every project on the next
session start with no init.

The forced re-run has three real causes:

1. **The version stamp moves only through init.** `config.guildaVersion` is written only by `config-write.mjs`.
   `versionNotice()` prints "run guilda:init to review the project layer" for *any* newer version (patch included),
   and "guilda:init is required" for a newer major. The notice stays until someone re-runs init. The re-run is a
   version-stamp ritual, not a data need.
2. **A new rule meaning that needs a value only the project has.** New R24/R11 depend on a new config field
   `process` (`light`/`full`). The 0.2.0 spec S1 says "No default exists". A 0.1.0 config has no `process`. If
   `checkSchema` makes it required, every old config becomes invalid. Then `pre-tool-use.mjs:122`
   (`if (!loaded || !loaded.ok) return 0;`) turns the laws off (the fail-open that D40 already found).
3. **ID references in the project layer.** P-rules ("project adjustment" of a core rule), a CLAUDE.md that dropped
   its own rules as "already in the core (R<n>)", and `.guilda/violations.jsonl` keyed by rule ID cite core IDs. An
   in-place meaning change can silently change what such a reference means. The new IDs of D40 would break those
   references instead (violation counts split, `R24` in a P-rule points to a deprecated rule).

Key fact: the 0.1.0 texts of R24 ("each plan task its own Executor ↔ Reviewer cycle") and R11 ("rejections of each
task") are exactly the new texts at `full`. So `process` missing → `full` keeps the 0.1.0 meaning with no loss. R13's
change (plain words, context) needs no project data.

## 2. Patterns in mature tools

| Tool | Mechanism | Source |
|---|---|---|
| ESLint (rules) | A deprecated rule keeps working. `meta.deprecated` is a `DeprecatedInfo` object: `message`, `url`, `replacedBy[]` (`{plugin, rule}`), `deprecatedSince`, `availableUntil` (`null` = kept, frozen). Old `meta.replacedBy` is deprecated. Policy: "Rules will never be removed from ESLint unless" replaced by a core rule or an equivalent plugin rule. | https://eslint.org/docs/latest/extend/rule-deprecation · https://eslint.org/docs/latest/use/rule-deprecation · https://eslint.org/docs/latest/extend/custom-rules |
| ESLint (semver) | A rule's behavior **does change in place**: "A bug fix that results in ESLint reporting more linting errors" is a **minor** release; a new option that reports more errors by default is **major**; deprecating a rule is minor. No new rule name for a stricter behavior. | https://github.com/eslint/eslint/blob/main/README.md (Semantic Versioning Policy) |
| ESLint (shareable configs) | Consumers include a config **by reference** (`extends: [myconfig]`) and override single rules after it. No copy, so an update reaches them by `npm update`. | https://eslint.org/docs/latest/extend/shareable-configs |
| ESLint (flat config) | Format change with a bridge: `FlatCompat` reads old eslintrc configs; `npx @eslint/migrate-config` writes "a starting point" (manual review). v8 opt-in by `ESLINT_USE_FLAT_CONFIG`; default in v9. How long eslintrc kept working: not on the page. | https://eslint.org/docs/latest/use/configure/migration-guide |
| Angular `ng update` | The library's `package.json` has `"ng-update": {"migrations": ...}`. Each migration has a `version`. The CLI runs every migration between the installed and target version ("5 → 7 runs 6, 6.2, 6.3, 7"). `--migrate-only --from --to` re-runs a range. | https://github.com/angular/angular-cli/blob/main/docs/specifications/update.md · https://angular.dev/cli/update |
| Nx `nx migrate` | `"nx-migrations"` in `package.json` → `migrations.json` entries with `version`; applied when the user moves past that version. Two steps: write `migrations.json`, then `--run-migrations` (can be edited and run "many times"); `--excludeAppliedMigrations`. Idempotency: not stated on the pages read. | https://nx.dev/docs/reference/nx-commands#nx-migrate · https://nx.dev/docs/kb/migration-generators |
| Next.js codemods | `npx @next/codemod upgrade [revision]` updates Next.js "automatically running codemods"; non-interactive in CI or an AI agent (stdin not a TTY). Codemods that cannot decide leave an `@next-codemod-error` marker and the build fails until a person fixes it. | https://nextjs.org/docs/app/guides/upgrading/codemods |
| Renovate | "Config migration works by migrating legacy config internally, before the config is used." Old configs keep working; a debug log line is the only sign. Rewriting the file is an opt-in PR (`configMigration`, default `false`, experimental). `migrateConfig()` returns `{isMigrated, migratedConfig}` and re-runs itself until nothing changes (a fixed point, so idempotent by construction). | https://docs.renovatebot.com/config-migration/ · https://docs.renovatebot.com/configuration-options/ · https://raw.githubusercontent.com/renovatebot/renovate/main/lib/config/migration.ts |
| Terraform providers | Schema has an integer `Version` stored in state. If stored ≠ current, Terraform asks the provider to upgrade the state **before planning**, automatically. `UpgradeState` is a map from each prior version to an upgrader that goes **directly to the current** version. Missing upgrader → error; any error keeps the prior state. | https://developer.hashicorp.com/terraform/plugin/framework/resources/state-upgrade |
| Kubernetes | Rule #1: an element "can not be removed from that version or have its behavior significantly changed" — a change needs a new API version. Rule #2: objects must round-trip between versions without information loss. GA behaviors work ≥1 year after deprecation (Rule #7); deprecated CLI elements and feature gates must warn when used (#6, #10). Old persisted data stays decodable. | https://kubernetes.io/docs/reference/using-api/deprecation-policy/ |
| OPA / Rego 1.0 | Language change with a per-unit version marker: bundles carry `rego_version` in the manifest, which wins over flags; `import rego.v1` or `--v0-compatible` for mixing; `opa check --v0-v1` then `opa fmt --write --v0-v1` rewrites code. | https://www.openpolicyagent.org/docs/v0-upgrade |
| Semgrep registry | Release notes list "Deprecated rules" that "no longer produce findings". **Not verified:** a documented ID/rename or `replacedBy` policy; I found none on official pages. | https://docs.semgrep.dev/release-notes/rule-updates |
| Rails migrations | `schema_migrations` stores the version (timestamp) of each applied migration; `db:migrate` runs only migrations "that have not yet been run". Idempotency comes from the ledger, not from each step. | https://guides.rubyonrails.org/active_record_migrations.html |
| Tolerant Reader | "be as tolerant as possible when reading data from a service": take only what you need, ignore the rest. | https://martinfowler.com/bliki/TolerantReader.html |
| Claude Code plugins | No install/update lifecycle hook: the 33 hook events have no PluginInstall/Update; `Setup` fires only with `--init-only`/`--init`/`--maintenance`. Auto-update runs in the background (off by default for third-party marketplaces); the session keeps the old version until `/reload-plugins` or next launch. `${CLAUDE_PLUGIN_DATA}` persists across updates; `${CLAUDE_PLUGIN_ROOT}` changes per version. `SessionStart` (startup/resume/clear/compact/fork) can run a command hook that writes files and return `additionalContext`. Dependencies take semver ranges resolved by `<name>--v<version>` tags. No minimum Claude Code version field in the manifest table (answers D40 `@open`: check features, not version). | https://code.claude.com/docs/en/hooks.md · https://code.claude.com/docs/en/plugins/loading.md · https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/plugins/dependencies.md |

Not verified: the Kubernetes `Warning: 299` response header (the blog page was truncated; known from memory only).
The hooks page was read only to 100k of 292k characters; the "no install event" claim comes from the full event list.

### What the evidence says about "new ID vs in-place"

- New identity for a changed meaning is the **API/data contract** practice (Kubernetes Rule #1, Rego v1). It
  protects *consumers that store or call the old element*.
- For **rules/policies consumed by reference**, the practice is in-place change under semver (ESLint: stricter
  behavior = minor) plus deprecation metadata **only when a rule is retired or replaced** (ESLint
  `DeprecatedInfo`, Semgrep "no longer produce findings").
- Every tool that avoids manual steps does it with **(a)** reference, not copy (ESLint `extends`), and **(b)** a
  machine-run migration keyed by a version marker and a ledger (Angular, Nx, Terraform, Rails, Renovate), with
  **(c)** an internal tolerant read so old data works even before the file is rewritten (Renovate, Terraform,
  Kubernetes round-trip). A person is asked only where a value cannot be derived (Next.js `@next-codemod-error`).

So: **once the project layer never copies rule text, the in-place rewrite is fine.** New IDs buy nothing for
guilda's consumers (an LLM session that gets the current text each session) and cost broken references.

## 3. Options for 0.2.0

### A. In-place rewrite + tolerant reader + automatic migration in the SessionStart hook (recommended)

- Keep R24/R11/R13 in place, as approved.
- `loadConfig` reads `process` missing as `full` (0.1.0 meaning, no loss; Kubernetes round-trip). The S1 rule
  "no default" stays for a *new* init only.
- Add `schemaVersion` to `config.json`. A `scripts/migrate.mjs` holds ordered, pure, idempotent steps keyed by
  schema version (Terraform map / Angular range); it re-runs to a fixed point (Renovate). The SessionStart hook runs
  it, writes the file only if it changed, then updates `guildaVersion` itself. Decouple the notice: no "run
  guilda:init" for minor/patch; print "guilda updated X → Y" once, with the changed rule IDs from the CHANGELOG.
- If a migration cannot derive a value, the hook adds one line to `additionalContext` that asks one question
  (e.g. "light or full?") through the question tool and runs `config-write.mjs` — one question, not a full init.
- Fix the fail-open: an invalid or old config never turns laws off (D40 item 2).
- Cost: ~1 script + hook change + fixtures per published version (D40 compatibility tests). Small.
- Risk: the hook writes a committed file (`.guilda/config.json`) without approval, which `init` hard limit 1
  forbids today. Mitigation: migrate in memory every session (Renovate style) and write the file only through
  `guilda:update` or on approval; or keep the ledger in `${CLAUDE_PLUGIN_DATA}`. Silent meaning drift for P-rules
  that cite R24/R11: mitigate with the one-line "rules changed: R11, R13, R24" notice and a lint that lists P-rules
  citing a changed ID.

### B. New IDs for changed rules (D40 as proposed)

- R24 → R27, etc.; old IDs deprecated one release with `replacedBy`.
- Cost: every cited ID in plugin files (`docs/…0.2.0.md` §3b lists ~20 places), tests, glossary, plus a
  migration that rewrites IDs in P-rules, CLAUDE.md and `violations.jsonl`. Two texts in the session budget for one
  release (the 125-line test already fails with R26).
- Risk: it still needs the stamp fix and the `process` default of A, so it does not remove init by itself. The
  evidence for it (Kubernetes) is about stored API objects, not about rules read by reference. ESLint, the closest
  analogue, does not rename rules for a stricter meaning.

### C. Explicit `guilda:update` migration step (no hook writes)

- `guilda:update`, after `claude plugin update`, runs `migrate.mjs` in the current project with a diff and one
  approval; other projects get the tolerant read until their next update run.
- Cost: lowest code. Risk: depends on the user running `guilda:update`; auto-update in the background bypasses it
  (Claude Code docs). Works as a complement to A, not alone.

## Recommendation

A, with C as the write path: rewrite in place; never copy rule text (already true; make it a test); tolerant read
with `process` → `full`; `schemaVersion` + idempotent migrations applied in memory each session and persisted by
`guilda:update` or on approval; the hook updates the stamp and no longer asks for init on minor/patch; one question
only when a value cannot be derived. Keep D40's deprecation metadata (ESLint `DeprecatedInfo` shape) for rules that
are **removed or replaced**, not for rules that change meaning. Change `RELEASING.md` so a meaning change raises the
minor and names the IDs, with no "run guilda:init" line, unless a migration returns a question.
