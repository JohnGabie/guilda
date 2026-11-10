# Lab experiment skills research (2026-11-10)

This research is the input for decision D36 in `docs/superpowers/specs/2026-11-09-guilda-decisions.md`.
D36 gives the Lab group (D25) skills for two kinds of experiment:

- **Code experiment:** try a dependency, a library, a framework or a technology against a real question of a
  project. The experiment runs in an isolated place, with PASS criteria written before the run (D19, D34).
- **AI experiment:** try a plugin, a skill, an MCP server, an agent setup or a model against a real question. The
  experiment uses evals and the gate of D29.

D36 allows one skill instead of two if research shows that one is better. D28 requires 20 or more sources and a
curation that the user approves before the build.

Related decisions:

- D19: labs run in an agent.
- D25: the lab roles and the data checklist.
- D28: domain skills.
- D29: the AI artifact gate.
- D30: a lean core with reference files.
- D34: the lab report format.

## Method

- Primary sources only, read on 2026-11-10. The quotes stay in the original English, word for word.
- The license, the last release and the last push of each tool come from `gh api`, on 2026-11-10.
- A claim with no primary source is in the section "Not verified".
- The six lab reports on the `lab/*` branches were read for the report form that is in use now.

## Findings: code experiments

1. **Necessity first.** The OpenSSF Concise Guide starts with this check: "Evaluate whether the dependency can be
   avoided by utilizing existing components." A code experiment first records the answer to that question.
2. **Adoption checklist.** The OpenSSF Concise Guide (header date 2025-03-28) lists checks in 5 groups.
   - Maintenance: "Confirm significant recent activity (e.g., commits) has occurred within the previous 12 months."
   - Maintenance: "Confirm that the last release was issued within the previous 12 months."
   - Maintenance: "Verify the presence of more than one maintainer".
   - Security: "Confirm if the current version is free of known important vulnerabilities".
   - License: "Verify that every component has a license".
   - Name: "Check if a similar name is more popular". This check finds typosquatting.
   - Behavior: "Does it add unexpected or unnecessary indirect dependencies in production?"
3. **Facts from machines, not from memory.** The `supply-chain-risk-auditor` skill of Trail of Bits collects each
   fact with a script. The exact quote is in the table "Long quotes" below. The skill also says: "Unavailable data
   is never evidence of risk."
4. **deps.dev.** The deps.dev API v3 needs no key in its examples. `GetVersion` returns the licenses, the advisory
   IDs and the links of one version. `GetProject` returns the Scorecard data. `GetDependencies` returns "a resolved
   dependency graph for the given package version."
5. **OSV.** osv-scanner v2.7.1 (Apache-2.0) sends "package names, versions, ecosystems, and file hashes" to the OSV
   API. The `--offline` mode stops all network requests. The README warns that the `fix` command "may trigger the
   package manager to execute scripts".
6. **OpenSSF Scorecard.** Scorecard v5.6.0 (Apache-2.0) has checks at 4 risk levels. The Critical checks are
   Dangerous-Workflow and Webhooks. The CI-Tests docs say: "A low score is therefore not a definitive
   indication that the project is at risk." So a Scorecard number is an input, not a verdict.
7. **Spike.** SAFe says that spikes "represent activities such as exploration, architecture, infrastructure, research,
   design, and prototyping". SAFe also says: "Spikes may involve creating a small program, research activity, or
   test demonstrating new functionality." The rest of the SAFe page needs a login.
8. **Decision record.** Michael Nygard (2011) gives an ADR 5 parts: title, context, decision, status, consequences.
   About the status he writes: "A decision may be "proposed" if the project stakeholders haven't agreed with it yet."
   The Thoughtworks Technology Radar put "lightweight architecture decision records" in Adopt in May 2018.
9. **Benchmarks.** hyperfine v2.0.0 (MIT or Apache-2.0) does warmup runs and "at least 10 benchmarking runs" by
   default. It has "Statistical outlier detection to detect interference from other programs and caching effects".
   It exports JSON and Markdown.
10. **A stable machine.** The pyperf docs say: "isolating at least 1 core has a significant impact on the stability
    of benchmarks." The `pyperf system tune` command sets the CPU governor to `performance`. The docs also say: "ASLR
    must *not* be disabled manually!"
11. **Number of runs.** Kalibera and Jones (ISMM 2013) give a statistical method for the number of
    repetitions. A corrected version is in the University of Kent repository.
12. **Isolation with git.** A worktree is linked to the repository, "sharing everything except per-worktree files
    such as `HEAD`, `index`, etc." `git worktree remove` refuses a worktree with changes unless `--force` is used.
    So a throwaway branch in its own worktree keeps the main checkout clean.
13. **Isolation of the process.** The Claude Code page "Choose a sandbox environment" compares 6 approaches. The
    sandboxed Bash tool restricts only shell commands. "Built-in file tools, MCP servers, and hooks still run
    directly on your host." The sandbox runtime `srt` puts the whole Claude Code process inside the boundary. For
    untrusted code, the page recommends a virtual machine.

## Findings: AI experiments

1. **Evals first.** The Anthropic skill authoring guide says: "Create evaluations BEFORE writing extensive
   documentation." The 5 steps are: identify gaps, create evaluations, establish a baseline, write minimal
   instructions, iterate. The checklist asks for "At least three evaluations created" and "Tested with Haiku, Sonnet,
   and Opus".
2. **The skill-creator loop.** The `skill-creator` skill (Apache-2.0) runs each case with the skill and without it, in
   the same turn. It saves `total_tokens` and `duration_ms` for each run. It grades with assertions and
   `agents/grader.md`. `scripts/aggregate_benchmark` writes the pass rate, the time and the tokens as mean, standard
   deviation and delta.
3. **Trigger evals.** The `skill-creator` description loop uses 20 queries: about half should trigger the skill and
   half should not. Each query runs 3 times. The set splits into 60% train and 40% held-out test.
4. **`claude plugin eval`.** This command needs Claude Code v2.1.269 or later. Each case is a prompt and one or more
   graders. Each case runs 3 times by default, in a fresh isolated session. A second arm runs with no plugin. The
   difference `Δ` "is what the plugin contributed."
5. **Graders of `claude plugin eval`.** There are 6 grader types. `regex`, `tool_used`, `tool_order` and `file_exists`
   "cost nothing". `llm` and `baseline` call a judge model. `--threshold` sets the pass score, `1.0` by default.
   The exit code is 0 for pass, 1 for a failed case and 2 for a partial run.
6. **Two formats.** `skill-creator` and `claude plugin eval` use different case formats. Neither tool reads the
   case files of the other. The exact quote is in the table "Long quotes" below.
7. **Mock MCP servers.** `claude plugin eval` can replace an MCP tool with a Markdown file under
   `evals/mocks/<server>/<tool>.md`. So a test of an MCP-based skill does not need the real service.
8. **Sandbox in plugin evals.** When a case grants Bash, "every command runs under Claude Code's OS-level sandbox".
   The `--scaffold` script and the real MCP servers run "as you, outside the run's sandbox".
9. **Agent eval practice.** "Demystifying evals for AI agents" (Anthropic, 2026-01-09) says: "20-50 simple tasks drawn
   from real failures is a great start". It also says: "Each trial should be "isolated" by starting from a clean
   environment." It defines pass@k and pass^k. It warns: "One-sided evals create one-sided optimization."
10. **Tool evals.** "Writing effective tools for agents" (Anthropic, 2025-09-11) says: "Each evaluation prompt should
    be paired with a verifiable response or outcome." The team measured runtime, tool calls, tokens and tool errors.
    The team used held-out test sets.
11. **Model choice.** The Claude page "Choosing the right model" names capabilities, speed, cost and effort as the
    criteria. It says that "Tuning effort is often a better lever than switching models." The first step to compare
    models is a benchmark of your own use case.
12. **MCP tool security.** The MCP spec (2025-11-25) says: "clients **MUST** consider tool annotations to be
    untrusted unless they come from trusted servers." Clients "SHOULD" validate tool results before they pass them
    to the LLM. A human "SHOULD" be able to deny tool invocations.
13. **MCP local servers.** The MCP security best practices name 4 risks of a local server: code execution, no
    visibility, exfiltration, data loss. A client "SHOULD" run a local server "in a sandboxed
    environment with minimal default privileges".
14. **Tool poisoning.** Invariant Labs (2025-04-01) say: "malicious instructions are
    embedded within MCP tool descriptions that are invisible to users." In a rug pull, "a malicious server can change
    the tool description after the client has already approved it."
15. **Prompt injection.** OWASP LLM01:2025 defines indirect prompt injection: an LLM "accepts input from external
    sources, such as websites or files." Two of the controls: least privilege, and "Separate and clearly denote
    untrusted content".
16. **Claude Code on MCP servers.** The Claude Code security page is clear. The page says: "We encourage either writing your own MCP
    servers or using MCP servers from providers that you trust." Anthropic "does not security-audit or manage any MCP
    server."
17. **Skill choice.** arXiv 2601.04748 (Xiaoxiao Li, 2026) says: "selection accuracy remains stable up to a critical
    library size, then drops sharply." It adds: "semantic confusability among similar skills, rather than
    library size alone, plays a central role in this degradation." D28 already cites this paper.

## Long quotes

| Source | Exact quote |
|---|---|
| Trail of Bits, `supply-chain-risk-auditor` | "Do not estimate maintainer counts, downloads, staleness, or CVE history from `gh`, web search, or memory — run the collector, and quote what it measured." |
| Claude Code docs, "Test plugins with evals" | "the skill-creator plugin runs a similar comparison with its own `evals/evals.json` format, and neither tool reads the other's case files." |

## Tools with license and version

Read with `gh api` on 2026-11-10.

| Tool | Version | License | Last push | Use | Note |
|---|---|---|---|---|---|
| `skill-creator` (anthropics/skills) | no release | Apache-2.0 (skill `LICENSE.txt`) | 2026-11-06 | AI: skill evals | a required dependency of guilda (D28) |
| `claude plugin eval` | Claude Code v2.1.269+ | Claude Code terms | n/a | AI: plugin and skill evals, CI | with and without arms, mocks |
| `plugin-dev` (claude-plugins-official) | no release | Apache-2.0 | 2026-11-10 | AI: plugin structure | 7 skills, one is `skill-development` |
| `mcp-server-dev` (claude-plugins-official) | no release | Apache-2.0 | 2026-11-10 | AI: MCP server build | skills `build-mcp-server`, `build-mcp-app`, `build-mcpb` |
| MCP Inspector | 2.14.0 | Apache-2.0, older parts MIT | 2026-11-05 | AI: call an MCP server by hand | repo description: "Deterministic testing tools for MCP servers" |
| promptfoo | 0.125.1 | MIT | 2026-11-09 | AI: evals, red team, MCP tests | set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` |
| garak | v0.17.1 | Apache-2.0 | 2026-11-06 | AI: LLM scanner | optional |
| deepeval | python-v4.2.4 | Apache-2.0 | 2026-11-07 | AI: pytest-style LLM metrics | optional; Python only |
| Snyk Agent Scan (was mcp-scan) | v0.6.11 | Apache-2.0 | 2026-11-09 | AI: scan MCP servers and skills | needs `SNYK_TOKEN`; sends tool descriptions and skill content to the Snyk API |
| osv-scanner | v2.7.1 | Apache-2.0 | 2026-11-09 | code: known vulnerabilities | use `--offline`; never `fix` |
| deps.dev API v3 | n/a | Apache-2.0 (repo) | 2026-10-14 | code: license, advisories, graph | no key in the examples |
| OpenSSF Scorecard | v5.6.0 | Apache-2.0 | 2026-11-10 | code: repository health | needs a GitHub token |
| hyperfine | v2.0.0 | MIT or Apache-2.0 | 2026-11-01 | code: command benchmarks | JSON export |
| pyperf | 2.11.0 | MIT | 2026-11-08 | code: Python benchmarks | `system tune` |
| `supply-chain-risk-auditor` (trailofbits/skills) | no release | CC-BY-SA-4.0 | n/a | code: dependency risk | reference only; a derived text takes the same license |

## One skill or two

**Recommendation: one skill, `lab-experiment`, with one reference file for each kind of subject.** The name is a
proposal, because D25 keeps the names of the lab roles open.

Reasons for one skill:

1. The two kinds share most of the method. Both need the question and the PASS criteria written before. Both need
   the isolation, the dispatched agent (D19), the D34 report and the verdict. Two skills would repeat this core.
2. arXiv 2601.04748 shows that similar skills confuse the choice. Two lab skills would be similar to each other. They
   would also be similar to `ai-evals` (D29) and to the data skill (D25).
3. The Anthropic guide shows "Pattern 2: Domain-specific organization": one `SKILL.md`, and one reference file for
   each domain. The agent reads only the file of its subject.
4. D30 found that a compaction keeps only the first 5,000 tokens of a skill. A lean core with reference files keeps
   the rules inside that limit.

Reasons for two skills, and the answer to each:

1. A brief names its skills (D28), so the choice problem is smaller. Answer: the Architect still chooses the skills
   for the brief, and the Architect sees all descriptions.
2. The AI kind has more content. Answer: the AI content goes into reference files and into `ai-evals`. The core stays
   small.

Do not repeat other skills. The lab skill points to them:

- The statistics (arms, runs, paired analysis, intervals) belong to the data skill of D25.
- The eval suite and the injection test set of an AI artifact belong to `ai-evals` (D29).
- A security question goes to the Security Lead (D37).
- The brief of an AI experiment names three skills: `lab-experiment`, `ai-evals` and `data`.

## Proposed skill structure

```
skills/lab-experiment/
  SKILL.md                  core, about 120 lines
  reference/
    report.md               the D34 report form, with one filled example
    isolation.md            branch, worktree, temp folder, sandbox choice, clean-up record
    code.md                 dependency and technology experiments
    benchmark.md            benchmark method for a library or a tool
    ai.md                   plugin, skill, MCP server, agent setup and model experiments
  evals/
    evals.json              skill-creator cases: 3 or more for each subject kind
    trigger-evals.json      20 queries for the description loop
```

`SKILL.md` holds:

1. When to use the skill, and "Does not" (no product code, no merge, no security verdict).
2. The 8 steps:
   1. Write the question.
   2. Write the hypothesis.
   3. Write the PASS criteria and the stop rule, before any run.
   4. Choose the reference file for the subject.
   5. Make the isolated place.
   6. Run the arms.
   7. Write the D34 report.
   8. Give the verdict and clean up.
3. A table from subject to reference file:
   - library, framework or technology: `code.md`;
   - speed or memory: `benchmark.md`;
   - plugin, skill, MCP server, agent setup or model: `ai.md`.
4. The hard rules, one line each:
   - The PASS criteria exist before the first run.
   - Each attempt starts from a clean state.
   - The report has the agent ID (D19).
   - The experiment never merges code into a product branch.
   - The agent never runs `rm -f` or `rm -rf`. Temporary files go into `mktemp -d` folders. The report lists each
     deletion.
   - No absolute machine path in a file that the project keeps.

`reference/code.md` holds:

1. The necessity check: can the project avoid the dependency?
2. The adoption facts, collected by a command and never from memory:
   - the license and the advisories from deps.dev or osv-scanner `--offline`;
   - the last release and the last commit, from the registry or `gh api`;
   - the number of maintainers;
   - the Scorecard data, only when a token exists.
3. The spike: a throwaway branch `lab/<name>` in its own worktree. The spike code answers the question and is never
   merged. The adoption, if GO, is a new task with a brief.
4. The decision record: the D34 verdict maps to the ADR parts context, decision, status and consequences.

`reference/benchmark.md` holds:

1. The tool: hyperfine for commands, pyperf for Python, the project's own harness in other cases.
2. Warmup runs, 10 or more runs, the same machine state for each arm, and an alternating order of the arms.
3. Median and spread for each arm. The analysis of the data skill (D25) for the effect and its interval.
4. The machine notes: CPU, governor, other load. A result from a noisy machine is MORE DATA, not GO.

`reference/ai.md` holds:

1. For a skill: the `skill-creator` loop with a without-skill baseline. Also the trigger evals, if the experiment
   tests a description.
2. For a plugin: `claude plugin eval` with `--ablation with-without` and a `--threshold` written before. Use
   `--max-cost-usd` as the stop rule. Use mocks for MCP tools.
3. For an MCP server:
   - Read every tool description and look for hidden instructions. Record the hash of the tool list, to detect a
     rug pull.
   - Run the server inside the sandbox runtime, a container or a VM, never directly on the host.
   - Test indirect injection: a tool result that holds an instruction. PASS when the agent does not follow the
     instruction.
   - Check least privilege: the tools and the scopes that the server asks for.
   - Snyk Agent Scan only with the user's approval, because it sends tool descriptions to an outside API.
4. For a model or an agent setup: use the same suite on each arm. Keep the same effort setting, unless effort is
   the variable. Record quality, cost, tokens, turns and latency for each task. Use the current price from the official
   page, with its date (D35).
5. The D29 gate:
   - an eval suite with 3 or more real cases;
   - a threshold written before;
   - a positive difference against a run without the artifact;
   - direct and indirect injection tests;
   - least privilege for tools;
   - a budget for cost, latency and tokens.
6. Optional outside tools, each with its license: promptfoo, garak, deepeval.

## Report shape (D34)

The skill uses the D34 form with no new sections. Each subject kind adds fixed content inside the existing sections.

| D34 section | Code experiment adds | AI experiment adds |
|---|---|---|
| Header line | the subject: name, exact version, license, source URL | the subject: name, version or commit, the model and effort of each arm |
| Hypothesis | the project question that the dependency must answer | the behavior that the artifact must add |
| PASS criteria | the necessity check, the adoption facts with limits, the functional checks, the benchmark limits | the D29 gate items, the threshold, the number of runs, the cost ceiling |
| Method | the worktree branch, the sandbox, the pinned versions | the arms (with and without), the suite path, the judge model, the mocks |
| Evidence | an adoption facts table with the command and date of each fact; benchmark median and spread | the score of each arm, `Δ`, pass^k when consistency matters, tokens and latency, injection results |
| Not verified | each fact that no command could collect | each case that did not run, and why |
| Verdict | GO, conditional GO, NO-GO or MORE DATA, as an ADR status with consequences | the same verdicts; GO also means that the D29 gate passed |
| Lessons | changes to the spec or the brief | changes to the artifact, the suite or `ai-evals` |

## Evals for the lab skill itself

D28 asks for evals at the level of `skill-creator`. The proposal:

1. Three or more cases for each subject kind:
   - code: a real library choice;
   - benchmark: two parsers or two tools;
   - AI: a small skill with a planted bad version, and an MCP server with a poisoned tool description.
2. A baseline without the skill. Assertions: PASS criteria before the first run, isolation, a D34 report with all 8
   sections, no merge, no `rm -f`.
3. The trigger evals: 20 queries. Near misses include an `ai-evals` request, a data analysis and a security review.
4. Runs with Haiku, Sonnet and Opus, as the Anthropic checklist asks.

## Not verified

- A Thoughtworks Technology Radar blip named "spike". The search found none. The Radar entry found is "lightweight
  architecture decision records".
- The SAFe text about the types of spike and the timebox. The text needs a login.
- The extremeprogramming.org page about a "spike solution". The fetch failed with a certificate error.
- Does `claude plugin eval` run a skill that is not part of a plugin? The docs mention a "skills-directory plugin".
  Not tested.
- Does a subagent inherit the Claude Code sandbox? This question is also open in the Security Lead research.
- The telemetry defaults of deepeval and promptfoo. Not read.
- Does the promptfoo MCP plugin work with remote generation off? Not tested.
- Does `@modelcontextprotocol/inspector` need network access? Not read.
- The size of the effect in arXiv 2601.04748 for a library of 5 to 10 skills, the size of guilda. Only the
  abstract was read.

## Source curation (awaiting user approval)

Status: awaiting user approval. The user approves, removes or adds each source before the build of the lab skill
(D28, D36).

| # | Source | Use |
|---|---|---|
| 1 | Anthropic, "Skill authoring best practices" | evals first, 3 or more evals, 3 models, reference files one level deep |
| 2 | `anthropics/skills`, `skill-creator` SKILL.md (Apache-2.0) | the eval loop with baseline, grader, benchmark and trigger evals |
| 3 | Claude Code docs, "Test plugins with evals" | `claude plugin eval`: arms, graders, mocks, threshold, exit codes |
| 4 | Anthropic, "Demystifying evals for AI agents" (2026-01-09) | grader types, pass^k, clean environment for each trial |
| 5 | Anthropic, "Writing effective tools for agents" (2025-09-11) | verifiable outcomes, metrics, held-out sets for tool evals |
| 6 | Claude docs, "Choosing the right model" | criteria for a model comparison, effort before a model change |
| 7 | Claude Code docs, "Security" | MCP server trust, untrusted content practices |
| 8 | Claude Code docs, "Choose a sandbox environment" | isolation choice: Bash sandbox, `srt`, container, VM |
| 9 | MCP spec 2025-11-25, "Tools" | annotations are untrusted, validate tool results, human in the loop |
| 10 | MCP spec, "Security Best Practices" | local server risks, sandbox, scope minimization |
| 11 | Invariant Labs, "Tool Poisoning Attacks" (2025-04-01) | tool poisoning, rug pull, shadowing test cases |
| 12 | OWASP LLM01:2025 Prompt Injection | direct and indirect injection, controls |
| 13 | arXiv 2601.04748 (Xiaoxiao Li, 2026) | skill choice degrades with similar skills: the one-skill decision |
| 14 | OpenSSF, "Concise Guide for Evaluating Open Source Software" | the adoption checklist |
| 15 | OpenSSF Scorecard checks (v5.6.0, Apache-2.0) | repository health checks and their limits |
| 16 | deps.dev API v3 | license, advisories and dependency graph by command |
| 17 | osv-scanner v2.7.1 (Apache-2.0) | known vulnerabilities, offline mode, the `fix` warning |
| 18 | Trail of Bits, `supply-chain-risk-auditor` (CC-BY-SA-4.0) | facts by script, never from memory; reference only |
| 19 | Michael Nygard, "Documenting Architecture Decisions" (2011) | the ADR parts for the verdict |
| 20 | Thoughtworks Radar, "Lightweight architecture decision records" (Adopt, 2018) | ADRs in source control |
| 21 | SAFe, "Spikes" | the spike as a small experiment before implementation |
| 22 | hyperfine v2.0.0 (MIT or Apache-2.0) | warmup, 10 or more runs, outliers, JSON export |
| 23 | pyperf docs, "Tune the system for benchmarks" (MIT) | CPU isolation and the `system tune` command |
| 24 | Kalibera and Jones, "Rigorous Benchmarking in Reasonable Time" (ISMM 2013) | number of repetitions |
| 25 | Git docs, `git worktree` | throwaway worktrees and safe removal |
| 26 | promptfoo 0.125.1 (MIT), red team and MCP testing docs | optional AI evals and MCP attacks |
| 27 | garak v0.17.1 (Apache-2.0) | optional LLM scanner |
| 28 | deepeval python-v4.2.4 (Apache-2.0) | optional pytest-style LLM metrics |
| 29 | Snyk Agent Scan v0.6.11 (Apache-2.0) | optional MCP and skill scan; data goes to an outside API |
| 30 | MCP Inspector 2.14.0 | manual calls to an MCP server under test |
| 31 | `plugin-dev` (claude-plugins-official, Apache-2.0) | plugin and skill structure; D29 base |
| 32 | `mcp-server-dev` (claude-plugins-official, Apache-2.0) | MCP server build practice for test fixtures |

## Source links

- <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- <https://github.com/anthropics/skills/tree/main/skills/skill-creator>
- <https://code.claude.com/docs/en/plugin-evals>
- <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- <https://www.anthropic.com/engineering/writing-tools-for-agents>
- <https://platform.claude.com/docs/en/about-claude/models/choosing-a-model>
- <https://code.claude.com/docs/en/security>
- <https://code.claude.com/docs/en/sandbox-environments>
- <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- <https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices>
- <https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks>
- <https://genai.owasp.org/llmrisk/llm01-prompt-injection/>
- <https://arxiv.org/abs/2601.04748>
- <https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software>
- <https://github.com/ossf/scorecard/blob/main/docs/checks.md>
- <https://docs.deps.dev/api/v3/>
- <https://github.com/google/osv-scanner>
- <https://github.com/trailofbits/skills/tree/main/plugins/supply-chain-risk-auditor>
- <https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions>
- <https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records>
- <https://framework.scaledagile.com/spikes>
- <https://github.com/sharkdp/hyperfine>
- <https://pyperf.readthedocs.io/en/latest/system.html>
- <https://kar.kent.ac.uk/33611/>
- <https://git-scm.com/docs/git-worktree>
- <https://www.promptfoo.dev/docs/red-team/mcp-security-testing/>
- <https://github.com/NVIDIA/garak>
- <https://github.com/confident-ai/deepeval>
- <https://github.com/snyk/agent-scan>
- <https://github.com/modelcontextprotocol/inspector>
- <https://github.com/anthropics/claude-plugins-official/tree/main/plugins/plugin-dev>
- <https://github.com/anthropics/claude-plugins-official/tree/main/plugins/mcp-server-dev>
