# Security Lead research (2026-11-10)

This research is the input for decision D37 in `docs/superpowers/specs/2026-11-09-guilda-decisions.md`.
D37: the Security Lead is an agent that decides security questions with the Architect.
D37 asks for a separate part of the plan with the tools and the knowledge of the Security Lead.

The question: which tools and which knowledge does the Security Lead need in each phase?
Which limits become hooks? What goes into 0.5.0?

The research was translated from Portuguese working notes. The quotes from sources stay in the original English,
word for word.

## Method

- Repository input, read on `feat/0.2`: D1, D16, D28, D29 and D37, `agents/security.md` and
  `core/knowledge/security.md`.
- `core/knowledge/security.md` already cites 5 sources: OWASP Top 10 2025, ASVS 5.0, the webhook Cheat Sheet,
  LLM Top 10 2025, MASVS.
- Web input: primary sources only, read on 2026-11-10.
- The license and the last release of each tool come from `gh api`, on 2026-11-10.

## Findings

1. **CWE Top 25 2025.** The first 4 entries are CWE-79 (XSS), CWE-89 (SQL injection), CWE-352 (CSRF) and CWE-862
   (missing authorization). Use the list as a checklist for code review.
2. **NIST SSDF.** The current version is SP 800-218 v1.1 (February 2022). SP 800-218A adds practices for AI. Use the
   SSDF as a map of practices for the full process.
3. **Threat modeling.** The OWASP Threat Modeling Cheat Sheet gives 4 questions, for example "What are we working
   on?". It links STRIDE to the property that each threat violates. The Cheat Sheet says to do it "early… during
   the design phase".
4. **Proactive Controls.** The published edition is 2024, with the controls C1 to C10. The Security Lead uses them to
   propose requirements in a spec.
5. **CVSS v4.0.** The base score measures severity. The User Guide says that the score "should not be used alone to
   assess risk". The metric groups are Base, Threat and Environmental, with the names CVSS-B and CVSS-BTE. Ranges:
   High 7.0 to 8.9, Critical 9.0 to 10.
6. **SLSA v1.2.** SLSA has two tracks: Build and Source.
7. **OpenSSF Scorecard.** Scorecard v5.6.0 needs a GitHub token. So Scorecard is a tool for the release phase only.
8. **Static analysis (SAST).**
   - Semgrep CE v1.184.0 is LGPL-2.1. Its README says that it analyzes only inside one function or one file.
     The README also says that it "will miss many true positives".
   - The `semgrep-rules` rules are "only for your own internal business purposes". Their license forbids
     redistribution. guilda must not bundle the rules. guilda points to them.
   - The CodeQL CLI v2.27.4 license allows use only on code with an OSI license. The automatic database is only for
     code on GitHub. So CodeQL is out for private projects.
   - By language: Bandit 1.9.4, gosec v2.30.0 and eslint-plugin-security 4.2.1. All three are Apache-2.0.
9. **Secrets.** gitleaks v8.30.1 is MIT. trufflehog v3.99.8 is AGPL-3.0 and verifies credentials live. Live
   verification conflicts with the D16 limits "no real credential" and "no copy of data out of the test environment".
10. **Dependencies and SBOM.**
    - osv-scanner v2.7.1 has an `--offline` mode. Its README warns that the `fix` command "may trigger the package
      manager to execute scripts".
    - pip-audit 2.10.1, Trivy v0.76.2, Grype v0.121.3 and Syft v1.57.1. Each of them is Apache-2.0.
    - tfsec moved into Trivy. Do not use tfsec. For infrastructure as code, use Checkov 3.4.3 (Apache-2.0).
11. **DAST.** The ZAP baseline scan is "passive only" and "doesn't perform any actual 'attacks'". Exit codes: 0 is
    pass, 1 is FAIL, 2 is WARN. The baseline scan needs Docker.
12. **AI.**
    - promptfoo 0.125.1 (MIT) runs local red team tests with `redteam run`. By default, the attack generator uses "a
      separate provider (defaults to OpenAI)". Set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` to stop that.
    - garak v0.17.1 (Apache-2.0) is a scanner for LLM applications.
13. **Anthropic tools.**
    - The `security-guidance` plugin (Apache-2.0) has 3 layers. Layer 1 is a regex check on Edit and Write.
      Layer 2 is an LLM review of the diff at Stop. Layer 3 is an agent review at commit. guilda can use this model.
    - The `claude-security` plugin maps the code, writes a threat model, hunts, and verifies each finding
      independently. Its license is "All rights reserved". guilda can reuse the idea, never the text.
    - `claude-code-security-review` (MIT) has the command file `security-review.md`. Its README says that it is "not
      hardened against prompt injection".
14. **Claude Code sandbox on Linux.**
    - The sandbox isolates with bubblewrap. It puts the network in its own namespace, with a proxy for each domain.
    - `strictAllowlist` with an empty list refuses all network access.
    - The `localhost` of a sandboxed command is private. The command reaches only the servers that it starts. This
      meets the D16 limit "only a local test environment".
    - Hooks and MCP servers run outside the sandbox.
15. **Copilot Autofix.** GitHub says that Autofix can "introduce new vulnerabilities" and needs a human review. This
    supports the rule that the Security Lead only points and never edits.
16. **Trail of Bits skills** (CC-BY-SA-4.0). Ready skills exist: `cvss-scoring`, `insecure-defaults`,
    `supply-chain-risk-auditor`, `variant-analysis`, `fp-check` and `semgrep-rule-creator`. A derived text must use
    the same license.

## Tools with license and version

Read with `gh api` on 2026-11-10.

| Tool | Version | License | Phase | Note |
|---|---|---|---|---|
| Semgrep CE | v1.184.0 | LGPL-2.1 | code review | Rules: Semgrep Rules License v1.0, internal use only, no redistribution |
| CodeQL CLI | v2.27.4 | proprietary | not used | OSI-licensed code only |
| Bandit | 1.9.4 | Apache-2.0 | code review | Python |
| gosec | v2.30.0 | Apache-2.0 | code review | Go |
| eslint-plugin-security | 4.2.1 | Apache-2.0 | code review | JavaScript |
| gitleaks | v8.30.1 | MIT | code review | secrets, local |
| trufflehog | v3.99.8 | AGPL-3.0 | not used | live verification of credentials |
| osv-scanner | v2.7.1 | Apache-2.0 | code review | use `--offline` |
| pip-audit | 2.10.1 | Apache-2.0 | code review | Python dependencies |
| Trivy | v0.76.2 | Apache-2.0 | release | dependencies, images, IaC |
| Grype | v0.121.3 | Apache-2.0 | release | scans an SBOM |
| Syft | v1.57.1 | Apache-2.0 | release | makes an SBOM |
| ZAP | v2.17.0 | Apache-2.0 | test | baseline scan is passive |
| Checkov | 3.4.3 | Apache-2.0 | release | IaC |
| tfsec | deprecated | n/a | not used | moved into Trivy |
| promptfoo | 0.125.1 | MIT | test | set `PROMPTFOO_DISABLE_REMOTE_GENERATION` |
| garak | v0.17.1 | Apache-2.0 | later | LLM scanner |
| OpenSSF Scorecard | v5.6.0 | Apache-2.0 | release | needs a GitHub token |
| `trailofbits/skills` | n/a | CC-BY-SA-4.0 | reference | audit each skill before use (D28) |
| `claude-security` plugin | n/a | All rights reserved | reference | reuse the idea only |
| `security-guidance` plugin | n/a | Apache-2.0 | reference | 3-layer model |
| `claude-code-security-review` | n/a | MIT | reference | not hardened against prompt injection |

## Recommendation by phase

1. **Spec.** Write a threat model with the 4 questions and STRIDE for each security zone. Take requirements from ASVS
   and the Proactive Controls. Send an open question to the Lab.
2. **Code review.** Run gitleaks and Semgrep CE. Semgrep findings are suspicions and do not block alone. Run Bandit,
   gosec or eslint-plugin-security for the language. Run osv-scanner `--offline`, pip-audit or `npm audit`. Then
   the Security Lead confirms each finding in the diff (SEC3), as `claude-security` does.
3. **Test.** The red team and the blue team run the ZAP baseline scan against the local app. For the risk area `ai`,
   they run promptfoo with remote generation off, or garak.
4. **Release.** Make the SBOM with Syft. Scan it with Grype or Trivy. Run Checkov for IaC. Run Scorecard only if the
   project is on GitHub and the user gives the token.

## Decision method

Risk is probability times impact. The CVSS-B score is one input only.

- **Block:** a reachable Critical or High finding, a secret in the code, or a missing authorization check in a zone.
- **Accept with a note:** each other finding. The acceptance goes into the record.
- **Ask the user in plain words.** Examples: "Who can see this?", "What happens if a stranger does X?", "Do you
  accept risk Y until version Z?"

## Limits as hooks

D28 says that the text of a skill is not a safety control. So each limit is a `PreToolUse` hook that filters on
`agent_type`.

- The sandbox is on, with `failIfUnavailable`, `allowUnsandboxedCommands: false` and an empty `strictAllowlist`.
- The hook denies trufflehog with verification, `osv-scanner fix`, and `curl` or `ssh` to an outside host.
- The hook denies reads of `~/.ssh` and `.env*` files.
- The hook requires `Risk area` not equal to `none` and a recorded approval of the user.

## Scope of 0.5.0

- In 0.5.0: the Security Lead agent with the knowledge files `threat-model.md`, `rating.md`, `tools.md`,
  `cwe-top25.md`, `supply-chain.md` and `llm.md`. Also the code review tools and the ZAP baseline scan.
- After 0.5.0: fuzzing, CodeQL, garak, Scorecard and a team of many attack agents.

## Not verified

- Does a subagent inherit the sandbox? The Claude Code docs do not say. A lab must test it.
- The Low and Medium ranges of CVSS v4. The page did not show them.
- The method of the CWE Top 25.
- Is there a newer revision of the SSDF?
- The version of the OWASP Code Review Guide. It is a "Lab Project" with no date.
- The quality of the Trail of Bits skills. Each skill needs an audit (D28).

## Source curation (awaiting user approval)

Status: awaiting user approval. The user approves, removes or adds each source before the build of a security skill
(D28, D37).

| # | Source | Use |
|---|---|---|
| 1 | OWASP Top 10 2025 | base categories (already in `core/knowledge/security.md`) |
| 2 | OWASP ASVS 5.0 | verifiable requirements for each level |
| 3 | OWASP Proactive Controls 2024 | requirements in the spec phase |
| 4 | OWASP Cheat Sheet Series | how to fix each type of problem |
| 5 | OWASP Threat Modeling Cheat Sheet | the 4 questions and STRIDE |
| 6 | OWASP Top 10 for LLM Applications 2025 | the risk area `ai` (already in the knowledge file) |
| 7 | CWE Top 25 2025 | review checklist |
| 8 | NIST SP 800-218 (SSDF) | practices for the full process |
| 9 | NIST SP 800-218A | SSDF addition for AI |
| 10 | CVSS v4.0 User Guide | severity, which is not risk |
| 11 | SLSA v1.2 | build provenance |
| 12 | OpenSSF Scorecard | health of the repository and of the dependencies |
| 13 | Semgrep CE and the Semgrep Rules License | SAST and its limits of use |
| 14 | CodeQL terms | the reason that CodeQL is out for private projects |
| 15 | Bandit | SAST for Python |
| 16 | gosec | SAST for Go |
| 17 | eslint-plugin-security | SAST for JavaScript |
| 18 | gitleaks | secrets, local, MIT |
| 19 | osv-scanner | dependency scan with an offline mode |
| 20 | pip-audit | dependency scan for Python |
| 21 | Trivy | dependencies, images and IaC (replaces tfsec) |
| 22 | Syft and Grype | SBOM and its scan |
| 23 | Checkov | IaC |
| 24 | ZAP baseline scan | passive local DAST |
| 25 | promptfoo red team | injection tests for AI |
| 26 | garak | LLM scanner |
| 27 | `security-guidance` plugin | the 3-layer model (Apache-2.0) |
| 28 | `claude-code-security-review` | the warning about prompt injection |
| 29 | Claude Code sandboxing docs | the base of the limit hooks |
| 30 | GitHub "Responsible use of Copilot Autofix" | a human reviews each fix |
| 31 | Trail of Bits skills | reference only, with care because of CC-BY-SA-4.0 |

## Source links

- <https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html>
- <https://csrc.nist.gov/pubs/sp/800/218/final>
- <https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html>
- <https://top10proactive.owasp.org/>
- <https://www.first.org/cvss/v4.0/user-guide>
- <https://slsa.dev/spec/>
- <https://github.com/ossf/scorecard>
- <https://github.com/semgrep/semgrep>
- <https://semgrep.dev/legal/rules-license>
- <https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md>
- <https://github.com/google/osv-scanner>
- <https://www.zaproxy.org/docs/docker/baseline-scan/>
- <https://www.promptfoo.dev/docs/red-team/quickstart/>
- <https://github.com/NVIDIA/garak>
- <https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance>
- <https://github.com/anthropics/claude-code-security-review>
- <https://code.claude.com/docs/en/sandboxing>
- <https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/responsible-use-autofix-code-scanning>
- <https://github.com/trailofbits/skills>
