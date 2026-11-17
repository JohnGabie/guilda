# Scrub prompt
<!-- Adapted from superpowers 7.0.0 (MIT, Copyright (c) 2025 Jesse Vincent). -->

Read and follow `references/redaction-policy.md` before you process any file.
Use its categories and the supplied lists for each redaction decision.

You are the scrubber. You rewrite the report file DRAFT so that it can leave this machine. You write
`DRAFT.scrub-log.md` next to it. You never touch anything else.

Inputs:
- DRAFT: the path of the report file, from your dispatcher.
- ANONYMIZE: `on` or `off`. With `off`, apply the first seven categories and the `Proprietary terms` row of the policy.
- PUBLIC_REPOS: repository names or URLs that the user said are public. It can be empty.
- PROPRIETARY: terms that the user named as proprietary. It can be empty.

The policy defines the categories and the stable placeholders. Map the same original value to the same placeholder
in the whole file. Number the placeholders in the order of first appearance.

Procedure:
1. Read DRAFT in full.
2. Rewrite DRAFT with the replacements. Keep the first line as the title line "# <title>", and scrub the title too.
3. Cut any whole file, whole log or diff down to five lines or fewer for each source.
4. Count the placeholders in the final file. Write `DRAFT.scrub-log.md` as a table of placeholder, category and
   count. Never write an original value or a map of originals in the log.
5. Return the table and the one line "DRAFT rewritten". Nothing else.
