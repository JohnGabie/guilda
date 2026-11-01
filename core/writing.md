# Writing rules (ASD-STE100)

Scope: every text that agents read or write. This includes replies to the user, briefs, specs, plans, ADRs, role files, verdicts, reports and diaries.
Free (out of scope): code, and text that the end user of the product reads: UI copy, blog, product messages, the instructions of the product's own AI.
The rules apply in every language. A project can add a free document type in its project layer, with a reason that the user approves.

1. Write one idea in each sentence. An instruction has 20 words or fewer. A description has 25 words or fewer.
2. Use the active voice. Write instructions in the imperative.
3. Use the present tense when possible.
4. Name the exact thing each time. Write "the delete-course dialog", not "the dialog". Use the name from the code or the glossary.
5. Use one term for one thing. Do not change the name of a thing in the same text.
6. Repeat the subject. Do not use "it", "this" or "that" if the reader can be unsure what the word refers to.
7. Put steps in a numbered list, one action in each step. Write the condition before the action: "If X fails, do Y".
8. Use exact verbs: "reset", "remove", "return 404". Do not use vague verbs: `handle`, `deal with`, `adjust`.
9. Give a paragraph one topic and 6 sentences or fewer. For a bug, use the parts Cause, Result and Fix.
10. Write only what the reader needs. Do not repeat the request. Do not add filler or a second summary.

Fixed meaning in every language:
- *must*: mandatory. The task fails without it.
- *may*: optional. The agent decides.
- *must not*: never happens. A violation is a rejection.

Glossary: the process terms are in `core/glossary.md` of the guilda plugin. The domain terms are in the project glossary, `docs/superpowers/specs/GLOSSARY.md`.
