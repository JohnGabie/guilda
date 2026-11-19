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

### R4 — One MD per feature; the plan is a section or one plan file
Rule:  Write each plan as a `## Plan: Part N` section of its feature MD, or in `<feature>.plan.md` next to it.
Why:   One place for each plan keeps the spec, its Acceptance scenarios and its plan in step.
Check: law — PreToolUse refuses a new file in `docs/superpowers/plans/`, and a new `*.plan.md` file whose `<feature>.md` is not in the same folder.

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
Check: gate — The verdict states `REJECTED-SMALL` or `REJECTED-LARGE`. The controller counts the rejections of each review unit: a task at `full`, the integration at `light`. A verdict with `Stage: spec` does not count. QA sends its report to the Reviewer, never to the Executor.

### R12 — The human decides
Rule:  Ask the user before any decision on taste, scope, numbers, merge, release or an irreversible action.
Why:   These decisions carry the risk and the values of the user, and an agent cannot know them.
Check: gate — The Reviewer rejects work that makes one of these decisions without an answer from the user.

### R13 — Decisions through the question tool
Rule:  Ask each decision in the question tool in plain words, with context, 2 to 4 options and the recommended first.
Why:   The context (where, what, a concrete scenario, the effect of each option) lets the user decide; a decision in a long reply was missed five times, and a rule ID with no meaning was not understood.
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
Rule:  Write model names only in `core/tiers.json`, in the `model:` line of an agent, and in research and lab files.
Why:   Model names change often, and one file makes each change one edit, while a dated record keeps the names of its date.
Check: gate — The Reviewer rejects a model name in any other place, and `scripts/lint-rules.mjs` lists each one. Research files (`docs/research/`) and lab files (`docs/labs/`) may quote model names and prices as dated records, and the lint does not scan them.

### R18 — Context diary before compaction
Rule:  Fill the context diary before you compact the context.
Why:   Compaction loses the decisions, the corrections of the user and the next steps that the summary leaves out.
Check: law — PreCompact blocks a manual compaction while the diary has an unfilled section.

### R19 — No secrets or absolute paths in commits
Rule:  Never commit a secret or an absolute machine path.
Why:   A commit stays in the history, and a secret or a personal path in it leaks to every clone.
Check: law — PreToolUse scans the staged and changed lines of each `git commit` and refuses a secret or an absolute path.

### R20 — Deletion safety rules in every brief that deletes
Rule:  Copy the rules of `core/deletion-safety.md` into each brief whose code deletes, moves or overwrites files.
Why:   A subagent starts without these rules, and one wrong path in a delete destroys work for good.
Check: law — PreToolUse refuses rm with a force or recursive flag in a subagent's Bash call. The Reviewer rejects a diff that deletes files when its brief has no `Deletion rules:` field.

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

### R24 — One review cycle for each review unit
Rule:  Give each plan task its own Executor ↔ Reviewer cycle at `full`, and one review of the integration at `light`.
Why:   A cycle that covers several tasks hides defects in a large diff, and a `light` project accepts that risk by choice.
Check: gate — At `full`, the Reviewer rejects a diff that holds more than one plan task, and each task closes only on a written approval of the Reviewer. At `light`, the controller closes the integration only on a written approval of the Reviewer.

### R25 — The owner classifies a rule change
Rule:  Ask the project owner if a rule change is for this project only or for all projects.
Why:   A wrong guess spreads a local rule to every project or keeps a core improvement in one project.
Check: judgment — Only the owner knows the intent, so no hook and no Reviewer can check this rule.

### R26 — Labs run in a dispatched agent
Rule:  Run each lab, experiment or spike in a dispatched agent, never in the controller session.
Why:   The controller writes the hypothesis and gives the verdict, so a lab that it runs itself grades its own work and fills its context.
Check: gate — The Reviewer rejects a lab report that has no agent ID of the agent that ran the lab (D34).

### R27 — Truth first; only the leads disagree
Rule:  Report the evidence with its limits, never make a result look better, and send each objection to your lead.
Why:   A grader that preferred a fake success to an honest failure built a wrong product (D39), and only a lead argues with the user (D46).
Check: judgment — No check can see truth yet, so a Lab study (D39, D46) refines this rule in a later release.

### R28 — Tell the user when guilda is not set up
Rule:  With no `.guilda/` folder, tell the user that guilda is not set up, and run no other law.
Why:   A plugin that loads and does nothing looks like it works, so the user trusts checks that never ran (#2, #11).
Check: law — SessionStart, and PreToolUse on a guilda skill or a `guilda:*` agent, print the set-up notice.

### R30 — Skills by role group
Rule:  Load a guilda skill only when its `groups` list has your role group or the value `shared`.
Why:   A skill of another group gives an agent methods that its role must not use, such as `red-team` in an Engineering Executor.
Check: law — PreToolUse refuses a `Skill` call of a guilda skill from an agent that has no role group, or no group of the skill.

### R31 — Cite each block that a task uses
Rule:  Give each plan task and each brief a `Uses:` line that cites each block it uses with its hash.
Why:   A change to a cited block then reaches each task that used it, with no full read of the spec again.
Check: gate — The Reviewer runs the trace check. It rejects a task or brief with no `Uses:` line, an unknown or ambiguous ID, or an unread suspect link.

### R32 — One writer for the queue
Rule:  Change the queue only through the queue script, as the writer role, and never edit its files by hand.
Why:   A second writer or a hand edit breaks the journal, and then the state of the flow is a guess.
Check: law — PreToolUse refuses a Write, an Edit or a common shell write to the queue files. It also refuses a queue script call from a caller that is not the writer role.

### R33 — State questions go to the Architect or a file
Rule:  In the main session, answer a question about the product state only from the Architect or a guilda file.
Why:   In the D31 lab a light main session gave a wrong task count from an old summary, with confidence.
Check: judgment — No hook sees where an answer came from, so L4-1 measures it and this rule is text only.

### R34 — The bus changes only through the bus script
Rule:  Write `.guilda/bus/` only through `scripts/bus.mjs`, and send only from the address bound to you.
Why:   Any process that writes the bus can send as any address, also as a user channel (lab `external-agent`).
Check: law — PreToolUse refuses a Write, an Edit or a common shell write to `.guilda/bus/`, and a read of the key folder. It also refuses a `send` whose `--from` is not the address of the caller.

### R35 — A user decision needs a user record
Rule:  Count an answer as the decision of the user only when it cites a user record that `bus.mjs verify` accepts.
Why:   An answer from another agent can be a guess or a forgery, and only the user decides (R12).
Check: gate — The Reviewer runs `verify` on the record that each new `@decided` item cites, and reads the record. It rejects the item on a failure, or when the record does not state it.
