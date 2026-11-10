# Architect reference: the spec

Read this file at each use of procedure step 5. A compaction can drop it.

- Write one MD per feature in `docs/superpowers/specs/`. Tag each decision and scenario (ARC2).
- Write each Acceptance scenario with the user-visible result and the QA tool that verifies it (ARC3).
- Write the contract where state crosses a boundary: owner, units, lifecycle, format.
- Mark a security zone: the spec block has the line `Security zone: <risk area>` directly under its heading. The value is a risk area of D1 or of `config.security.riskAreas`. A task that builds a block with this line gets a brief whose `Risk area:` is not `none`. A block with no such line is not a zone.
