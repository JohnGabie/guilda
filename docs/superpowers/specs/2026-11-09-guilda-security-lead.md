# D35 — The Security Lead is an agent that decides with the Architect

Status: `@decided` (the user, 2026-11-09). Release: 0.5.0, with D15 and D16. It refines D16 and D28.
To merge into the decision register (`2026-11-09-guilda-decisions.md`) as entry D35.

## Decision

- `@decided` The Security Lead is an agent, not a skill. It makes many decisions. So it needs its own context, its
  own tools and its independence (R7, R8). The red team and blue team methods stay skills (D28).
- `@decided` The Security Lead decides on security together with the Architect:
  - It marks and reviews the security zones of a spec (D1).
  - It sets the security requirements of a brief.
  - It gives its verdict on work in a zone.
  - A decision that belongs to the user still goes to the user (R12).
- `@decided` The Security Lead can use the Lab (D19, D25). For example, it asks a lab to test if a weakness can be
  used, or which defense works.
- `@decided` With the foreman (D15), the Security Lead can run many agents that attack or defend the system of the
  project. These agents are Executors with the `red-team` or `blue-team` skills (D28). The limits of D16 and D28
  stay laws:
  - only the code of the project, in a local test environment;
  - no outside target and no real credential;
  - no copy of data out of the test environment;
  - the red team agent has restricted tools and a blocking hook.
- `@decided` The tools and the knowledge of the Security Lead are a separate part of the plan. The user is not a
  security specialist. So research plans this part, not the knowledge of the user. The part covers:
  - the tools that each security agent can use, and the tools that it must not have;
  - knowledge files, for example OWASP Top 10, OWASP LLM Top 10 and secure defaults for the stack;
  - domain skills: `red-team`, `blue-team`, and the skill that finds security zones;
  - existing tools to offer as options, for example static analysis and dependency scanners.
- `@decided` Each security skill comes from research of 20 or more sources, a curation that the user approves, and
  evals (D28). Each third-party tool or skill gets a license check and an audit before use.
- `@proposed` A lab researcher (D25) prepares this part: what a security lead agent needs, which tools exist, and
  which limits keep it safe. The user approves the curation before the build of a skill.

## Effect on other decisions

- D16: the Security Lead stays an agent, as D28 already said. The red team and blue team stay skills, and
  Executors run them.
- D28: no change on skills. This entry adds what the Security Lead decides and runs.
- D15: the foreman runs the attack and defense agents that the Security Lead asks for. It keeps the pace that the
  Architect set.
- Release plan: the security part of the plan is a separate work item in the 0.5.0 milestone.
