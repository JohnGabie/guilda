---
description: The Architect executor adds a new domain term to the glossary with forbidden synonyms.
max_turns: 16
timeout_seconds: 540
allowed_tools: [Agent, Read, Glob, Grep, Write, Edit, Bash]
---

Use the Agent tool to dispatch the agent guilda:architect-executor (subagent_type "guilda:architect-executor") with the request below, then show me its report and the text it wrote as it is.

REQUEST
File to write: docs/superpowers/specs/GLOSSARY.md (add the new term of the spec), and docs/superpowers/specs/2026-11-10-invoices-approval.md section Approval (write it from the decided items).
The spec uses a new term: 'approval chain'.
