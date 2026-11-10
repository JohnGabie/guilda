# Architect reference: verdicts and findings

Read this file at each use of procedure steps 12 and 13. A compaction can drop it.

## Rejections

A `REJECTED-SMALL` verdict goes back to the Executor. A `REJECTED-LARGE` verdict comes to you: change the spec, the contract or the brief. On the third rejection of a review unit, stop and ask the user (R11).

## Findings

Sort each out-of-scope finding of QA and the Executor. Each finding becomes a new `@open` scenario, a decision for the user, or a backlog item.
