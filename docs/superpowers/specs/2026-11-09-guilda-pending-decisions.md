# guilda: decisions waiting to enter the register

Date: 2026-11-09. These decisions came after the split of the 0.2 design started. The split moves them into
`2026-11-09-guilda-decisions.md` with their release, then this file goes away.

## D35 — Measure token use at every level `@decided` (the user, 2026-11-09)

- Measure the token use of each task, of each block of a spec (D27), and of a whole session or a whole build.
- At the end of a build (for example a full release), guilda writes the total in a record: tokens, and the cost in
  US dollars and in Brazilian reals.
- `@proposed` The costs come from the current price of each model, read from the official source at the time of the
  record, never from memory. The record states the price date and the exchange rate it used.
- `@proposed` Sources: the token counts in the log (D13), the usage of agent runs (Claude Code and Codex report it),
  and, for subscriptions, the usage percent from the `cswap` fork (D22).
- `@proposed` The data skill (D25) turns the record into information: cost per task, per block, per release, and
  the trend between releases.
- `@open` The release of each part. Proposal: per-task and per-block measure with D13 and D27 (0.3.0); the total of a
  build and the money values with the data skill.

## D36 — Two lab skills for experiments `@decided` (the user, 2026-11-09)

The Lab group (D25) gets two domain skills (D28) for experiments. They can be one skill if research shows that is
better.

- Code experiments: try a dependency, a library, a framework or a technology against a real question of a project
  (does it fit, what does it cost, what breaks), in an isolated place, with PASS criteria written before (D19, D34).
- AI experiments: try a plugin, a skill, an MCP server, an agent setup or a model against a real question, with evals
  and the AI artifact gate of D29.
- `@open` Research before the build: existing practice and tools for each (spikes, proof of concept, dependency
  evaluation; plugin and skill evaluation), with 20 or more sources and a curation that the user approves (D28).

### D37 — The Security Lead is an agent that decides `@decided`

The user decided on 2026-11-09. It refines D16 and D28.

- `@decided` The Security Lead makes many decisions, so it is an agent, not a skill.
- `@decided` It decides security questions together with the Architect.
- `@decided` It can use the Lab (D25) to answer a security question before the build.
- `@decided` With the foreman (D15), it can run many agents that attack or defend the project's own system (the
  red team and blue team skills of D28, with the limits of D28 as law).
- `@decided` The plan gets its own part for the Security Lead: its tools and its knowledge, chosen with research,
  because the user does not know security in depth.
