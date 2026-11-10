# Token use of the 0.2 design session (2026-11-09/10)

This is the first record for D35. It counts the tokens of one Claude Code session and gives the cost in USD and
BRL. The session did two blocks of work:

- Part 1 work on 2026-11-02.
- The design session of 0.1.1, 0.2.0 and later releases on 2026-11-09 and 2026-11-10 (specs, labs, research,
  reviews).

The user pays with a subscription. The costs below are the API-equivalent cost at list prices. They are not the
amount that the user paid.

## Totals

Claude tokens, all sources (main session, subagents, headless `claude -p` runs of the labs):

| Period | Calls | Input | Cache write | Cache read | Output | Total tokens | USD | BRL |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Design session (2026-11-09/10) | 1,262 | 2,932 | 9,964,516 | 212,533,672 | 1,181,350 | 223,682,470 | 124.72 | 687.81 |
| Part 1 (2026-11-02) | 123 | 256 | 708,830 | 10,048,590 | 267,236 | 11,024,912 | 11.67 | 64.36 |

- Cache reads are 95% of the tokens of the design session and 91% of Part 1.
- Codex (external-agent lab, 2026-11-09): 1,152,024 tokens more (734,429 in 17 lab turns, 417,595 in probes,
  app-server and TUI threads), about 88% cached input. This number comes from the lab report. It has no USD
  value here (see "Not counted").

Cost by token kind, design session:

| Kind | USD | Share |
|---|---:|---:|
| Cache write, 5 minutes | 27.23 | 22% |
| Cache write, 1 hour | 32.80 | 26% |
| Cache read | 42.24 | 34% |
| Output | 22.44 | 18% |
| Input (not cached) | 0.01 | 0% |

Part 1: cache write 5 minutes 2.26, cache write 1 hour 2.06, cache read 2.01, output 5.34 (USD).

## Main session, subagents and headless runs

| Period | Source | Calls | Cache write 5m | Cache write 1h | Cache read | Output | Total tokens | USD | BRL |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Design | Main session | 337 | 0 | 4,003,615 | 127,214,056 | 332,479 | 131,551,070 | 64.12 | 353.62 |
| Design | Subagents (53) | 837 | 5,662,805 | 0 | 84,059,986 | 783,652 | 90,508,175 | 59.09 | 325.83 |
| Design | Headless `claude -p` (18 transcripts) | 88 | 0 | 298,096 | 1,259,630 | 65,219 | 1,623,225 | 1.51 | 8.35 |
| Part 1 | Main session | 70 | 0 | 257,125 | 6,446,361 | 110,304 | 6,813,940 | 5.55 | 30.62 |
| Part 1 | Subagents (5) | 53 | 451,705 | 0 | 3,602,229 | 156,932 | 4,210,972 | 6.12 | 33.74 |

The main session writes its cache with a 1-hour lifetime. Subagents write it with a 5-minute lifetime. Headless
runs use the 1-hour lifetime.

Subagents of the design session by type:

| Type | Agents | Total tokens | Cache write | USD |
|---|---:|---:|---:|---:|
| general-purpose | 38 | 66,730,270 | 3,272,767 | 42.98 |
| fork | 12 | 22,909,424 | 2,231,786 | 16.07 |
| claude-code-guide | 2 | 843,963 | 139,317 | 0.04 |
| web-fetch | 1 | 24,518 | 18,935 | 0.00 |

## By model

| Period | Model | Calls | Total tokens | USD | BRL |
|---|---|---:|---:|---:|---:|
| Design | claude-opus-5-5 | 1,156 | 221,125,419 | 123.16 | 679.19 |
| Design | claude-sonnet-5-5 | 73 | 1,329,106 | 1.49 | 8.21 |
| Design | claude-haiku-5-5 | 33 | 1,227,945 | 0.07 | 0.40 |
| Part 1 | claude-opus-5-5 | 123 | 11,024,912 | 11.67 | 64.36 |

Sonnet ran only in headless lab runs. Haiku ran in the two claude-code-guide subagents, in one small test
subagent and in headless lab runs. All model IDs in the data have a listed price.

## Biggest consumers (design session)

| Consumer | Total tokens | USD |
|---|---:|---:|
| Main session | 131,551,070 | 64.12 |
| Subagent: run external agent (Codex) lab | 10,510,592 | 4.51 |
| Subagent: restyle guilda panel like agent list | 7,683,787 | 4.13 |
| Fork (one question, 4 calls) | 2,434,622 | 3.35 |
| Fork (one question, 2 calls) | 1,220,463 | 3.08 |
| Fork (one question, 1 call) | 606,400 | 2.94 |
| Subagent: fix spec per cold review, split by release | 2,752,388 | 2.79 |
| Subagent: run block index lab (A and B) | 3,614,732 | 2.69 |
| Subagent: run Architect-as-agent lab | 3,157,893 | 2.22 |
| Fork (one question, 1 call) | 449,328 | 2.15 |

A fork starts with the full context of the main session. Its first call writes that context to a new cache,
about 420,000 to 585,000 tokens. That write costs USD 2 to 3 before the fork does any work. A fork with one
or two calls costs more than most general-purpose subagents with 20 or more calls.

The largest headless lab runs were the Architect-as-agent arms (`arch-haKM-a`: 389,246 tokens, USD 0.46;
`arch-haKM-b`: 390,955 tokens, USD 0.52).

## Method

- Data: the JSONL transcript of the main session, the JSONL transcripts of its subagents, and the JSONL
  transcripts of the headless `claude -p` sessions. The headless sessions are the project folders that Claude
  Code created for the lab folders of this session (named `guilda-test-...`): 18 transcript files in 14 folders.
  Three more folders (`guilda-test-trace-eXfy-arm1`, `guilda-test-trace-eXfy-arm2`, `smoke-guilda-test-proj`)
  have no transcript.
- Each assistant entry has `message.usage` and `message.model`. The script reads `input_tokens`,
  `cache_creation_input_tokens` (split into 5-minute and 1-hour by `cache_creation`), `cache_read_input_tokens`
  and `output_tokens`.
- Claude Code writes one entry per content block, so one API call can appear on several lines with the same
  `message.id`. The script counts each `message.id` once. 1,402 repeated entries were skipped. The repeated
  entries had the same usage numbers as the first.
- Entries with the model `<synthetic>` have no usage and are skipped.
- The period comes from the entry timestamp in UTC-3. 2026-11-02 is Part 1. 2026-11-09 and 2026-11-10 are the
  design session. No entry fell outside these dates.
- Cost per call = sum of (tokens of each kind x price of that kind for the model). All calls had the speed
  `standard`. Haiku 5.5 has a higher price above 100,000 prompt tokens. No Haiku call passed that limit.
- The count stopped on 2026-11-10 at about 02:33 (UTC-3). The session was still open.
- The script is a small Node.js file with no dependencies. It is not in the repository.

## Prices and exchange rate

Prices: Anthropic, "Pricing", https://platform.claude.com/docs/en/about-claude/pricing, read on 2026-11-10.
USD per million tokens:

| Model | Input | Cache write 5m | Cache write 1h | Cache read | Output |
|---|---:|---:|---:|---:|---:|
| Claude Opus 5.5 | 4 | 5 | 8 | 0.20 | 20 |
| Claude Sonnet 5.5 | 2 | 2.50 | 4 | 0.10 | 10 |
| Claude Haiku 5.5 (prompt up to 100,000 tokens) | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 |

Exchange rate: Banco Central do Brasil, PTAX, USD sell rate of 2026-11-09 (the last business day with a
published rate): 5.5146 BRL per USD. Source: the PTAX OData service,
https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='11-09-2026'&$format=json
(read on 2026-11-10; the rate of 2026-11-10 was not published yet).

## Not counted

- Codex tokens have no cost here. They use OpenAI prices, which are not in this record. The token count is
  above.
- The Claude Code CLI reported USD 0.73 for the headless Architect of the external-agent lab. This record gives
  USD 0.08 for the same 129,112 tokens at the Sonnet 5.5 list price. The CLI number was not checked.
- Work of other sessions on the same project (other days, other machines) is not counted.
- Tokens of the Claude Code harness that do not appear in `message.usage` (for example, a title or summary
  call) are not counted, if any exist.
- The subagent that made this record is counted only up to the time of the count.
- Prices are list prices of the date above. Discounts, the Batch API and the subscription are not used.
