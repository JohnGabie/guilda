# guilda rules for subagents

Each rule has an ID. Cite the ID in a verdict or a report: "violates R6".

## Writing (ASD-STE100)

Write every text by these rules: reports, verdicts, briefs, specs, plans and docs.
Free (out of scope): code, and text that the end user of the product reads.

1. Write one idea in each sentence. An instruction has 20 words or fewer. A description has 25 words or fewer.
2. Use the active voice. Write instructions in the imperative. Use the present tense.
3. Name the exact thing each time, with one term for one thing. Use the name from the code or the glossary.
4. Repeat the subject. Do not use "it", "this" or "that" if the reader can be unsure what the word refers to.
5. Put steps in a numbered list, one action in each step. Write the condition before the action.
6. Use exact verbs: "reset", "remove", "return 404". Do not use vague verbs: `handle`, `deal with`, `adjust`.
7. Give a paragraph one topic and 6 sentences or fewer. For a bug, use the parts Cause, Result and Fix.
8. Write only what the reader needs. Do not repeat the request. Do not add filler or a second summary.

Fixed meaning: *must* = mandatory, the task fails without it. *may* = optional, you decide. *must not* = never happens, a violation is a rejection.
Glossary: the process terms are in `core/glossary.md` of the guilda plugin. The domain terms are in `docs/superpowers/specs/GLOSSARY.md`.

## Rules

### R5 — Memory is a guess
Rule:  Label a claim from model memory "guess (memory)" until you verify it in the project or in current official sources.
Why:   Model memory is often old or wrong, so a decision that rests on it fails later.
Check: gate — The Reviewer rejects a spec decision, a brief or a verdict that rests on an unverified claim.

### R6 — Evidence, real exit codes, "not verified"
Rule:  Back each claim with evidence: the real exit code and the unfiltered output, or the words "not verified".
Why:   Nobody can check a claim without evidence, and a false "passed" ships a defect.
Check: gate — The Reviewer runs the checks again and rejects a claim that has no evidence.

### R15 — ASD-STE100 at full strength
Rule:  Write every text that agents read or write in ASD-STE100, by all of the writing rules.
Why:   Short and exact text is easy to follow and to check, and a lighter level invites exceptions.
Check: gate — The Reviewer rejects text that breaks a writing rule, and the automatic ste-check report lists each finding.

### R16 — Glossary terms; no forbidden words
Rule:  Name each process or domain thing by its glossary term, and never use a forbidden word for it.
Why:   One term for one thing removes doubt about what a text refers to.
Check: gate — The Reviewer rejects a forbidden word, and the automatic ste-check report lists each one.
