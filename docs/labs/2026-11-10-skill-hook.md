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
| K4 | Record only: does an installed core folder hold plugins/guilda-skills/? The lab installs nothing. It reads the cache folder of the installed guilda version, and records whether that folder holds the whole repository root (for example tests/ and docs/). No installed guilda: "not verified". | record |
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

(after the run)

## Not verified

(after the run)

## Verdict

(after the run)

## Lessons

(after the run)
