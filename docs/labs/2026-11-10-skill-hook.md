# Lab: can a Claude Code hook see and refuse one skill call, and know the agent that made it?

2026-11-10 · branch `lab/0.2-skill-hook` · spec 0.2.0 section 2, section 3e, plan block L3, T30 · D43, D19, D34 ·
agent ID `a4dcff7a6a1014230` (the name of this agent's transcript file `subagents/agent-a4dcff7a6a1014230.jsonl` in
the session folder `2faf61d8-fac7-442d-9608-ece7086db9bc`) · model Claude Opus 5.5 (`claude-opus-5-5`) for this
agent; the live sessions use the default model of the user's config · account: the user's normal login and config
(no config change) · Claude Code 2.1.322

## Hypothesis

A PreToolUse hook with the matcher `Skill` gets the skill name and the agent type in its standard input, and its
`permissionDecision: "deny"` stops the load of that one skill.

## PASS criteria (written before the run)

Copied from the plan block L3 (fixed):

| ID | Criterion | Runs |
|---|---|---|
| K1 | A PreToolUse hook with the matcher Skill runs on a Skill call. Its permissionDecision deny stops the load of that one skill, and the transcript shows the reason. | 3 of 3 |
| K2 | The hook input names the skill. The lab records the field name and the exact value for one core skill (guilda:architect) and for one skill of a second plugin in a subfolder of the first. | record |
| K3 | For a call from a dispatched plugin agent, the hook input names the agent type. The lab records the field name and the value. For a call from the main session, the input has no agent type. | 3 of 3 each |
| K4 | Record only: does an installed core folder hold plugins/guilda-skills/? The lab installs nothing. It reads the cache folder of the guilda version that the user has installed, and records whether that folder holds the whole repository root (for example tests/ and docs/). No installed guilda: K4 is "not verified", and the build uses core/groups.json for the extension skills. | record |
| K5 | Record only: does `claude plugin validate --strict` accept `group:` in an agent definition and `groups:` in a SKILL.md, and do the agent and the skill still load? | record |
| K6 | Record only: does the hook run when the user types the skill as a slash command? | record |

Verdict rule (fixed): GO when K1, K2 and K3 pass. K4 false: the hook reads the groups of the extension skills from
`core/groups.json`. K5 false: each group lives in `core/groups.json` (section 3e). NO-GO when K1 or K3 fails. MORE
DATA in each other case.

Main metric: K1 and K3 pass counts (3 of 3). Guard: the denied skill text (`BLOCKED-TOKEN-4410`) never reaches the
model output. Smallest effect worth acting on: one failed run of K1 or K3. Stop rule: 40 `claude -p` runs or 2 hours.

### Keys (expected answers, written before the first run)

- K1: the session output has a tool result with `LAB-DENY-K1`, and no `BLOCKED-TOKEN-4410` in the final text.
- K2: field `tool_input.skill`; values `skhlab:alpha` (stands for `guilda:architect`, the same `<plugin>:<name>`
  form) and `skhlab-ext:beta`.
- K3: field `agent_type` with the value `skhlab:worker` (also an `agent_id` field); the main-session input has no
  `agent_type` field.
- K4: written after a read during setup (see Evidence): the cache folder is a copy of the repository root.
- K5: unknown; expected that `--strict` accepts unknown frontmatter fields.
- K6: expected "no": `claude -p "/skhlab:alpha"` expands the skill without a Skill tool call.

Correction after the run (2026-11-10, after a Reviewer read): the K4 row was not word for word the plan text. It
is now the literal plan text. The result of K4 did not change.

## Method

Two throwaway plugins in a `mktemp -d` folder: `skhlab` (skills `alpha`, `blocked`; agent `worker` with
`group: engineering`; hook `PreToolUse` matcher `Skill` in exec form) and `skhlab-ext` in its subfolder
`plugins/skhlab-ext` (skill `beta`). Each skill has a `groups:` field. The hook appends its raw standard input to
`log/hook-input.jsonl` and denies each skill whose name ends with `blocked`. A copy of both plugins is in
`docs/labs/data/2026-11-10-skill-hook/plugin/`.

Each session: a new `mktemp -d` project as cwd, a new log folder (`SKHLAB_LOG_DIR`), and
`claude --plugin-dir <skhlab> --plugin-dir <skhlab>/plugins/skhlab-ext -p "<prompt>" --output-format stream-json --verbose --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)"`.
Arms: M (main session calls `alpha`, `beta`, `blocked`), A (main session dispatches `skhlab:worker`, which calls
`alpha`), S (slash command `/skhlab:blocked` and `/skhlab:alpha`). The init message of each stream records the
loaded plugins.

## Evidence

Raw data: `docs/labs/data/2026-11-10-skill-hook/`. For each run `runs/<ID>/`: `hook-input.jsonl` (the hook's raw
standard input, one line per call), `stream.jsonl` (the `stream-json` output; the init message is reduced to the
loaded plugins, the model and the version, and rate-limit events are dropped), `exit.txt`. Home paths are `$HOME`,
`mktemp` folders are `<mktemp>`. Runs on 2026-11-10, base commit `2120f95`, Claude Code 2.1.322, model of each live
session `claude-opus-5-5`. Exit code of each `claude -p` run: 0.

Plugins that each live session loaded (init message, same in each run): `skhlab@inline` 0.0.1, `skhlab-ext@inline`
0.0.1, `computer-use-linux@computer-use-linux` 0.7.36, `superpowers@claude-plugins-official` 7.0.0, `guilda@guilda`
0.1.0, and the built-in `cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-privacy`,
`cc-plugin-plugin-authoring`. Run L1 loaded the `v/list` copy of `skhlab` (see K5) in place of `skhlab`.

Prompts:
- M: `Call the Skill tool three times, one call at a time, in this order: skill skhlab:alpha, then skill skhlab-ext:beta, then skill skhlab:blocked. After each call, quote the exact tool result text. Then report the tokens you saw.`
- G: `Call the Skill tool once with the skill guilda:architect. Do not follow its instructions and do not ask questions. Only quote the first line of the tool result, then stop.`
- A, L: `Use the Agent tool once with subagent_type skhlab:worker. Give it this prompt: 'Call the Skill tool with the skill skhlab:alpha, then call the Skill tool with the skill skhlab:blocked. Quote each tool result.' Then quote the reply of the agent. Do not call any skill yourself.`
- B: `Use the Agent tool once with subagent_type general-purpose. Give it this prompt: 'Call the Skill tool with the skill skhlab:alpha and quote the tool result.' Then quote the reply of the agent. Do not call any skill yourself.`
- S1, S3: `/skhlab:blocked`. S2: `/skhlab:alpha`.

| Run | Caller | Hook calls (`tool_input.skill`) | `agent_type` | Deny result | `BLOCKED-TOKEN-4410` in output |
|---|---|---|---|---|---|
| M1 | main | `skhlab:alpha`, `skhlab-ext:beta`, `skhlab:blocked` | absent | yes | 0 |
| M2 | main | same | absent | yes | 0 |
| M3 | main | same | absent | yes | 0 |
| G1 | main | `guilda:architect` | absent | n/a (passed) | 0 |
| A1 | `skhlab:worker` | `skhlab:alpha`, `skhlab:blocked` | `skhlab:worker` | yes | 0 |
| A2 | `skhlab:worker` | same | `skhlab:worker` | yes | 0 |
| A3 | `skhlab:worker` | same | `skhlab:worker` | yes | 0 |
| L1 | `skhlab:worker` (`group: [engineering, architect]`) | same | `skhlab:worker` | yes | 0 |
| B1 | `general-purpose` | `skhlab:alpha` | `general-purpose` | n/a (passed) | 0 |
| S1 | slash command | none (no log file) | n/a | no | 2 (the skill loaded) |
| S2 | slash command | none (no log file) | n/a | n/a | 0 (`ALPHA-TOKEN-7731` was the reply) |
| S3 | slash command | none (no log file) | n/a | no | the reply was `BLOCKED-TOKEN-4410` |

### K1 — the deny stops the load of one skill: PASS (3 of 3 main, 4 of 4 agent)

In M1 to M3 the call of `skhlab:blocked` got the tool result (with `is_error: true`):
`PreToolUse:Skill hook error: LAB-DENY-K1: the lab hook refused the skill skhlab:blocked`. The skill body was not
loaded: the token `BLOCKED-TOKEN-4410` is in no stream. The other two skills of the same session loaded
(`Launching skill: skhlab:alpha`, then the skill body). The same result in A1 to A3 and L1, inside the agent.
Note for T30: Claude Code shows the reason with the prefix `PreToolUse:Skill hook error: `.

### K2 — the field that names the skill: PASS

Field: `tool_input.skill` (`tool_name` is `Skill`, `hook_event_name` is `PreToolUse`). The value has the form
`<plugin name>:<skill name>`:
- core skill: `guilda:architect` (run G1, the installed guilda 0.1.0; the lab hook saw it because a hook with the
  matcher `Skill` runs for each skill call); in the lab core plugin `skhlab:alpha`.
- skill of the second plugin in a subfolder of the first: `skhlab-ext:beta` (M1 to M3). The prefix is the plugin
  name of the subfolder plugin, not of the parent. For guilda it is `guilda-skills:<name>`.

One full hook input (M1, call 1):

```json
{"session_id":"5f20595f-6677-443e-9d1e-24193674ee82","transcript_path":"$HOME/.claude/projects/-<mktemp>/5f20595f-6677-443e-9d1e-24193674ee82.jsonl","cwd":"<mktemp>","prompt_id":"c762106b-c302-4233-9d86-0fa234f46798","permission_mode":"bypassPermissions","effort":{"level":"medium"},"hook_event_name":"PreToolUse","tool_name":"Skill","tool_input":{"skill":"skhlab:alpha"},"tool_use_id":"toolu_0169WhEbZTNRQs2Vk6Q4ednt"}
```

### K3 — the field that names the agent type: PASS (3 of 3 agent, 3 of 3 main)

Field: `agent_type` (top level of the hook input), next to `agent_id`. Value for the plugin agent `worker` of the
plugin `skhlab`: `skhlab:worker` (A1 `agent_id` `a55f6f10881f27749`, A2 `af37c0acc29c91307`, A3
`a092d81b8568677ed`; also L1). For guilda the value is `guilda:<name>`. A built-in agent gives its bare name:
`general-purpose` (B1). Main session (M1 to M3, G1): no `agent_type` key and no `agent_id` key in the input.

### K4 — the installed core folder: true (inferred), the subfolder itself not verified

Evidence: `k4-cache-listing.txt` (read only). The user has guilda 0.1.0 installed (cache folder
`$HOME/.claude/plugins/cache/guilda/guilda/0.1.0`, user scope and three project scopes, commit `7a68174`). The
marketplace entry is `{ "name": "guilda", "source": "./" }`. The cache folder holds the whole repository root,
`tests/`, `docs/`, `evals/`, `.guilda/` and `.gitignore` included: its file list is the same as
`git ls-tree -r --name-only 7a68174` (89 files each, `diff` exit 0). The folder has no `plugins/`, because the
repository had no `plugins/` at 0.1.0. So a version with `plugins/guilda-skills/` in the repository root will have it
in the installed core folder, when the source stays `./`. Not observed: an installed version that has the
subfolder.

### K5 — `group:` and `groups:` with `validate --strict`: true

Evidence: `validate-strict-lab-plugin.txt`, `validate-strict.txt`. The lab plugin as run fails `--strict` only on
the warning `author: No author information provided` (exit 1). Copies with `author` and `license` added:

| Copy | Change | `skhlab` | `skhlab-ext` |
|---|---|---|---|
| `v/with` | `group: engineering`, `groups: [...]` | exit 0 | exit 0 |
| `v/without` | no `group`, no `groups` | exit 0 | exit 0 |
| `v/list` | `group: [engineering, architect]` | exit 0 | — |
| `v/broken` | `group: [engineering` and `groups: [architect` (bad YAML) | exit 0 | — |

The validator accepts the fields. It also accepts bad YAML in these frontmatter fields, so it does not check them:
the hook or a test must check the values. The agent and the skills load with the fields: in each live run the
agent `skhlab:worker` (`group: engineering`, and the list form in L1) ran, and the skills with `groups:` loaded.

### K6 — slash command: no, with `claude -p`

In S1 and S3 (`claude -p "/skhlab:blocked"`) the hook did not run (no log file), and the denied skill loaded: the
reply was `BLOCKED-TOKEN-4410`. S2 (`/skhlab:alpha`) is the same: no hook call, reply `ALPHA-TOKEN-7731`. In `-p`
mode a skill typed as a slash command is expanded with no Skill tool call, so no PreToolUse hook sees it. The
interactive session is not verified (see the user steps).

## Not verified

- K6 in an interactive session (a user types `/skhlab:blocked` in the TUI). It needs the user's screen (G7).
- K4: an installed guilda version that has `plugins/guilda-skills/`. No such version exists yet. The answer is an
  inference from the `./` source and the whole-root copy.
- Whether a main session started with `claude --agent <name>` gets an `agent_type`. Not in the criteria; the lab
  did not run it.

## User steps (G7)

Folder: `<the folder the controller gives you>` (it holds `skhlab` and `skhlab/plugins/skhlab-ext`).

1. In a terminal: `cd "$(mktemp -d)"; export SKHLAB_LOG_DIR="$(mktemp -d)"; echo "$SKHLAB_LOG_DIR"`.
2. Type `claude --plugin-dir <folder>/skhlab --plugin-dir <folder>/skhlab/plugins/skhlab-ext`.
3. In the session, type `/skhlab:blocked` and press Enter.
4. Look at the reply: is it `BLOCKED-TOKEN-4410` (the hook did not stop it), or a text with `LAB-DENY-K1` (the
   hook stopped it)?
5. Type `/exit`. Then `cat "$SKHLAB_LOG_DIR/hook-input.jsonl"`.
6. Report back: the reply of step 4, and whether the file of step 5 exists and what lines it has.

## Verdict

GO. K1, K2 and K3 pass. K4 true (inferred): the hook can read the extension skills under
`plugins/guilda-skills/skills/<name>/SKILL.md` of the core plugin root. K5 true: the groups stay in the frontmatter
(`group`, `groups`); `core/groups.json` is not needed.

Contract values for T30 `[from L3]`: the skill field is `tool_input.skill`, value `<plugin>:<skill>`
(`guilda:architect`, `guilda-skills:<name>`); the agent field is `agent_type`, value `<plugin>:<agent>` for a
plugin agent (`guilda:executor`), the bare name for a built-in agent (`general-purpose`), and absent in the main
session. Deny form: `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason`.

Cost of a wrong call: low; T30 has its own tests and a live QA step. It can be undone (the hook is one entry in
`hooks/hooks.json`). Does not apply to: a skill that the user types as a slash command (K6, at least in `-p` mode),
a main session started with `--agent`, Claude Code versions other than 2.1.322.

## Lessons

- R30 does not cover a skill that the user types as a slash command: in `-p` mode no Skill tool call happens.
  The spec (section 3e) should say that R30 guards Skill tool calls only. A slash command comes from the user, so
  this is not a gap for agents.
- `claude plugin validate --strict` does not check the frontmatter of agents and skills (bad YAML passes). The
  test `tests/roles.test.mjs` (S37) and `skillGroups` must check the values; the spec should not count on the
  validator.
- The deny reason reaches the model with the prefix `PreToolUse:Skill hook error: `. QA of T30 should match the
  R30 text as a substring.
- The hook input of the main session has no `agent_id` either, so "no `agent_type` key" is a safe test for the
  main session.

Raw data fix after a Reviewer read: five `stream.jsonl` files (A1, A2, A3, B1, L1) held an absolute temp path in
the `output_file` value of the `task_notification` line. The prefix is now `<tmp>/`. The first results commit
`afc81b5` still holds those paths in its history; the controller decides about it.

Runs: 12 `claude -p` sessions (M1 to M3, G1, A1 to A3, L1, B1, S1 to S3), and 12 `claude plugin validate`
commands. Time: under 1 hour. Commit attribution: this agent is Claude Opus 5.5, so its commits carry that
co-author line in place of the one in the lab instructions.
