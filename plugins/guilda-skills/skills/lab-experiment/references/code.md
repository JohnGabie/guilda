# Code experiments

For a dependency, a library, a framework, a tool, a technology, or a benchmark of code. Read `SKILL.md` first.
The report keeps the D34 sections; this file says what goes inside each.

## Necessity first

Record the answer to "can the project avoid this dependency by using existing components?" [14]. Name the existing
component you checked (the standard library, a dependency the project already has) and the command or file that
shows it. A yes with a small cost of avoiding is a NO-GO before any run.

## Adoption facts, by command

One row for each fact: the value, the command, the date. The checks come from the OpenSSF guide for evaluating open
source software [14]:

| Group | Check | Where the fact comes from |
|---|---|---|
| Maintenance | recent activity in the last 12 months | the registry or `gh api` for the repository |
| Maintenance | the last release was in the last 12 months | the registry or `gh api` releases |
| Maintenance | more than one maintainer | the registry or `gh api` contributors |
| Security | the current version has no known important vulnerability | `osv-scanner` with `--offline`, or the advisories that deps.dev returns [16][17] |
| License | every component has a license | deps.dev `GetVersion` (licenses) [16] |
| Name | a similar name is more popular (typosquatting) | the registry search by name |
| Behavior | it adds no unexpected indirect dependencies in production | deps.dev `GetDependencies` (the resolved graph) [16] |

Notes on the tools:

- deps.dev API v3: `GetVersion` gives licenses, advisory IDs and links of a version; `GetProject` gives the Scorecard
  data; `GetDependencies` gives the resolved dependency graph [16]. Read the version of the API from its page the
  day you use it.
- `osv-scanner` sends package names, versions, ecosystems and file hashes to the OSV API. With `--offline` it makes
  no network request. Do not run its `fix` command: it can make the package manager run scripts [17].
- OpenSSF Scorecard needs a GitHub token. A score is an input, not a verdict: a low score does not prove that the
  project is at risk [15]. Record the Critical checks (Dangerous-Workflow, Webhooks) by name.
- A fact with no value (no token, no network) goes to "Not verified". "Unavailable data is never evidence of risk" [18].

Write a limit for each fact in the PASS criteria before you collect it (for example "license in the allowed list",
"last release within 12 months", "no known important advisory").

## The spike

- A throwaway branch `lab/<name>` in its own worktree [25]. Remove the worktree only with a plain
  `git worktree remove` (it refuses a worktree with changes unless `--force`; do not force it, list it instead).
- The spike code answers the question and is never merged. If the verdict is GO, adoption is a new task with a brief.
- Install the subject only inside the isolated place. A package with install scripts, or an unknown one, goes to a
  container or a virtual machine [8].
- Pin the exact version of the subject and of each tool, and write them in the report.
- Functional checks are the question of the project written as a test, run in each arm before the data.

## A property check (optional PASS criterion)

For a library whose output has a rule that holds for all inputs, add a check of a property: for example
"parse(write(x)) equals x", "sorting twice equals sorting once", or "the output has the same length as the input".
Generate many inputs, and keep the failing input as evidence. The idea comes from the `property-based-testing` skill
of Trail of Bits [34]; no text of it is copied. Write the property in the PASS criteria before the run. A property
that fails with a small input is strong evidence for NO-GO; passing is evidence for the properties tested, not for
the whole library.

## A benchmark

Use it when the question is speed or memory.

- Tool: `hyperfine` for commands (warmup runs, at least 10 runs by default, outlier detection, JSON and Markdown
  export) [22]; `pyperf` for Python [23]; the harness of the project in other cases.
- The same machine state for each arm; alternate the order of the arms; write the CPU, the governor and the other
  load in "Method". `pyperf system tune` sets the CPU governor and isolating a core makes a benchmark more stable;
  do not turn off ASLR by hand [23]. Running `system tune` changes the machine, so ask the user first.
- The number of repetitions comes from a method for it (Kalibera and Jones) [24] and from the variance of a pilot
  (`data`). Write the number before the run.
- Give the median and the spread for each arm, and the effect with its interval (`data`).
- A result from a noisy machine is MORE DATA, not GO.

## The verdict as a decision record

Map the verdict to the parts of a decision record [19]: the context is the question, the decision is GO or NO-GO,
the status is "proposed" until the owner of the decision agrees, and the consequences are the cost of a wrong call
and what the project must do next. Records kept in source control are a practice that the Thoughtworks Radar placed
in Adopt in 2018 [20].
