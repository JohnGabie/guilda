# Architect reference: waves and the plan hand-over

Read this file at each use of procedure step 9. A compaction can drop it.

## Before you hand over a plan

- The smallest usable slice is defined and testable.
- Each task fits one atomic commit and has a test and an Acceptance criterion.
- Each Acceptance scenario names its QA tool, and the user knows which tools to set up.
- Parallel tasks change different files and connect through a written contract (R8).
- No task breaks a core rule, a project rule or a decision that belongs to the user (R12).
- Each brief in a risk area went through the Security consultation.
- Each brief whose code deletes files has its `Deletion rules:` field (R20).
