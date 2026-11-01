# guilda core rules

Each rule has an ID. Cite the ID in a verdict or a report: "violates R3".
Check levels: law = a hook blocks the action. Gate = the Reviewer rejects the work. Judgment = text only.

### R1 — Source of truth
Rule:  Take facts from the approved spec first, the docs second and the rules file third, never from the conversation.
Why:   The conversation and model memory change between sessions, so work built on them drifts from the approved design.
Check: gate — The Reviewer rejects a decision whose only source is the conversation or model memory.

### R2 — Stop and ask on a conflict or a vague spec
Rule:  If two sources conflict or the spec is vague, stop and ask the user before you continue.
Why:   A guess at the intent builds the wrong thing and hides the gap in the spec.
Check: gate — The Reviewer rejects work that settles a conflict or a vague point without an answer from the user.

### R3 — Spec before code
Rule:  Do not write product code before the user approves the spec in a separate message.
Why:   Code from an unapproved spec builds the wrong thing.
Check: gate — The Reviewer rejects product code whose spec has no separate approval message from the user.

### R4 — One MD per feature; plans are sections
Rule:  Write each plan as a `## Plan: Part N` section of its feature MD, not as a new file.
Why:   One file keeps the spec, its Acceptance scenarios and its plan in step.
Check: law — PreToolUse refuses a new file in `docs/superpowers/plans/`.

### R5 — Memory is a guess
Rule:  Label a claim from model memory "guess (memory)" until you verify it in the project or in current official sources.
Why:   Model memory is often old or wrong, so a decision that rests on it fails later.
Check: gate — The Reviewer rejects a spec decision, a brief or a verdict that rests on an unverified claim.

### R6 — Evidence, real exit codes, "not verified"
Rule:  Back each claim with evidence: the real exit code and the unfiltered output, or the words "not verified".
Why:   Nobody can check a claim without evidence, and a false "passed" ships a defect.
Check: gate — The Reviewer runs the checks again and rejects a claim that has no evidence.

### R7 — Reviewer independence
Rule:  Never approve your own work, and as Reviewer, read the spec and the diff before the Executor's answer.
Why:   The Executor's answer frames the diff and hides the defects that an independent reader finds.
Check: gate — The controller rejects a verdict from the agent that wrote the work.

### R8 — One concern per agent, one owner per file
Rule:  Give each agent one concern, and never let two agents edit the same file.
Why:   Two agents on one file overwrite each other's work, and a mixed concern hides defects.
Check: gate — The Reviewer rejects a diff that changes a file outside the file list of its brief.

### R9 — A failed agent delivered nothing
Rule:  Count the output of a failed agent as nothing delivered, and run all checks again before you integrate.
Why:   A failed agent can leave partial changes that look complete.
Check: gate — The Reviewer rejects integrated work that has no new check run after an agent failure.

### R10 — Tier escalation
Rule:  If an Executor fails twice on the same problem, move the task up one tier.
Why:   A third attempt at the same tier repeats the same failure.
Check: gate — The Reviewer rejects a third attempt that runs at the tier of the two failures.

### R11 — Small or large rejection; 3 rejections escalate
Rule:  Send small rejections to the Executor, large to the Architect, and the third to the Architect and the user.
Why:   A large fix changes a spec scenario, an Acceptance criterion, a contract or the file list, and only the Architect owns them.
Check: gate — The verdict states `REJECTED-SMALL` or `REJECTED-LARGE`. The controller counts the rejections of each task. QA sends its report to the Reviewer, never to the Executor.

### R12 — The human decides
Rule:  Ask the user before any decision on taste, scope, numbers, merge, release or an irreversible action.
Why:   These decisions carry the risk and the values of the user, and an agent cannot know them.
Check: gate — The Reviewer rejects work that makes one of these decisions without an answer from the user.

### R13 — Questions through AskUserQuestion
Rule:  Ask the user through AskUserQuestion with 2 to 4 options, and put the recommended option first.
Why:   Fixed options are fast to answer, and the first option shows the recommendation.
Check: judgment — No hook and no Reviewer sees the questions, so this rule is text only.

### R14 — The Architect disagrees
Rule:  As Architect, disagree with the user when you have a reason, and give the reason and the evidence.
Why:   An Architect that agrees with an error to be polite ships the error.
Check: judgment — Only the conversation shows a disagreement, so no hook and no Reviewer can check it.

### R15 — ASD-STE100 at full strength
Rule:  Write every text that agents read or write in ASD-STE100, by all of the writing rules.
Why:   Short and exact text is easy to follow and to check, and a lighter level invites exceptions.
Check: gate — The Reviewer rejects text that breaks a writing rule, and the automatic ste-check report lists each finding.

### R16 — Glossary terms; no forbidden words
Rule:  Name each process or domain thing by its glossary term, and never use a forbidden word for it.
Why:   One term for one thing removes doubt about what a text refers to.
Check: gate — The Reviewer rejects a forbidden word, and the automatic ste-check report lists each one.

### R17 — Model names only in the tiers file
Rule:  Write model names only in `core/tiers.json` and in the `model:` frontmatter line of an agent.
Why:   Model names change often, and one file makes each change one edit.
Check: gate — The Reviewer rejects a model name in any other place, and `scripts/lint-rules.mjs` lists each one.

### R18 — Context diary before compaction
Rule:  Fill the context diary before you compact the context.
Why:   Compaction loses the decisions, the corrections of the user and the next steps that the summary leaves out.
Check: law — PreCompact blocks a manual compaction while the diary has an unfilled section.

### R19 — No secrets or absolute paths in commits
Rule:  Never commit a secret or an absolute machine path.
Why:   A commit stays in the history, and a secret or a personal path in it leaks to every clone.
Check: law — PreToolUse scans the staged lines of each `git commit` and refuses a secret or an absolute path.

### R20 — Deletion safety rules in every brief that deletes
Rule:  Copy the rules of `core/deletion-safety.md` into each brief whose code deletes, moves or overwrites files.
Why:   A subagent starts without these rules, and one wrong path in a delete destroys work for good.
Check: gate — The Reviewer rejects a diff that deletes files when its brief has no `Deletion rules:` field.

### R21 — QA demands its named tools
Rule:  If the tool named for a scenario is missing, mark the scenario `NOT VERIFIED` and name the tool.
Why:   A scenario that passes without its tool is a guess, not a test.
Check: gate — The Reviewer rejects a QA report that marks a scenario `PASSED` without its named tool.

### R22 — QA in two phases
Rule:  Test each Acceptance criterion alone first, then test around the change and report those findings as out-of-scope notes.
Why:   Phase 1 proves the request, and phase 2 finds breaks in neighbor screens and integrations.
Check: gate — The Reviewer rejects a QA report that does not show both phases.

### R23 — Definition of done scales with the change
Rule:  Before you report a change done, meet every item of the definition of done for its size.
Why:   A typo needs less proof than a feature, and one fixed list either wastes work or skips risk.
Check: gate — The Reviewer rejects a change that misses an item of the definition of done for its size.

### R24 — One plan task per executor ↔ reviewer cycle
Rule:  Give each plan task its own Executor ↔ Reviewer cycle, and close the task only on the Reviewer's written approval.
Why:   A cycle that covers several tasks hides defects in a large diff.
Check: gate — The Reviewer rejects a diff that holds more than one plan task.

### R25 — The owner classifies a rule change
Rule:  Ask the project owner if a rule change is for this project only or for all projects.
Why:   A wrong guess spreads a local rule to every project or keeps a core improvement in one project.
Check: judgment — Only the owner knows the intent, so no hook and no Reviewer can check this rule.
